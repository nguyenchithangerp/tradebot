const Binance = require('node-binance-api');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Thiết lập logging
const logFile = path.join(__dirname, 'logs', 'trade_log.txt');
function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;
    console.log(logMessage.trim());
    fs.appendFileSync(logFile, logMessage);
}

// Đọc cấu hình từ biến môi trường
function loadConfig() {
    try {
        const config = {
  
            api_key: process.env.BINANCE_API_KEY,
            api_secret: process.env.BINANCE_API_SECRET,
            symbol: process.env.SYMBOL,
            lower_price: parseFloat(process.env.LOWER_PRICE),
            upper_price: parseFloat(process.env.UPPER_PRICE),
            grid_levels: parseInt(process.env.GRID_LEVELS, 10),
            total_investment: parseFloat(process.env.TOTAL_INVESTMENT),
            grid_type: process.env.GRID_TYPE,
            trigger_price: parseFloat(process.env.TRIGGER_PRICE),
            take_profit: parseFloat(process.env.TAKE_PROFIT),
            stop_loss: parseFloat(process.env.STOP_LOSS),
            trailing_up: process.env.TRAILING_UP === 'true',
            sell_all_on_stop: process.env.SELL_ALL_ON_STOP === 'true'
        };
        if (!config.api_key || !config.api_secret) {
            throw new Error('Thiếu API_KEY hoặc API_SECRET');
        }
        log('Đã tải cấu hình từ biến môi trường');
        return config;
    } catch (error) {
        log(`Lỗi khi đọc cấu hình: ${error.message}`);
        return null;
    }
}

// // Kết nối với Binance
// function initializeExchange(config) {
//     const binance = new Binance().options({
//         APIKEY: config.api_key,
//         APISECRET: config.api_secret,
//         useServerTime: true,
//         recvWindow: 60000,
//     });
//     log('Kết nối với Binance thành công');
//     return binance;
// }
function initializeExchange(config) {
    const binance = new Binance().options({
        APIKEY: config.api_key,
        APISECRET: config.api_secret,
        useServerTime: true,
        test: true,  // Cho phép testnet (thay vì base URL thủ công)
        recvWindow: 60000
    });

    log('Kết nối với Binance Testnet thành công');
    return binance;
}


// Thiết lập lưới
function setupGrid(config, gridType) {
    const grid = {
        symbol: config.symbol,
        lower_price: config.lower_price,
        upper_price: config.upper_price,
        grid_levels: config.grid_levels,
        amount_per_order: config.total_investment / config.grid_levels / config.lower_price,
        trigger_price: config.trigger_price,
        take_profit: config.take_profit,
        stop_loss: config.stop_loss,
        trailing_up: config.trailing_up,
        sell_all_on_stop: config.sell_all_on_stop,
        price_levels: [],
    };

    if (gridType === 'arithmetic') {
        const priceStep = (grid.upper_price - grid.lower_price) / grid.grid_levels;
        for (let i = 0; i < grid.grid_levels; i++) {
            grid.price_levels.push(grid.lower_price + i * priceStep);
        }
    } else if (gridType === 'geometric') {
        const ratio = Math.pow(grid.upper_price / grid.lower_price, 1 / grid.grid_levels);
        for (let i = 0; i < grid.grid_levels; i++) {
            grid.price_levels.push(grid.lower_price * Math.pow(ratio, i));
        }
    }

    log(`Thiết lập lưới ${gridType}: ${JSON.stringify(grid)}`);
    return grid;
}

// Kiểm tra số dư
async function checkBalance(binance, currency) {
    try {
        const balances = await binance.balance();
        const available = balances[currency].available;
        log(`Số dư ${currency} khả dụng: ${available}`);
        return parseFloat(available);
    } catch (error) {
        log(`Lỗi khi kiểm tra số dư ${currency}: ${error.message}`);
        return 0;
    }
}

// Đặt lệnh mua và bán
async function placeOrders(binance, grid, currentPrice) {
    const orders = [];
    for (const price of grid.price_levels) {
        const buyPrice = price;
        const sellPrice = grid.price_levels.includes(price * 1.01) ? price * 1.01 : price + (grid.upper_price - grid.lower_price) / grid.grid_levels;

        if (currentPrice > buyPrice) {
            try {
                const order = await binance.limitBuy(grid.symbol, grid.amount_per_order, buyPrice);
                orders.push(order);
                log(`Đặt lệnh mua tại giá ${buyPrice} với số lượng ${grid.amount_per_order}`);
            } catch (error) {
                log(`Lỗi khi đặt lệnh mua tại ${buyPrice}: ${error.message}`);
            }
        }

        if (currentPrice < sellPrice) {
            try {
                const order = await binance.limitSell(grid.symbol, grid.amount_per_order, sellPrice);
                orders.push(order);
                log(`Đặt lệnh bán tại giá ${sellPrice} với số lượng ${grid.amount_per_order}`);
            } catch (error) {
                log(`Lỗi khi đặt lệnh bán tại ${sellPrice}: ${error.message}`);
            }
        }
    }
    return orders;
}

// Hủy tất cả lệnh mở
async function cancelAllOrders(binance, symbol) {
    try {
        const openOrders = await binance.openOrders(symbol);
        for (const order of openOrders) {
            await binance.cancel(symbol, order.orderId);
            log(`Hủy lệnh ${order.orderId} thành công`);
        }
    } catch (error) {
        log(`Lỗi khi hủy lệnh: ${error.message}`);
    }
}

// Bán toàn bộ khi dừng
async function sellAll(binance, symbol, baseCurrency) {
    try {
        const balance = await checkBalance(binance, baseCurrency);
        if (balance > 0) {
            const order = await binance.marketSell(symbol, balance);
            log(`Bán toàn bộ ${balance} ${baseCurrency} tại giá thị trường`);
            return order;
        }
    } catch (error) {
        log(`Lỗi khi bán toàn bộ: ${error.message}`);
    }
}

// Hàm chính
async function runGridBot() {
     console.log("✅ Đang chạy");
    const config = loadConfig();
    if (!config) return;

    const binance = initializeExchange(config);
    const grid = setupGrid(config, config.grid_type);
    let isActive = false;

    while (true) {
        try {
            // Lấy giá hiện tại
            const ticker = await binance.prices(grid.symbol);
            const currentPrice = parseFloat(ticker[grid.symbol]);
            log(`Giá hiện tại của ${grid.symbol}: ${currentPrice}`);

            // Kiểm tra số dư
            const baseCurrency ="BTC";// grid.symbol.split('/')[0]; // BTC
            const quoteCurrency ="USDT";// grid.symbol.split('/')[1]; // USDT
            console.log("✅ Kiểm tra số dư baseCurrency: " + baseCurrency + "  quoteCurrency: "+ quoteCurrency );
            
            const baseBalance = await checkBalance(binance, "BTC");
            // const baseBalance = await checkBalance(binance, baseCurrency);
            // const quoteBalance = await checkBalance(binance, quoteCurrency);

            // Kiểm tra kích hoạt lưới
            if (!isActive && currentPrice >= grid.trigger_price) {
                log('Kích hoạt bot: Giá thị trường đạt giá kích hoạt');
                isActive = true;
            }

            if (isActive) {
                // Kiểm tra chốt lời (TP) và cắt lỗ (SL)
                if (currentPrice >= grid.take_profit) {
                    log('Chạm TP, dừng bot');
                    if (grid.sell_all_on_stop) await sellAll(binance, grid.symbol, baseCurrency);
                    break;
                }
                if (currentPrice <= grid.stop_loss) {
                    log('Chạm SL, dừng bot');
                    if (grid.sell_all_on_stop) await sellAll(binance, grid.symbol, baseCurrency);
                    break;
                }

                // Trailing Up
                if (grid.trailing_up && currentPrice > grid.upper_price) {
                    log('Giá vượt khung, dời lưới lên');
                    config.lower_price = currentPrice - (grid.upper_price - grid.lower_price);
                    config.upper_price = currentPrice;
                    grid = setupGrid(config, config.grid_type);
                }

                // Kiểm tra số dư
                if (quoteBalance < grid.amount_per_order * grid.lower_price) {
                    log('Số dư USDT không đủ, dừng bot');
                    break;
                }
                if (baseBalance < grid.amount_per_order) {
                    log('Số dư BTC không đủ, dừng bot');
                    break;
                }

                // Hủy và đặt lại lệnh
                await cancelAllOrders(binance, grid.symbol);
                await placeOrders(binance, grid, currentPrice);
            }

            // Hiển thị trạng thái mỗi phút
            const openOrders = await binance.openOrders(grid.symbol);
            log(`Trạng thái: Giá=${currentPrice}, USDT=${quoteBalance}, BTC=${baseBalance}, Lệnh mở=${openOrders.length}`);

            // Chờ 1 phút
            console.log("✅ Chờ 1 phút");
            await new Promise(resolve => setTimeout(resolve, 60000));

        } catch (error) {
            log(`Lỗi trong vòng lặp chính: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }
}

// Chạy bot
runGridBot().catch(error => log(`Lỗi khi chạy bot: ${error.message}`));
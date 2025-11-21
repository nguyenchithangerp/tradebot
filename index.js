
const ccxt = require('ccxt');
const moment = require('moment');
//const delay = require('delay');

const apiKey = '33F9QEM3XBhh2IG2PbY3AIVERfavPaBuEVBYBcdc57sOFYiBfWFBV4gPMZxIQTPv';
const secret = 'PyukW80UHI69L5kN8ynrqhVXQPKlOnoFeAsTmSIiNf9sS3aYr6bVIJLAlyZY2wcR';

const binance = new ccxt.binance({
    apiKey: apiKey,
    secret: secret,
  //  enableRateLimit: true,
});
binance.setSandboxMode(true);

async function printBalance() {
    const balance = await binance.fetchBalance();     // Lấy số dư
    const total = balance.total;                      // Lấy tổng số dư từng loại coin
    console.log(`Balance: BTC ${total.BTC}`);         // In số dư BTC
  }

async function runBot() {
    try {
        const symbol_BTC = 'BTC/USDT';
        const market_BTC = await binance.fetchTicker(symbol_BTC);
        const price_BTC_last = market_BTC.last;
        const price_BTC_open = market_BTC.open;
        const balance = market_BTC.balance;
        console.log(`Balance: BTC ${balance.BTC}`);  

        // const balance = await binance.fetchBalance();     // Lấy số dư
        // const total = balance.total;                      // Lấy tổng số dư từng loại coin
        // console.log(`Balance: BTC ${total.BTC}`);         // In số dư BTC

        console.log(`Giá BTC/USDT hiện tại: ${price_BTC_last} USDT`);

        const lowPrice_BTC = 90000; // Mua nếu giá thấp hơn
        const highPrice_BTC = 95000; // Bán nếu giá cao hơn

        const amount_BTC = 0.001; // Số BTC muốn mua/bán

        if (price_BTC_last < lowPrice_BTC) {
            console.log(`Giá thấp hơn ${lowPrice_BTC}, tiến hành MUA`);
            //const order_BTC = await binance.createMarketBuyOrder(symbol_BTC, amount_BTC);
            //console.log('Đã đặt lệnh mua:', order);
        } else if (price_BTC_last > highPrice_BTC) {
            console.log(`Giá cao hơn ${highPrice_BTC}, tiến hành BÁN`);
            //const order_BTC = await binance.createMarketSellOrder(symbol_BTC, amount_BTC);
            //console.log('Đã đặt lệnh bán:', order_BTC);
        } else {
            console.log('Chờ tín hiệu...');
        }

    } catch (error) {
        console.error('Lỗi:', error.message);
    }
}

// async function main(){
//     while(true){
//         await runBot();
//         await delay(60*1000);
//     }

// }
// main()
// Chạy bot mỗi phút
printBalance();
//setInterval(runBot, 60 * 1000);


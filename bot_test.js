// Cài đặt: npm install node-binance-api
const Binance = require('node-binance-api');
const binance = new Binance().options({
    APIKEY:'CawP383LoZTw0gcm3NKPu06uwllU77UDlo6q7AIHzR9DBcax9RRzNgfJP9eZz5sW',
 APISECRET:'JIsUR2yuWavxtG2OLD4m0dJ2OEQ02mp50Uov6KKPGdYvELixnhC3e7N9415CJIYl',
  useServerTime: true,
  test: false,
  recvWindow: 60000,
  urls: {
    base: 'https://testnet.binance.vision/api/',
    stream: 'wss://testnet.binance.vision/ws/',
  }
});

const CONFIG = {
  symbol: 'BTCUSDT',
  buyAmountBTC: 0.002, // minLot =0.00001  ; 0.001 ~ 108 
  priceDiff: 353, // Giá giảm USDT 0.2% =0.002
  priceDiffSell: 200, // Giá tăng USDT 0.2% =0.002
  checkInterval: 10000, // ms
};

let lastPrices = []; // Lưu giá 1 phút trước
let openBuyOrders = []; // Lưu lệnh đã mua (giá, số lượng USDT, số lượng USDT, phí mua)
let buySellHis = []; // Lưu lệnh đã mua (lệnh số,cặp coin, loại(mua/bán), giá usdt, số lượng khớp lệnh coin, vai trò, Phí coin, tổng USDT, thời gian)
let lenhAll = 0, lenhBuy = 0, lenhSell = 0; // Biến lưu số lệnh
let initialTotalUSDTAndBTC = null;initialTotalUSDT = null; initialTotalBTC = null  // Tổng tài sản ban đầu quy đổi USDT
let commissionAll = 0, commissionBuy = 0, commissionSell = 0; commissionSellPercent = 0.001;commissionBuyPercent = 0.001// Biến lưu phí giao dịch


async function getCurrentPrice() {
  const ticker = await binance.prices(CONFIG.symbol);
  return parseFloat(ticker[CONFIG.symbol]);
}



async function placeBuyOrder(price) {
  try {
    const order = await binance.marketBuy(CONFIG.symbol, CONFIG.buyAmountBTC);

    
    const trades = await binance.trades(CONFIG.symbol);
    const lastTrade = trades.reverse().find(t => t.isBuyer);

    let commission = 0;
    let commissionAsset = CONFIG.quoteAsset || 'USDT';

    if (lastTrade) {
      commission = parseFloat(lastTrade.commission);
      commissionAsset = lastTrade.commissionAsset;
    }

    // Hoặc tính lại phí theo cấu hình
    commission = CONFIG.buyAmountBTC * price * commissionBuyPercent;
    commissionBuy += commission;
    commissionAll += commission;

    lenhAll += 1;
    lenhBuy += 1;

    openBuyOrders.push({ price, quantity: CONFIG.buyAmountBTC });

    console.log(`🟢 Đã MUA ${CONFIG.buyAmountBTC} BTC @ ${price} USDT`);
    console.log(`💸 Phí giao dịch MUA: ${commission} ${commissionAsset}`);
  } catch (e) {
    console.error('❌ LỖI ĐẶT LỆNH MUA:', e.body || e.message || e);
  }
}


async function placeSellOrder(price, quantity) {
  try {
    const order = await binance.marketSell(CONFIG.symbol, quantity);

    // Lấy lịch sử giao dịch gần nhất
    const trades = await binance.trades(CONFIG.symbol);
    const lastTrade = trades.reverse().find(t => !t.isBuyer); // giao dịch bán gần nhất

    let commission = 0;
    let commissionAsset = CONFIG.quoteAsset || 'USDT';

    if (lastTrade) {
      // Nếu muốn lấy từ dữ liệu trả về:
      // commission = parseFloat(lastTrade.commission);
      commissionAsset = lastTrade.commissionAsset;
    }

    // Ưu tiên tính lại theo cấu hình
    commission = quantity * price * commissionSellPercent;

    commissionSell += commission;
    commissionAll += commission;
    lenhAll += 1;
    lenhSell += 1;

    console.log(`🔴 Đã BÁN ${quantity} BTC @ ${price} USDT`);
    console.log(`💸 Phí giao dịch BÁN: ${commission.toFixed(6)} ${commissionAsset}`);

  } catch (e) {
    console.error('❌ LỖI ĐẶT LỆNH BÁN:', e?.body || e?.message || JSON.stringify(e));
  }
}

async function banHetBTC() {
  try {
    // Lấy số dư BTC hiện tại
    const balances = await binance.balance();
    let btcBalance = parseFloat(balances.BTC.available);
    
    if (btcBalance > 0.0001 && btcBalance >=1) { // tránh lỗi "dust" (số quá nhỏ)
      // Lấy giá BTC/USDT thị trường hiện tại
      const ticker = await binance.prices('BTCUSDT');
      const marketPrice = parseFloat(ticker.BTCUSDT);

      // Tính toán lượng USDT sẽ nhận được
      console.log(`Bán ${btcBalance} BTC với giá ${marketPrice} USDT`);

      // Đặt lệnh market bán toàn bộ BTC đã mua - 1 BTC đã có
      btcBalance =btcBalance - 1;
      const sellResult = await binance.marketSell('BTCUSDT', btcBalance.toFixed(4));
      console.log('Kết quả bán:', sellResult);
    } else {
      console.log('Không có BTC để bán.');
    }
  } catch (err) {
    console.error('Lỗi khi bán BTC:', err.body || err.message);
  }
}


async function printStatus(currentPrice) {
  const balances = await binance.balance();
  const usdt = parseFloat(balances.USDT.available);
  const btc = parseFloat(balances.BTC.available);

  if (initialTotalUSDTAndBTC === null) {
    initialTotalUSDTAndBTC = usdt + (btc * currentPrice);
  }

  const holdingsValue = openBuyOrders.reduce(
    (acc, order) => acc + (currentPrice * order.quantity), 0
  );
  const costValue = openBuyOrders.reduce(
    (acc, order) => acc + (order.price * order.quantity), 0
  );
  const pnl = holdingsValue - costValue;

  let currentTotalUSDTAndBTC =usdt + (btc * currentPrice);
  let  pnl2 = currentTotalUSDTAndBTC - initialTotalUSDTAndBTC;
 console.log(`\n ====== ${new Date().toISOString().replace('T', ' ').substring(0, 19)} ====`);
  console.log(`📊 Giá BTC hiện tại: ${currentPrice} USDT`);
  console.log(`📈 Tài sản Ban đầu/Hiện tại: ${initialTotalUSDTAndBTC.toFixed(0)} / ${currentTotalUSDTAndBTC.toFixed(0)} USDT`);
 // console.log(`📈 Tổng tài sản theo USDT: ${(usdt + (btc * currentPrice)).toFixed(2)} USDT`);
  console.log(`💰 Chi tiết coin: USDT: ${usdt.toFixed(4)}; BTC: ${btc.toFixed(4)}`);
  console.log(`🪙 BTC mua (mô phỏng): ${openBuyOrders.reduce((sum, o) => sum + o.quantity, 0).toFixed(6)} BTC`);
  console.log(`🧾 Tổng giá trị (giả lập): ${holdingsValue.toFixed(2)} USDT`);
  console.log(`📊 Lãi/Lỗ (P&L): ${pnl >= 0 ? '🔺' : '🔻'} ${pnl.toFixed(2)} USDT`);
  console.log(`📊 Lãi/Lỗ (P&L) CII: ${pnl >= 0 ? '🔺' : '🔻'} ${pnl2.toFixed(2)} USDT`);
   console.log(`💸 Tổng phí giao dịch: ${commissionAll.toFixed(6)} BTC (Mua: ${commissionBuy.toFixed(6)}, Bán: ${commissionSell.toFixed(6)})`);
   console.log(`💸 Tổng lệnh: ${lenhAll.toFixed(0)}  (Mua: ${lenhBuy.toFixed(0)}, Bán: ${lenhSell.toFixed(0)})`);
   console.log(`📦 Lệnh mua đang giữ: ${openBuyOrders.length}`);
  console.log('------------------------------');
}
function chienluocmua() {

    if (lastPrices.length > 6) lastPrices.shift(); // Giữ giá 1 phút (6 x 10s)

    // MUA nếu giảm >= 10 USDT so với 1 phút trước
     oldPrice = lastPrices[0];
    if (oldPrice && oldPrice - currentPrice >= CONFIG.priceDiff) {
      console.log(`📉 Giá giảm ${oldPrice - currentPrice} USDT, tiến hành MUA.`);
      return true; // tín hiệu mua
      
    }
    
    // MUA nếu giảm >= 10 USDT*2 so với 2 phút trước
    if (lastPrices.length > 12) lastPrices.shift(); // Giữ giá 1 phút (12 x 10s)
     oldPrice = lastPrices[0];
    if (oldPrice && oldPrice - currentPrice >= CONFIG.priceDiff *2 ) {
      console.log(`📉 Giá giảm ${oldPrice - currentPrice} USDT, tiến hành MUA.`);
      return true; // tín hiệu mua
      
    }
    // MUA nếu giảm >= 10 USDT*3 so với 3 phút trước
    if (lastPrices.length > 12) lastPrices.shift(); // Giữ giá 1 phút (18 x 10s)
     oldPrice = lastPrices[0];
    if (oldPrice && oldPrice - currentPrice >= CONFIG.priceDiff *3 ) {
      console.log(`📉 Giá giảm ${oldPrice - currentPrice} USDT, tiến hành MUA.`);
      return true; // tín hiệu mua
      
    }
 
 
    return false; // không mua
  
}
async function botLoop() {
  try {
    const currentPrice = await getCurrentPrice();
    lastPrices.push(currentPrice);
    if (lastPrices.length > 6) lastPrices.shift(); // Giữ giá 1 phút (6 x 10s)

    // //MUA nếu giảm >= 10 USDT so với 1 phút trước
    // const oldPrice = lastPrices[0];
    // if (oldPrice && oldPrice - currentPrice >= CONFIG.priceDiff) {
    //   console.log(`📉 Giá giảm ${oldPrice - currentPrice} USDT, tiến hành MUA.`);
    //   await placeBuyOrder(currentPrice);
    // }
     //MUA nếu giá hiện tại <=108840
    const oldPrice = lastPrices[0];
    if (currentPrice <= 108840) {
      console.log(`📉 Giá giảm <108,840 : ${oldPrice - currentPrice} USDT, tiến hành MUA.`);
      await placeBuyOrder(currentPrice);
    }
    // if(chienluocmua){
    //   await placeBuyOrder(currentPrice);
    // }

    // BÁN nếu giá hiện tại cao hơn 10 USDT so với giá đã mua
    for (let i = openBuyOrders.length - 1; i >= 0; i--) {
      const order = openBuyOrders[i];
      if (currentPrice - order.price >= CONFIG.priceDiff) {
        console.log(`📈 Giá tăng ${currentPrice - order.price} USDT, tiến hành BÁN.`);
        await placeSellOrder(currentPrice, order.quantity);
        openBuyOrders.splice(i, 1);
      }
    }

    await printStatus(currentPrice);
  } catch (e) {
    console.error('❌ LỖI BOT:', e);
  }
}

// Chạy bot mỗi 10 giây
setInterval(botLoop, CONFIG.checkInterval);

//Bán hết BTC đã mua
//banHetBTC();
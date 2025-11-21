const Binance = require('node-binance-api');
const binance = new Binance().options({
   APIKEY:'CawP383LoZTw0gcm3NKPu06uwllU77UDlo6q7AIHzR9DBcax9RRzNgfJP9eZz5sW',
 APISECRET:'JIsUR2yuWavxtG2OLD4m0dJ2OEQ02mp50Uov6KKPGdYvELixnhC3e7N9415CJIYl',
  useServerTime: true,
  test: false, // Phải là false để đặt lệnh thực trên testnet
  urls: {
    base: 'https://testnet.binance.vision/api/',
  }
});

const CONFIG = {
  symbol: 'BTCUSDT',
  buyAmountUSDT: 100,
  delta: 10, // khoảng cách giá $ để mua/bán
  interval: 10 * 1000 // mỗi 10 giây
};

let lastPrice1MinAgo = null;
let openBuyOrders = []; // Mỗi lệnh: { orderId, price, qty }

async function getCurrentPrice() {
  const prices = await binance.prices(CONFIG.symbol);
  return parseFloat(prices[CONFIG.symbol]);
}

// async function placeBuyOrder(price) {
//   const quantity =0.000001; //(CONFIG.buyAmountUSDT / price).toFixed(6);
//   console.log(`✅ placeBuyOrder Đang MUA: ${quantity} BTC @ ${price} USDT`);
//   const order = await binance.marketBuy(CONFIG.symbol, quantity);
//   openBuyOrders.push({
//     orderId: order.orderId,
//     price: price,
//     qty: parseFloat(quantity),
//   });
//   console.log(`✅ Đã MUA: ${quantity} BTC @ ${price} USDT`);
// }
async function getStepSize(symbol) {
  const data = await binance.exchangeInfo();
  const symbolInfo = data.symbols.find(s => s.symbol === symbol);
  const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
  return {
    stepSize: parseFloat(lotSizeFilter.stepSize),
    minQty: parseFloat(lotSizeFilter.minQty)
  };
}
function floorToStepSize(quantity, stepSize) {
  return Math.floor(quantity / stepSize) * stepSize;
}

async function placeBuyOrder(price) {
  try {
    const { stepSize, minQty } = await getStepSize(CONFIG.symbol);
    let rawQty = CONFIG.buyAmountUSDT / price;
    let quantity = floorToStepSize(rawQty, stepSize);

    // Nếu quantity < minQty thì không đặt lệnh
    if (quantity < minQty) {
      console.log(`⚠️ Không đủ số lượng để đặt lệnh. Cần ít nhất ${minQty} BTC.`);
      return;
    }

    console.log(`✅ Đang MUA: ${quantity} BTC @ ${price} USDT (~${CONFIG.buyAmountUSDT} USDT)`);

    const order = await binance.marketBuy(CONFIG.symbol, quantity);
    openBuyOrders.push({
      orderId: order.orderId,
      price: price,
      qty: quantity,
    });
    console.log(`✅ ĐÃ MUA thành công trên Testnet: ${quantity} BTC @ ${price} USDT`);
  } catch (err) {
    console.error(`❌ LỖI ĐẶT LỆNH MUA: ${err.body || err.message}`);
  }
}

async function placeSellOrder(order, currentPrice) {
    console.log(`💰placeSellOrder Đang BÁN: ${order.qty} BTC @ ${currentPrice} USDT (mua @ ${order.price})`);
  const result = await binance.marketSell(CONFIG.symbol, order.qty);
  console.log(`💰 Đã BÁN: ${order.qty} BTC @ ${currentPrice} USDT (mua @ ${order.price})`);
}

async function runBot() {
  try {
    const currentPrice = await getCurrentPrice();
    const now = new Date().toLocaleTimeString();
    console.log(`\n⏰ [${now}] Giá BTC/USDT hiện tại: ${currentPrice}`);

    // Chờ 1 phút đầu tiên
    if (!lastPrice1MinAgo) {
      lastPrice1MinAgo = currentPrice;
      console.log('🔄 Đang khởi động, chờ giá 1 phút trước...');
      return;
    }

    // MUA nếu giá giảm đủ so với 1 phút trước
    if (currentPrice <= lastPrice1MinAgo - CONFIG.delta) {
      await placeBuyOrder(currentPrice);
    }

    // BÁN nếu giá hiện tại > giá mua + delta
    let remainingOrders = [];
    for (let order of openBuyOrders) {
      if (currentPrice >= order.price + CONFIG.delta) {
        await placeSellOrder(order, currentPrice);
      } else {
        remainingOrders.push(order);
      }
    }
    openBuyOrders = remainingOrders;

    // Cập nhật giá 1 phút trước
    lastPrice1MinAgo = currentPrice;

    // Tổng kết
    const balances = await binance.balance();
    const usdt = parseFloat(balances.USDT.available);
    const btc = parseFloat(balances.BTC.available);
    const total = usdt + btc * currentPrice;

    console.log(`📊 TÀI SẢN: USDT: ${usdt.toFixed(2)} | BTC: ${btc.toFixed(6)} (~${(btc * currentPrice).toFixed(2)} USDT)`);
    console.log(`💼 TỔNG GIÁ TRỊ: ${total.toFixed(2)} USDT`);
  } catch (e) {
    console.error(`❌ LỖI: ${e.body || e.message}`);
  }
}
getStepSize('BTCUSDT').then(info => console.log('Thông tin LOT_SIZE:', info));

setInterval(runBot, CONFIG.interval);

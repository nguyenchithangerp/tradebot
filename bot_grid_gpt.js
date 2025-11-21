const Binance = require('node-binance-api');
const binance = new Binance().options({

  APIKEY:'CawP383LoZTw0gcm3NKPu06uwllU77UDlo6q7AIHzR9DBcax9RRzNgfJP9eZz5sW',
 APISECRET:'JIsUR2yuWavxtG2OLD4m0dJ2OEQ02mp50Uov6KKPGdYvELixnhC3e7N9415CJIYl'
});
const CONFIG = {
  symbol: 'BTCUSDT',
  lowerBound: 100353,
  upperBound: 110218,
  gridCount: 4,
  gridType: 'geometric',
  investment: 1000 // USDT
};

let gridPrices = [];
let activeOrders = [];

function generateGeometricGrid(lower, upper, count) {
  const ratio = Math.pow(upper / lower, 1 / (count - 1));
  const prices = [];
  for (let i = 0; i < count; i++) {
    const price = lower * Math.pow(ratio, i);
    prices.push(parseFloat(price.toFixed(2)));
  }
  return prices;
}

async function placeGridOrders() {
  const prices = generateGeometricGrid(CONFIG.lowerBound, CONFIG.upperBound, CONFIG.gridCount);
  const usdtPerOrder = CONFIG.investment / prices.length;
  console.log(`\n📊 Generated Geometric Grid (${CONFIG.gridCount} levels):`);
  console.log(prices.join(' | '));

  for (let price of prices) {
    const quantity = parseFloat((usdtPerOrder / price).toFixed(6));
    try {
      const order = await binance.order('BUY', CONFIG.symbol, quantity, price, { type: 'LIMIT' });
      console.log(`[✅ ORDER] Placed BUY at ${price} for ${quantity} BTC`);
      activeOrders.push(order);
    } catch (err) {
      console.error(`[❌ ERROR] Failed to place order at ${price}:`, err.body || err.message);
    }
  }
}

async function logCurrentPrice() {
  try {
    const prices = await binance.prices(CONFIG.symbol);
    const currentPrice = parseFloat(prices[CONFIG.symbol]);
    console.log(`\n[📈 STATUS] ${new Date().toLocaleTimeString()} | Current BTC/USDT: ${currentPrice}`);
  } catch (err) {
    console.error('[❌ ERROR] Fetching current price:', err.body || err.message);
  }
}

async function main() {
  console.log('🚀 Starting Grid Trading Bot...');
  console.log(`[CONFIG] Symbol: ${CONFIG.symbol}, Investment: ${CONFIG.investment} USDT`);
  console.log(`[GRID] Type: ${CONFIG.gridType}, Lower: ${CONFIG.lowerBound}, Upper: ${CONFIG.upperBound}, Levels: ${CONFIG.gridCount}`);

  await placeGridOrders();

  setInterval(async () => {
    await logCurrentPrice();
  }, 30000); // 30 giây
}

main();
const fs = require('fs');
const path = require('path');
const Binance = require('node-binance-api');

// ==== CONFIGURATION (mandatory) ====
const config = {
  symbol: 'BTCUSDT',
  lowerPrice: 100000,//
  upperPrice: 105000,
  gridCount: 4,
  gridType: 'geometric',
  totalInvestment: 1000,
  trailingUp: false,
  activateGrid: true,
  sellAllOnStop: false,
  enableTP_SL: false,
  runInterval: 10000
};

// ==== INITIALIZATION ====
const binance = new Binance().options({
  APIKEY: 'CawP383LoZTw0gcm3NKPu06uwllU77UDlo6q7AIHzR9DBcax9RRzNgfJP9eZz5sW',
  APISECRET: 'JIsUR2yuWavxtG2OLD4m0dJ2OEQ02mp50Uov6KKPGdYvELixnhC3e7N9415CJIYl',
  useServerTime: true,
  test: true,
  recvWindow: 60000,
  urls: { base: 'https://testnet.binance.vision/api/', stream: 'wss://testnet.binance.vision/ws/' }
});

let symbolInfo = null;
let orders = {};
let filledTrades = [];

let lenhAll = 0, lenhBuy = 0, lenhSell = 0; // Biến lưu số lệnh
let initialTotalUSDTAndBTC = null;initialTotalUSDT = null; initialTotalBTC = null  // Tổng tài sản ban đầu quy đổi USDT
let commissionAll = 0, commissionBuy = 0, commissionSell = 0; commissionSellPercent = 0.001;commissionBuyPercent = 0.001// Biến lưu phí giao dịch


// ==== LOG SETUP ====
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const logFile = path.join(logDir, `gridbot_${Date.now()}.log`);
function log(msg) { const ts = new Date().toISOString(); fs.appendFileSync(logFile, `[${ts}] ${msg}\n`); console.log(`[${ts}] ${msg}`); }

// ==== LOAD SYMBOL FILTERS ====
async function loadSymbolInfo() {
  const info = await binance.exchangeInfo();
  const sym = info.symbols.find(s => s.symbol === config.symbol);
  symbolInfo = sym.filters.reduce((acc, f) => {
    if (f.filterType === 'LOT_SIZE') { acc.stepSize = parseFloat(f.stepSize); acc.minQty = parseFloat(f.minQty); }
    if (f.filterType === 'MIN_NOTIONAL') acc.minNotional = parseFloat(f.minNotional);
    return acc;
  }, { stepSize: 0, minQty: 0, minNotional: 0 });
  log(`Loaded filters: stepSize=${symbolInfo.stepSize}, minQty=${symbolInfo.minQty}, minNotional=${symbolInfo.minNotional}`);
}

// ==== GRID CALCULATION & ORDER PLACEMENT ====
/**
 * calculateGridPrices(): Tính toán các mốc giá trong lưới.
 * - Hình học (geometric): Khoảng cách giữa các giá tăng theo tỷ lệ cố định.
 *   Phù hợp khi bạn muốn phân bổ lưới dựa trên biến động % của giá.
 *   Công thức: P_i = L * (U/L)^(i/n)
 * - Số học (arithmetic): Khoảng cách giữa các giá tăng bằng nhau.
 *   Phù hợp khi bạn muốn mỗi bước giá chênh lệch cố định.
 *   Công thức: P_i = L + (U - L) * (i/n)
 * @returns mảng gồm n+1 giá, từ giá sàn đến giá trần.
 */
function calculateGridPrices() {
  const { lowerPrice: L, upperPrice: U, gridCount: n, gridType } = config;
  const prices = [];
  for (let i = 0; i <= n; i++) {
    let p;
    if (gridType === 'arithmetic') {
      // Arithmetic grid: equal price intervals
      p = L + ((U - L) * (i / n));
    } else {
      // Geometric grid: equal percentage intervals
      p = L * Math.pow(U / L, i / n);
    }
    prices.push(parseFloat(p.toFixed(2)));
  }
  return prices;
}

// Kết thúc tính toán lưới

// ==== ADJUST QUANTITY ====
/**
 * adjustQuantity(): Căn chỉnh khối lượng mua theo bước lot và minQty.
 * @param rawQty số lượng tính toán thô
 * @returns số lượng hợp lệ hoặc 0 nếu không đủ minQty
 */
function adjustQuantity(rawQty) {
  if (!symbolInfo) return 0;
  // Làm tròn xuống theo bước lot
  let qty = Math.floor(rawQty / symbolInfo.stepSize) * symbolInfo.stepSize;
  // Bỏ nếu nhỏ hơn minQty
  if (qty < symbolInfo.minQty) return 0;
  return parseFloat(qty.toFixed(8));
}


// ==== GRID CALCULATION & ORDER PLACEMENT ====

/**
 * placeGridOrders(): Đặt các lệnh mua/bán theo lưới đã tính.
 */
async function placeGridOrders() {
  const prices = calculateGridPrices();
  const baseQty = config.totalInvestment / config.gridCount;
  log('Placing grid orders...');

  for (let i = 0; i < config.gridCount; i++) {
    const buyPrice = prices[i];
    const sellPrice = prices[i + 1];
    const qty = adjustQuantity(baseQty / buyPrice);

    if (qty <= 0 || (symbolInfo.minNotional && qty * buyPrice < symbolInfo.minNotional)) {
      log(`Skip invalid at ${buyPrice}, qty=${qty}`);
      continue;
    }

    try {
      const buy = await binance.buy(config.symbol, qty, buyPrice, { type: 'LIMIT', timeInForce: 'GTC' });
      orders[buy.orderId] = { side: 'BUY', price: buyPrice, qty };
      log(`BUY ${buy.orderId}@${buyPrice} x${qty}`);

      const sell = await binance.sell(config.symbol, qty, sellPrice, { type: 'LIMIT', timeInForce: 'GTC' });
      orders[sell.orderId] = { side: 'SELL', price: sellPrice, qty };
      log(`SELL ${sell.orderId}@${sellPrice} x${qty}`);
    } catch (e) {
      log(`Order error: ${e.message}`);
    }
  }
}

// ==== WEBSOCKET HANDLER ====
binance.websockets.userData(() => {}, msg => {
  if (msg.eventType === 'executionReport' && orders[msg.orderId]) {
    const t = msg; filledTrades.push({ orderId: t.orderId, side: t.side, price: +t.price,
      qty: +t.executedQty, cost: +t.cummulativeQuoteQty, fee: +t.commission, time: new Date() });
    log(`FILLED ${t.orderId}: ${t.side}@${t.price} x${t.executedQty}`); delete orders[t.orderId];
  }
});

// ==== CANCEL ALL ====
async function cancelAll() {
  const open = await binance.openOrders(config.symbol);
  for (const o of open) await binance.cancel(config.symbol, o.orderId).catch(() => {});
  log('All open orders cancelled');
}

// ==== ASSET SUMMARY ====
/**
 * listAssets(): Liệt kê các tài sản hiện có và quy về USDT.
 * - Lấy balance từ tài khoản.
 * - Với mỗi tài sản !== 'USDT', lấy giá USDT qua binance.prices.
 * - Tính USD equivalent: amount * price.
 * - Trả về danh sách và tổng USDT.
 */
async function listAssets() {
  const balances = await binance.balance();
  const prices = await binance.prices();
  const assetList = [];
  let totalUSDT = parseFloat(balances.USDT.available) + parseFloat(balances.USDT.onOrder);

  // Tính giá trị mỗi tài sản quy về USDT
  for (const [asset, info] of Object.entries(balances)) {
    const amount = parseFloat(info.available) + parseFloat(info.onOrder);
    if (asset === 'USDT' || amount === 0) continue;
    const pair = asset + 'USDT';
    if (prices[pair]) {
      const value = amount * parseFloat(prices[pair]);
      assetList.push({ asset, amount, usdt: value });
      totalUSDT += value;
    }
  }

  // Lọc top 10 tài sản theo giá trị USDT giảm dần
  assetList.sort((a, b) => b.usdt - a.usdt);
  const topAssets = assetList.slice(0, 10);

  log('=== Top 10 Asset Summary ===');
  topAssets.forEach(a => log(`${a.asset}: ${a.amount} (~${a.usdt.toFixed(2)} USDT)`));
  log(`Total equivalent USDT: ${totalUSDT.toFixed(2)}`);
  return { assetList: topAssets, totalUSDT };
}

// ==== REPORT PnL ====
function reportPnL() {
  let buySum = 0, sellSum = 0, fees = 0;
  filledTrades.forEach(t => t.side === 'BUY' ? buySum += t.cost : sellSum += t.cost || 0);
  filledTrades.forEach(t => fees += t.fee || 0);
  const profit = sellSum - buySum - fees; const pct = (profit / config.totalInvestment) * 100;
  log('===== REPORT ====='); log(`Invested: $${config.totalInvestment}`);
  log(`Bought: $${buySum}, Sold: $${sellSum}, Fees: $${fees}`);
  log(`Profit: $${profit.toFixed(2)} (${pct.toFixed(2)}%)`);
  log(`Open orders: ${Object.keys(orders).length}, Trades: ${filledTrades.length}`);

  listAssets();
}




// ==== MAIN FUNCTION ====
async function main() {
  await loadSymbolInfo(); if (config.activateGrid) await placeGridOrders();
  
  let runCount = 0; const maxRuns = 3;
  const intervalId = setInterval(async () => {
    runCount++; log(`Run #${runCount}`);
    if (config.activateGrid) await placeGridOrders();
    await cancelAll(); reportPnL();
    if (runCount >= maxRuns) { config.activateGrid = false; clearInterval(intervalId); log('Grid disabled'); }
  }, config.runInterval);
}

// Start the bot
main().catch(err => log(`Fatal error: ${err.message}`));
//printStatus() ;
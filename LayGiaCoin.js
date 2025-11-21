const ccxt = require('ccxt');
const moment = require('moment');
const fs = require('fs');
const path = require('path') ;
const axios = require('axios');
const sql = require('mssql');

// Khởi tạo sàn Binance
const binance = new ccxt.binance();

const timeframes = [
    '1m', '3m', '5m', '15m', '30m',
    '1h', '2h', '4h', '6h', '8h', '12h',
    '1d', '3d', '1w', '1M'
  ];
// 1. Cấu hình MSSQL
const config = {
  user: 'sa',          // ← Thay bằng username của bạn
  password: '123456',  // ← Thay bằng password
  server: 'localhost',        // hoặc IP/hostname khác
  database: 'CryptoDB',
  options: {
    encrypt: false, // true nếu dùng Azure
    trustServerCertificate: true
  }
};

// Hàm lấy dữ liệu OHLCV
async function fetchOHLCV(symbol, timeframe, since) {
  try {
    const ohlcv = await binance.fetchOHLCV(symbol, timeframe, since);
    console.log(`\n--- ${symbol} | Timeframe: ${timeframe} ---`);
    ohlcv.forEach(candle => {
      const time = moment(candle[0]).format('YYYY-MM-DD HH:mm');
      const [open, high, low, close, volume] = candle.slice(1);
      console.log(`${time} | Open: ${open} | High: ${high} | Low: ${low} | Close: ${close} | Vol: ${volume}`);
    });
  } catch (error) {
    console.error(`Lỗi khi lấy dữ liệu ${timeframe}:`, error.message);
  }
}

// Hàm lấy dữ liệu OHLCV và lưu vào file CSV
async function fetchOHLCV(symbol, timeframe, since) {
    try {
      const ohlcv = await binance.fetchOHLCV(symbol, timeframe, since);
      const filename = path.join(__dirname, `${symbol.replace('/', '')}_${timeframe}.csv`);
      const header = 'Time,Open,High,Low,Close,Volume\n';
  
      const csvLines = ohlcv.map(candle => {
        const time = moment(candle[0]).format('YYYY-MM-DD HH:mm');
        const [open, high, low, close, volume] = candle.slice(1);
        return `${time},${open},${high},${low},${close},${volume}`;
      });
  
      // Ghi file
      fs.writeFileSync(filename, header + csvLines.join('\n'), 'utf8');
      console.log(`✅ Đã lưu dữ liệu ${symbol} - ${timeframe} vào: ${filename}`);
    } catch (error) {
      console.error(`❌ Lỗi khi lấy dữ liệu ${timeframe}:`, error.message);
    }
  }
  
 // Hàm lấy dữ liệu 1m trong số ngày chỉ định
async function fetchBTC1mData(days) {
    const symbol = 'BTC/USDT';
const timeframe = '1m';
const msInDay = 24 * 60 * 60 * 1000;
  const filename = path.join(__dirname, `BTCUSDT_1m_${days}days.csv`);
  const header = 'Time,Open,High,Low,Close,Volume\n';
  let allData = [];

  const now = Date.now();
  const start = now - days * msInDay;

  console.log(`🚀 Bắt đầu lấy dữ liệu 1m trong ${days} ngày...\n`);

  for (let i = 0; i < days; i++) {
    const since = start + i * msInDay;
    const dayStr = moment(since).format('YYYY-MM-DD');

    console.log(`📅 Đang lấy ngày ${i + 1}/${days}: ${dayStr}`);

    try {
      const ohlcv = await binance.fetchOHLCV(symbol, timeframe, since);
      const csvLines = ohlcv.map(candle => {
        const time = moment(candle[0]).format('YYYY-MM-DD HH:mm');
        const [open, high, low, close, volume] = candle.slice(1);
       


        return `${time},${open},${high},${low},${close},${volume}`;
      });
      allData.push(...csvLines);
    } catch (error) {
      console.error(`❌ Lỗi khi lấy ngày ${dayStr}: ${error.message}`);
    }
  }

  fs.writeFileSync(filename, header + allData.join('\n'), 'utf8');
  console.log(`\n✅ Đã lưu toàn bộ dữ liệu ${days} ngày vào file: ${filename}`);
}

  //test 
  async function testAllCachLay() {
    const symbol = 'BTC/USDT';
    const now = Date.now();
  
    for (const timeframe of timeframes) {
      let since;
  
      switch (timeframe) {
        case '1m':
          since = now - 24 * 60 * 60 * 1000; // 1 ngày
          break;
        case '3m':
        case '5m':
          since = now - 3 * 24 * 60 * 60 * 1000; // 3 ngày
          break;
        case '15m':
        case '30m':
          since = now - 7 * 24 * 60 * 60 * 1000; // 1 tuần
          break;
        case '1h':
        case '2h':
        case '4h':
          since = now - 14 * 24 * 60 * 60 * 1000; // 2 tuần
          break;
        case '6h':
        case '8h':
        case '12h':
          since = now - 30 * 24 * 60 * 60 * 1000; // 1 tháng
          break;
        case '1d':
          since = now - 6 * 30 * 24 * 60 * 60 * 1000; // 6 tháng
          break;
        case '3d':
        case '1w':
          since = now - 365 * 24 * 60 * 60 * 1000; // 1 năm
          break;
        case '1M':
          since = now - 5 * 365 * 24 * 60 * 60 * 1000; // 5 năm
          break;
        default:
          since = now - 7 * 24 * 60 * 60 * 1000; // fallback: 1 tuần
      }
  
      await fetchOHLCV(symbol, timeframe, since);
    }
  }
  


// 2. Danh sách cặp coin muốn lấy
const symbols = ['BTCUSDT', 'ETHUSDT'];

async function fetchAndSavePrices() {
  try {
    // Kết nối MSSQL
    await sql.connect(config);

    for (const symbol of symbols) {
      const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const price = parseFloat(res.data.price);

      const request = new sql.Request();
      await request.query(`
        INSERT INTO CoinPrices (symbol, price)
        VALUES ('${symbol}', ${price})
      `);

      console.log(`✅ Đã lưu ${symbol} - Giá: $${price}`);
    }

    // Đóng kết nối
    await sql.close();
  } catch (err) {
    console.error('❌ Lỗi:', err);
  }
}

async function insertCoinPriceSQL() {
  try {
    // Kết nối MSSQL
    await sql.connect(config);

    for (const symbol of symbols) {
      const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const price = parseFloat(res.data.price);

      const request = new sql.Request();
      await request.query(`
        INSERT INTO CoinPrices (symbol, price)
        VALUES ('${symbol}', ${price})
      `);

      console.log(`✅ Đã lưu ${symbol} - Giá: $${price}`);
    }

    // Đóng kết nối
    await sql.close();
  } catch (err) {
    console.error('❌ Lỗi:', err);
  }
}

// Hàm chính
async function main() {
  const symbol = 'BTC/USDT';
  const now = Date.now();

  //testAllCachLay();
  //case '1m':     since = now - 24 * 60 * 60 * 1000; // 1 ngày

  //await fetchOHLCV(symbol, '1m', now - 24 * 60 * 60 * 1000);
  fetchBTC1mData(7);


  // Lấy giá theo giờ (24 giờ gần nhất)
  //await fetchOHLCV(symbol, '1h', now - 24 * 60 * 60 * 1000);
 

//   // Lấy giá theo ngày (30 ngày gần nhất)
//   await fetchOHLCV(symbol, '1d', now - 30 * 24 * 60 * 60 * 1000);

//   // Lấy giá theo tuần (1 năm gần nhất)
//   await fetchOHLCV(symbol, '1w', now - 365 * 24 * 60 * 60 * 1000);

//   // Lấy giá theo tháng (5 năm gần nhất)
//   await fetchOHLCV(symbol, '1M', now - 5 * 365 * 24 * 60 * 60 * 1000);
}

// Gọi hàm chính
main();
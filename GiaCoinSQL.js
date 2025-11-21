const axios = require('axios');
const sql = require('mssql');
const ccxt = require('ccxt');
const moment = require('moment');
const fs = require('fs');
const path = require('path') ;
const dayjs = require('dayjs');
const prompt = require('prompt-sync')();




// Khởi tạo sàn Binance
const binance = new ccxt.binance();
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

// 2. Danh sách cặp coin muốn lấy
const symbols = ['BTCUSDT', 'ETHUSDT'];

async function fetchAndSavePrices() {
  try {
    //Coin cần lấy theo các thông số 
  let  symbol ='BTCUSDT';
    //Nhap thoi gian can lay
     fromDate = dayjs('2017-09-02 00:00:00');
     toDate = dayjs('2017-09-02 23:59:00'); // 1 giờ = 60 phút

  let nhapdung = false;
  while(nhapdung==false) {

    // Prompt user to input SymbolCoin
    console.log('Enter Coin(BTCUSDT, ETHUSDT):');
    const fromSymbolCoin = prompt();

     // Prompt user to input fromDate
    console.log('Enter fromDate (YYYY-MM-DD HH:mm:ss, e.g., 2017-09-02 00:00:00):');
    const fromDateInput = prompt();
    
    // Prompt user to input toDate
    console.log('Enter toDate (YYYY-MM-DD HH:mm:ss, e.g., 2017-09-02 23:59:00):');
    const toDateInput = prompt();
    
    // Create dayjs date objects from input
     fromDate = dayjs(fromDateInput);
     toDate = dayjs(toDateInput);
     symbol = fromSymbolCoin;

    
    // Validate and print the dates
    if (fromDate.isValid() && toDate.isValid()) {
        console.log('symbol:', symbol);
        console.log('fromDate:', fromDate.format('YYYY-MM-DD HH:mm:ss'));
        console.log('toDate:', toDate.format('YYYY-MM-DD HH:mm:ss'));
        nhapdung =true;
    } else {
        console.log('Invalid date format. Please use YYYY-MM-DD HH:mm:ss');
    }

  }
   

// return;

    const timeframe = '1m'; // Lấy theo 1 phút
    const intervalMs = 60 * 1000; // 1 phút = 60000 ms
    const totalMinutes = toDate.diff(fromDate, 'minute');//Chạy bao nhiêu phút

    // Kết nối MSSQL
    const now = new Date();
    await sql.connect(config);
    let since = now - 24 * 60 * 60 * 1000; // 1 ngày
    //***Vòng lặp theo phút 
    const days =10; //lấy 10 ngày
   
    const msInDay = 24 * 60 * 60 * 1000;
    //const now = new Date();
    const start = now - days * msInDay;
    console.log(`🚀 Bắt đầu lấy dữ liệu 1m trong ${totalMinutes} phút...\n`);
    for (let i = 0; i < totalMinutes; i++) {
      const currentTime = fromDate.add(i, 'minute');
      const since = currentTime.valueOf(); // timestamp in ms

        //const since = start + i * msInDay;
        const dayStr = moment(since).format('YYYY-MM-DD');
        console.log(`📅 Đang lấy phút ${i + 1}/${totalMinutes}: ${dayStr}`);

        //Begin ** Lấy lần lượt từng coin **/
       // for (const symbol of symbols) {
    
      //const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      
      const ohlcv = await binance.fetchOHLCV(symbol, '1m', since);
     // console.log(`fetchOHLCV 0-0: ${ohlcv[0][0]} ; 0-1: $${ohlcv[0][1]} ;0-2: $${ohlcv[0][2]};0-3: $${ohlcv[0][3]};0-4: $${ohlcv[0][4]}`);
      //const price = parseFloat(res.data.price);

      const time = moment(ohlcv[0][0]).format('YYYY-MM-DD HH:mm');
      const _Open = parseFloat(ohlcv[0][1]);
      const _High = parseFloat(ohlcv[0][2]);
      const _Low = parseFloat(ohlcv[0][3]);
      const _Close = parseFloat(ohlcv[0][4]);
      const _Volume = parseFloat(ohlcv[0][5]);
      const request = new sql.Request();
      let sqlInsertCoinPricesHis =`
        INSERT INTO [dbo].[CoinPricesHis]
           ([Time]
           ,[Symbol]
           ,[Open]
           ,[High]
           ,[Low]
           ,[Close]
           ,[Volume])
        VALUES (
        '${time}'
        ,'${symbol}'
        , ${_Open}
        , ${_High}
        , ${_Low}
        , ${_Close}
        , ${_Volume}
        )
      `;
      await request.query(sqlInsertCoinPricesHis);
     //console.log(`sqlInsertCoinPricesHis ${sqlInsertCoinPricesHis} `);
    }
    // Đóng kết nối
    await sql.close();
  } catch (err) {
    console.error('❌ Lỗi:', err);
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



// Hàm chính
async function main() {
  const symbol = 'BTC/USDT';
  //const now = Date.now();
  fetchAndSavePrices();
  //fetchBTC1mData(10);

  //testAllCachLay();
  //case '1m':     since = now - 24 * 60 * 60 * 1000; // 1 ngày

  //await fetchOHLCV(symbol, '1m', now - 24 * 60 * 60 * 1000);
  


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
//fetchAndSavePrices();
main();
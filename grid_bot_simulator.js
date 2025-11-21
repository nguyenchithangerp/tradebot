// grid_bot_simulator.js

const fs = require('fs');
const csv = require('csv-parser');

// ====== Cấu hình ======
const lowerPrice = 95000;            // Giá sàn
const upperPrice = 100000;            // Giá trần
const gridLevels = 10;               // Số lượng lưới
const totalUSDT = 1000;              // Tổng đầu tư
const feeRate = 0.001;               // Phí mỗi giao dịch (0.1%)
const mode = 'arithmetic';           // 'arithmetic' hoặc 'geometric'
const historicalDataPath = './BTCUSDT_1m_365days.csv';

//====Kết Quả Chạy=====
let toalfeeRate = 0;               // Tổng phí cộng dồn mõi giao dịch(Phí mỗi giao dịch (0.1%))
let toalRunBuy= 0;               // Tổng lệnh mua
let toalRunSell = 0;               // Tổng lệnh bán

// ====== Tạo lưới giá ======
function generateGridPrices(lower, upper, levels, mode = 'arithmetic') {
  let prices = [];

  if (mode === 'arithmetic') {
     console.log('arithmetic:');
    const step = (upper - lower) / (levels - 1);
    for (let i = 0; i < levels; i++) {
      prices.push(lower + i * step);
      console.log(` ${prices[i]} `);

    }
  } else if (mode === 'geometric') {
    const ratio = Math.pow(upper / lower, 1 / (levels - 1));
    for (let i = 0; i < levels; i++) {
      prices.push(lower * Math.pow(ratio, i));
    }
  }

  return prices;
}

// ====== Đọc dữ liệu lịch sử ======
function loadHistoricalData(filePath) {
  return new Promise((resolve) => {
    const data = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        data.push({
          time: row.Time,
          openprice: parseFloat(row.Open),
          highprice: parseFloat(row.High),
          lowprice: parseFloat(row.Low),
          closeprice: parseFloat(row.Close),
          volumeprice: parseFloat(row.Volume),
          

        }
    
    );
      })
      .on('end', () => {
        console.log(`✅ Đã tải ${data.length} dòng dữ liệu lịch sử`);
        resolve(data);
      });
  });
}

// ====== Mô phỏng bot ======
async function simulateGridBot() {
  const prices = generateGridPrices(lowerPrice, upperPrice, gridLevels, mode);
  const orderSizeUSDT = totalUSDT / gridLevels;
  let btcBalance = 0;              // Tổng BTC
  let usdtBalance = totalUSDT;     // Tổng USDT

  const historicalData = await loadHistoricalData(historicalDataPath);
  //for (let candle of historicalData) 
    let i =0 ; //bước chạy historicalData.length-2
    for (i =0 ; i <= historicalData.length-2; i++)      {
        try {
    const candle = historicalData[i];
    const currentPrice = candle.openprice;
    const highPrice = candle.openprice;
   //console.log(`✅${i}.  Date Time : ${candle.time} open: ${candle.openprice} high: ${candle.highprice} low: ${candle.lowerPrice} close: ${candle.closeprice} volume: ${candle.volumeprice}`);
    
    // Lệnh mua 1/2 lưới dưới
    let lm = 0
    let grid = prices[lm];
   for ( lm = 0; lm<=4;lm++ ) {
        grid = prices[lm]
      if (currentPrice <= grid && usdtBalance >= orderSizeUSDT) {
        const btcBought = (orderSizeUSDT * (1 - feeRate)) / currentPrice;
        btcBalance += btcBought;
        usdtBalance -= orderSizeUSDT;
        console.log(`🟢 ${candle.time} Mua ${btcBought.toFixed(6)} BTC @ ${currentPrice} usdtBalance: ${usdtBalance} btcBalance: ${btcBalance} `);
       toalRunBuy =toalRunBuy + 1;
       toalfeeRate =toalfeeRate + (orderSizeUSDT * feeRate);
       // break; //Chỉ mua 1 step
      }

      
    }
    // Lệnh bán 1/2 lưới trên
    for (lm=5; lm<prices.length-1;lm++ ) {
        grid = prices[lm]
        if (highPrice >= grid) {
          const btcToSell = (orderSizeUSDT / currentPrice) * (1 + feeRate);
          if (btcBalance >= btcToSell) {
            btcBalance -= btcToSell;
            usdtBalance += (btcToSell * currentPrice) * (1 - feeRate);
            console.log(`🔴 ${candle.time} Bán ${btcToSell.toFixed(6)} BTC @ ${currentPrice} usdtBalance: ${usdtBalance} btcBalance: ${btcBalance} `);
            toalRunSell =toalRunSell + 1;
            toalfeeRate =toalfeeRate + (orderSizeUSDT * feeRate);
           // break; //Chỉ bán 1 step
          }
        }
      }
} catch (error) {
    // xử lý lỗi
    console.error("Đã xảy ra lỗi:", error.message);
    //i++;
  }

  }

  // Bán tất cả BTC còn lại
  if (btcBalance > 0) {
    const finalPrice = historicalData[i].highprice;
    const finalSell = btcBalance * finalPrice * (1 - feeRate);
    usdtBalance += finalSell;
    console.log(`💰 Bán toàn bộ BTC còn lại @ ${finalPrice}, nhận: ${finalSell.toFixed(2)} USDT`);
    toalRunSell =toalRunSell + 1;
  }


  console.log(`\n🏁 Tổng lệnh mua: ${toalRunBuy}`);
  console.log(`\n🏁 Tổng lệnh bán: ${toalRunSell}`);
  console.log(`\n🏁 Tổng chi phí giao dịch: ${toalfeeRate}`);
  console.log(`\n🏁 Tổng USDT cuối cùng: ${usdtBalance.toFixed(2)}`);
}

// ====== Chạy mô phỏng ======
simulateGridBot();

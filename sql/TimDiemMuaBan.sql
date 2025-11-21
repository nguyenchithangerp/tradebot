-- Khai báo biến
DECLARE @BuyValue FLOAT = 200;             -- Số USDT đầu tư mỗi lệnh
DECLARE @FeeRate FLOAT = 1.001;            -- Phí mỗi chiều
DECLARE @ProfitThreshold FLOAT = 1.003;     -- Ngưỡng lợi nhuận 1.0%
DECLARE @TradeDate DATE = '2025-06-10';    -- Ngày giao dịch cần lọc
DECLARE @Symbol NVARCHAR(20) = 'BTCUSDT';  -- Ký hiệu coin cần lọc

-- Lấy giá đóng cửa cuối ngày
DECLARE @ClosePriceCuoiNgay FLOAT;

SELECT TOP 1 @ClosePriceCuoiNgay = [Close]
FROM [CoinPricesHis]
WHERE CAST(Time AS DATE) = @TradeDate AND Symbol = @Symbol
ORDER BY Time DESC;

-- CTE tính các giao dịch hợp lệ
WITH TradeCandidates AS (
    SELECT 
        -- Phần mua
        t1.Time AS BuyTime,
        ROUND(t1.High,2,1) AS BuyPrice,
		FLOOR(ROUND(t1.High,2,1) / 10) * 10 AS R1BuyPrice,
		FLOOR(ROUND(t1.High,2,1) / 100) * 100 AS R2BuyPrice,
        ROUND( @BuyValue / (ROUND(t1.High,2,1) * @FeeRate), 5,1)  AS BuyAmount, --Tính chưa đúng SL mua
		ROUND( @BuyValue / ROUND(t1.High,2,1) , 5,1) AS NotFeeBuyAmount,
		ROUND( @BuyValue / ROUND(t1.High,2,1) , 8,1) * 0.001   AS FeeBuyAmount,--Maker: SL BTC* 0.10% * Giá BTC = 25 USD
		ROUND(ROUND( @BuyValue / ROUND(t1.High,2,1), 5,1) - ROUND( @BuyValue / ROUND(t1.High,2,1) , 8,1) * 0.001,5,1) AS BuyAmount2,
        @BuyValue AS BuyValue,

        -- Phần bán
        t2.Time AS SellTime,
		ROUND(t2.Low ,2,1)  AS SellPrice,
        FLOOR(ROUND(t2.Low ,2,1) / 10) * 10 AS R1SellPrice,
		FLOOR(ROUND(t2.Low,2,1) / 100) * 100 AS R2SellPrice,
		ROUND( @BuyValue / (ROUND(t1.High,2,1) * @FeeRate), 5,1)  AS SellAmount, --Bằng số lượng mua
        ROUND( @BuyValue / ROUND(t2.Low,2,1) , 5,1) AS NotSellAmount,
		ROUND( ROUND( @BuyValue / (ROUND(t1.High,2,1) * @FeeRate), 5,1)/ ROUND(t2.Low,2,1) , 8,1) * 0.001   AS FeeSellAmount,--Maker: SL BTC* 0.10% * Giá BTC = 25 USD
        
		ROUND( @BuyValue / (ROUND(t1.High,2,1) * @FeeRate), 5,1) * ROUND(t2.Low,2,1)/ @FeeRate AS SellValue, --Chưa đúng số check Binance

        -- Phân tích lợi nhuận
        ROUND((t2.Low - t1.High), 0) AS PriceChange,
        ROUND((t2.Low - t1.High) / t1.High * 100, 4) AS ProfitPercent,
        ROUND(((@BuyValue / (t1.High * @FeeRate)) * t2.Low / @FeeRate) - @BuyValue, 4) AS ProfitUSDT,
        DATEDIFF(MINUTE, t1.Time, t2.Time) AS ThoiGianMuaBan

    FROM [CoinPricesHis] t1
    OUTER APPLY (
        SELECT TOP 1 *
        FROM [CoinPricesHis] t2
        WHERE 
            t2.Time > t1.Time 
            AND t2.Symbol = @Symbol
            AND t2.Low >= t1.High * @ProfitThreshold
            AND CAST(t2.Time AS DATE) = @TradeDate   -- Bán trong cùng ngày
        ORDER BY t2.Time
    ) t2
    WHERE 
        CAST(t1.Time AS DATE) = @TradeDate           -- Mua trong ngày
        AND t1.Symbol = @Symbol                      -- Symbol cần lọc
		-- Rule loại bỏ các giá mua ko bán được cuối ngày dựa vào max min ngày trước
)


-- Tổng hợp: Đếm lệnh có/không có SellTime và tổng lợi nhuận
-- Tổng hợp kết quả
SELECT 
    CASE WHEN SellTime IS NULL THEN 'Chưa Bán' ELSE 'Đã Bán' END AS TrangThaiBan,
    COUNT(*) AS SoLenh,
    SUM(BuyValue) AS TongBuyValue,
    SUM(ProfitUSDT) AS TongLoiNhuanUSDT,
    SUM(BuyAmount) AS TongBuyAmount,
    SUM(CASE WHEN SellTime IS NULL THEN BuyAmount * @ClosePriceCuoiNgay ELSE 0 END) AS TongDuBanUSDT,
    SUM(CASE WHEN SellTime IS NULL THEN BuyAmount * @ClosePriceCuoiNgay ELSE 0 END) - SUM(CASE WHEN SellTime IS NULL THEN BuyValue ELSE 0 END) AS LoiLoConLai
FROM TradeCandidates
GROUP BY 
    CASE WHEN SellTime IS NULL THEN 'Chưa Bán' ELSE 'Đã Bán' END;


-- Thống kê các mức giá mua/bán làm tròn về 10 xuất hiện nhiều lần nhấ
SELECT TOP 100 
    R1BuyPrice, 
    R1SellPrice, 
    COUNT(*) AS SoLanXuatHien,
	AVG(PriceChange) AVGPriceChange,
	AVG(ProfitUSDT) AVGProfitUSDT,
	AVG(ThoiGianMuaBan) AVGThoiGianMuaBan

FROM TradeCandidates
WHERE SellTime IS NOT NULL
 --and ProfitUSDT >= 0.9
GROUP BY R1BuyPrice, R1SellPrice
ORDER BY SoLanXuatHien DESC;

---- Tìm phần chưa bán
--SELECT TOP 5 
--    R1BuyPrice, 
--    R1SellPrice, 
--    COUNT(*) AS SoLanXuatHien,
--	AVG(PriceChange) AVGPriceChange,
--	AVG(ProfitUSDT) AVGProfitUSDT,
--	AVG(ThoiGianMuaBan) AVGThoiGianMuaBan

--FROM TradeCandidates
--WHERE SellTime IS NULL 
----and ProfitUSDT >= 0.9
--GROUP BY R1BuyPrice, R1SellPrice
--ORDER BY SoLanXuatHien DESC;

---- Thống kê các mức giá mua/bán làm tròn về 100 xuất hiện nhiều lần nhấ
--SELECT TOP 5 
--    R2BuyPrice, 
--    R2SellPrice, 
--    COUNT(*) AS SoLanXuatHien,
--	AVG(ProfitUSDT) ProfitUSDT,
--	AVG(ThoiGianMuaBan) ThoiGianMuaBan

--FROM TradeCandidates
--WHERE SellTime IS NOT NULL and ProfitUSDT >= 0.9
--GROUP BY R2BuyPrice, R2SellPrice
--ORDER BY SoLanXuatHien DESC;

---- Lọc 10 giao dịch có lợi nhuận cao nhất, thời gian giữ ngắn nhất
--SELECT TOP 100 *
--FROM TradeCandidates
--WHERE SellTime IS NOT NULL and ProfitUSDT > 0.5
--ORDER BY ProfitUSDT DESC, ThoiGianMuaBan ASC


------Tìm giá trị trung Bình
--SELECT TOP 100 *
----INTO #TopTrades
--FROM TradeCandidates
--WHERE SellTime IS NOT NULL and ProfitUSDT >= 0.9
--ORDER BY 
--ProfitUSDT DESC,
-- ThoiGianMuaBan ASC;

---- Tính giá trị mua/bán/trung bình
--SELECT 
--    MIN(BuyPrice) AS MinBuyPrice,
--    MAX(BuyPrice) AS MaxBuyPrice,
--    AVG(BuyPrice) AS AvgBuyPrice,

--    MIN(SellPrice) AS MinSellPrice,
--    MAX(SellPrice) AS MaxSellPrice,
--    AVG(SellPrice) AS AvgSellPrice,

--    MIN(ProfitUSDT) AS MinProfit,
--    MAX(ProfitUSDT) AS MaxProfit,
--    AVG(ProfitUSDT) AS AvgProfitUSDT,

--    MIN(ThoiGianMuaBan) AS MinHoldTime_Minutes,
--    MAX(ThoiGianMuaBan) AS MaxHoldTime_Minutes,
--    AVG(ThoiGianMuaBan) AS AvgHoldTime_Minutes

--FROM #TopTrades;

---- Xoá bảng tạm sau khi dùng
--DROP TABLE #TopTrades;
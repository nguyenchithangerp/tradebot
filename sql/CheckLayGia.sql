USE [CryptoDB]
GO

--BTCUSDT kpi 2025
SELECT LEFT(CONVERT(varchar, [Time],112),6) as 'YYYY-MM', count(*) as 'SL'
  FROM [dbo].[CoinPricesHis]
  where Symbol = 'BTCUSDT' 
  AND YEAR([Time]) =2025
  group by LEFT(CONVERT(varchar, [Time],112),6)
  Order by LEFT(CONVERT(varchar, [Time],112),6) asc
--ETHUSDT
SELECT LEFT(CONVERT(varchar, [Time],112),6) as 'YYYY-MM', count(*) as 'SL'
  FROM [dbo].[CoinPricesHis]
  where Symbol = 'ETHUSDT'
  group by LEFT(CONVERT(varchar, [Time],112),6)
GO

  SELECT max([Time])
  FROM [dbo].[CoinPricesHis]
  where LEFT(CONVERT(varchar, [Time],112),6) = '202506'
  and  Symbol = 'ETHUSDT'
  group by LEFT(CONVERT(varchar, [Time],112),6)


   SELECT *
  FROM [dbo].[CoinPricesHis]
  where LEFT(CONVERT(varchar, [Time],112),6) = '202506'
  and  Symbol = 'ETHUSDT'
  group by LEFT(CONVERT(varchar, [Time],112),6)

SELECT LEFT(CONVERT(varchar, GetDate(),112),6)
-- New exchanges: show a stock from its first verified close (change unknown until the second session).
create or replace view market_latest as
 WITH ranked AS (
   SELECT b.asset_id, b.session_date, b.close * b.adjusted_factor AS close, b.volume, b.value, b.source, b.verified,
          row_number() OVER (PARTITION BY b.asset_id ORDER BY b.session_date DESC) AS rn
   FROM price_bars b
 )
 SELECT a.id AS asset_id, a.market, a.ticker, a.name, a.currency, s.code AS sector, l.session_date, l.close,
        p.close AS previous_close,
        CASE WHEN p.close > 0::numeric THEN round((l.close - p.close) / p.close * 100::numeric, 4) ELSE NULL::numeric END AS change_pct,
        l.volume, l.value, l.source, l.verified
 FROM ranked l
   LEFT JOIN ranked p ON p.asset_id = l.asset_id AND p.rn = 2
   JOIN assets a ON a.id = l.asset_id
   LEFT JOIN sectors s ON s.id = a.sector_id
 WHERE l.rn = 1 AND a.is_active;

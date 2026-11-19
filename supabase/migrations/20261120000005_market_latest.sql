-- Latest CLOSING price per asset, from the verified history (price_bars), with the change vs the
-- previous session. Readable by everyone (free plan = closing prices), independent of the delayed
-- intraday quotes in quotes_latest (Premium).
create or replace view market_latest with (security_invoker = true) as
with ranked as (
  select b.asset_id, b.session_date, b.close * b.adjusted_factor as close, b.volume, b.value, b.source, b.verified,
         row_number() over (partition by b.asset_id order by b.session_date desc) as rn
  from price_bars b
)
select a.id as asset_id, a.market, a.ticker, a.name, a.currency, s.code as sector,
       l.session_date, l.close, p.close as previous_close,
       case when p.close > 0 then round(((l.close - p.close) / p.close * 100)::numeric, 4) end as change_pct,
       l.volume, l.value, l.source, l.verified
from ranked l
join ranked p on p.asset_id = l.asset_id and p.rn = 2
join assets a on a.id = l.asset_id
left join sectors s on s.id = a.sector_id
where l.rn = 1 and a.is_active;

grant select on market_latest to anon, authenticated;
create index if not exists price_bars_asset_date_desc on price_bars (asset_id, session_date desc);

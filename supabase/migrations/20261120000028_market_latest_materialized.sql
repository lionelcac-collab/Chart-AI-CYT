-- Performance: latest close per stock is computed once after each collection (materialized), not on every request.
-- (price_bars now holds 3 years × 11 exchanges ≈ 720k rows: the window over the whole table took 11 s.)
create materialized view if not exists market_latest_mv as
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
create unique index if not exists market_latest_mv_pk on market_latest_mv (asset_id);
create index if not exists market_latest_mv_market on market_latest_mv (market);

create or replace view market_latest with (security_invoker = false) as select * from market_latest_mv;
grant select on market_latest to anon, authenticated;

create or replace function refresh_market_latest() returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently market_latest_mv;
end $$;
revoke all on function refresh_market_latest() from public, anon, authenticated;
grant execute on function refresh_market_latest() to service_role;

-- Company profiles: twice a month is enough (1st and 15th).
select cron.unschedule('enrich-companies');
select cron.schedule('enrich-companies', '45 3 1,15 * *', $$select call_edge('enrich-companies', '{"limit":40}'::jsonb)$$);

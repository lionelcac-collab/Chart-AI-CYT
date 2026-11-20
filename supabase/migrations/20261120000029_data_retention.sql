-- Data retention, approved by the owner (keeps the database light; nothing the app displays is lost).
-- Prices, news, company profiles, watchlists, alerts and baskets are never touched.
create or replace function data_retention() returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb := '{}'::jsonb; n int;
begin
  -- Market scans: only the latest sessions are shown (keep 10 sessions per market × period).
  delete from market_scans s using (
    select market, period, session_date, row_number() over (partition by market, period order by session_date desc) rn from market_scans
  ) x where s.market = x.market and s.period = x.period and s.session_date = x.session_date and x.rn > 10;
  get diagnostics n = row_count; r := r || jsonb_build_object('market_scans', n);
  -- Model snapshots: daily for 60 days, then one per week (Friday) for backtests.
  delete from consensus_results where as_of < current_date - 60 and extract(isodow from as_of) <> 5;
  get diagnostics n = row_count; r := r || jsonb_build_object('consensus_results', n);
  -- Rankings: 90 days.
  delete from rankings where session_date < current_date - 90;
  get diagnostics n = row_count; r := r || jsonb_build_object('rankings', n);
  -- Technical logs: 60 days; data anomalies: 90 days; expired cache entries.
  delete from ingestion_runs where started_at < now() - interval '60 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('ingestion_runs', n);
  delete from data_anomalies where created_at < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('data_anomalies', n);
  delete from api_cache where expires_at < now();
  return r;
end $$;
revoke all on function data_retention() from public, anon, authenticated;
select cron.schedule('data-retention', '20 2 * * 0', $$select data_retention()$$);

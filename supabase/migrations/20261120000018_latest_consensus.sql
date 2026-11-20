-- Latest model forecast per stock (served only through the `forecasts` edge function, which masks it for free users).
create or replace view latest_consensus with (security_invoker = true) as
select distinct on (asset_id) * from consensus_results
order by asset_id, as_of desc, created_at desc;

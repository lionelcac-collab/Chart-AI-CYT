-- Admin "Services & crédits" tab: AI token usage aggregated from audit_log, and database size.
-- Callable only with the service role (admin edge function); revoked from client roles.
create or replace function admin_ai_usage(p_since timestamptz)
returns table (day date, action text, model text, calls bigint, input_tokens bigint, output_tokens bigint, cache_read_tokens bigint, cache_write_tokens bigint)
language sql stable security definer set search_path = public as $$
  select (at at time zone 'UTC')::date as day, action, coalesce(details->>'model', '?') as model, count(*) as calls,
    sum(coalesce((details->'usage'->>'input_tokens')::bigint, 0)),
    sum(coalesce((details->'usage'->>'output_tokens')::bigint, 0)),
    sum(coalesce((details->'usage'->>'cache_read_input_tokens')::bigint, 0)),
    sum(coalesce((details->'usage'->>'cache_creation_input_tokens')::bigint, 0))
  from audit_log
  where at >= p_since and details ? 'usage'
  group by 1, 2, 3
  order by 1 desc, 2, 3;
$$;

create or replace function admin_db_stats()
returns table (db_bytes bigint, top_tables jsonb)
language sql stable security definer set search_path = public as $$
  select pg_database_size(current_database()),
    (select jsonb_agg(t) from (
      select c.relname as name, pg_total_relation_size(c.oid) as bytes
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc limit 6) t);
$$;

revoke all on function admin_ai_usage(timestamptz) from public, anon, authenticated;
revoke all on function admin_db_stats() from public, anon, authenticated;

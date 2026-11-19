-- Corporate-action candidates detected by the history loader, reviewed by an admin in the app.
create table if not exists corporate_action_candidates (
  id bigserial primary key,
  market text not null,
  ticker text not null,
  asset_id text generated always as (market || ':' || ticker) stored,
  action_date date not null,
  factor numeric,                 -- null = not adjusted automatically
  price_before numeric not null,
  price_after numeric not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'auto_applied', 'dismissed')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (market, ticker, action_date)
);
alter table corporate_action_candidates enable row level security;
create policy "admin all" on corporate_action_candidates for all using (is_admin(auth.uid()));

-- Admins can read the analyst opinions table fully and the review queue of fundamentals (already covered by policies).

-- SECURITY: functions are executable by PUBLIC by default in PostgreSQL. call_edge() triggers jobs with the
-- service key and must only be callable by the server (cron, service role), never by anon/authenticated users.
revoke execute on function call_edge(text, jsonb) from public, anon, authenticated;
grant execute on function call_edge(text, jsonb) to service_role;

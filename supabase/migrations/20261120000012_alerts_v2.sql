-- Alerts v2: per-asset or whole-watchlist ("global") alerts, more kinds, in-app notification history.
alter table alerts add column if not exists scope text not null default 'asset' check (scope in ('asset', 'watchlist'));
alter table alerts add column if not exists direction text not null default 'both' check (direction in ('up', 'down', 'both'));
alter table alerts drop constraint if exists alerts_kind_check;
alter table alerts add constraint alerts_kind_check check (kind in ('price_above', 'price_below', 'change_pct', 'new_high', 'new_low', 'news', 'consensus_change', 'dividend', 'near_support', 'near_resistance', 'events'));
alter table alerts add constraint alerts_scope_asset check (scope = 'watchlist' or asset_id is not null);

create table if not exists alert_events (
  id bigserial primary key,
  alert_id uuid references alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id text references assets(id) on delete cascade,
  kind text not null,
  session_date date not null,
  title text not null,
  body text not null,
  value numeric,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (alert_id, asset_id, session_date)
);
create index if not exists alert_events_user on alert_events (user_id, created_at desc);
alter table alert_events enable row level security;
create policy "own alert events read" on alert_events for select using (user_id = auth.uid());
create policy "own alert events update" on alert_events for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own alert events delete" on alert_events for delete using (user_id = auth.uid());

-- Free plan: 3 alerts; the global (watchlist) alert counts as one whatever its number of rules.
create or replace function enforce_alert_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if is_premium(new.user_id) then return new; end if;
  select count(*) filter (where scope = 'asset') + (case when count(*) filter (where scope = 'watchlist') > 0 or new.scope = 'watchlist' then 1 else 0 end)
    into n from alerts where user_id = new.user_id and active;
  if new.scope = 'asset' then n := n + 1; end if;
  if n > 3 then raise exception 'FREE_PLAN_ALERT_LIMIT'; end if;
  return new;
end $$;
drop trigger if exists alert_limit on alerts;
create trigger alert_limit before insert on alerts for each row execute function enforce_alert_limit();

-- Trade basket: stocks the user plans to buy or sell (printable daily checklist). Private per user.
create table if not exists trade_basket (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  asset_id text not null references assets(id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  quantity numeric check (quantity is null or quantity > 0),
  limit_price numeric check (limit_price is null or limit_price > 0),
  note text check (note is null or length(note) <= 300),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, asset_id, side)
);
create index if not exists trade_basket_user on trade_basket (user_id);
alter table trade_basket enable row level security;
create policy "own basket select" on trade_basket for select using (user_id = auth.uid());
create policy "own basket insert" on trade_basket for insert with check (user_id = auth.uid());
create policy "own basket update" on trade_basket for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own basket delete" on trade_basket for delete using (user_id = auth.uid());
-- Limit to 100 lines per user.
create or replace function trade_basket_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from trade_basket where user_id = new.user_id) >= 100 then raise exception 'BASKET_LIMIT'; end if;
  return new;
end $$;
drop trigger if exists trade_basket_limit on trade_basket;
create trigger trade_basket_limit before insert on trade_basket for each row execute function trade_basket_limit();

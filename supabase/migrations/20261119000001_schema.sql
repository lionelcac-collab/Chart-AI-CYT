-- =============================================================================
-- Nyota — schéma principal (Supabase / PostgreSQL 15+)
-- Principe : chaque donnée de marché garde sa source, son horodatage et son statut.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists vector;      -- RAG (pgvector)
-- TimescaleDB est optionnelle : si disponible, price_bars devient une hypertable (voir fin de fichier).

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type data_status as enum ('close', 'delayed', 'realtime', 'unavailable');
create type asset_class as enum ('equity', 'bond', 'index', 'fund', 'etf', 'fx');
create type plan_tier as enum ('free', 'premium');
create type recommendation as enum ('buy', 'hold', 'sell');
create type anomaly_severity as enum ('warn', 'block');

-- -----------------------------------------------------------------------------
-- Référentiel
-- -----------------------------------------------------------------------------
create table markets (
  code text primary key,                       -- BRVM, BVMAC, NGX…
  name text not null,
  countries text[] not null,
  currency text not null,
  timezone text not null,
  open_time time not null,
  close_time time not null,
  bulletin_delay_min int not null default 120,
  regulator text,
  phase smallint not null default 1,
  enabled boolean not null default true,
  website text
);

create table market_holidays (
  market text references markets(code) on delete cascade,
  day date not null,
  label text,
  primary key (market, day)
);

create table sectors (
  id serial primary key,
  code text unique not null,
  name_fr text not null,
  name_en text not null
);

create table assets (
  id text primary key,                         -- 'BRVM:SNTS'
  market text not null references markets(code),
  ticker text not null,
  isin text,
  name text not null,
  asset_class asset_class not null default 'equity',
  country char(2),
  sector_id int references sectors(id),
  currency text not null,
  listing_date date,
  share_capital numeric,
  shares_outstanding numeric,
  free_float_pct numeric,
  website text,
  description_fr text,
  description_en text,
  is_active boolean not null default true,
  -- obligations
  coupon_pct numeric,
  maturity_date date,
  issuer text,
  updated_at timestamptz not null default now(),
  unique (market, ticker)
);
create index assets_name_trgm on assets using gin (name gin_trgm_ops);
create index assets_isin on assets (isin);

create table asset_shareholders (
  asset_id text references assets(id) on delete cascade,
  holder text not null,
  pct numeric,
  as_of date,
  source text not null,
  primary key (asset_id, holder, as_of)
);

create table asset_executives (
  asset_id text references assets(id) on delete cascade,
  person text not null,
  role text not null,
  since date,
  source text not null,
  primary key (asset_id, person, role)
);

-- -----------------------------------------------------------------------------
-- Séries de prix (clôture + différé)
-- -----------------------------------------------------------------------------
create table price_bars (
  asset_id text not null references assets(id) on delete cascade,
  session_date date not null,
  open numeric, high numeric, low numeric,
  close numeric not null check (close > 0),
  volume numeric not null default 0,
  value numeric,
  source text not null,                        -- mansa | brvm_bulletin | ngx_official…
  fetched_at timestamptz not null default now(),
  verified boolean not null default false,     -- true quand recoupé avec le bulletin officiel
  adjusted_factor numeric not null default 1,  -- ajustement splits / attributions gratuites
  primary key (asset_id, session_date)
);
create index price_bars_date on price_bars (session_date);

create table quotes_latest (
  asset_id text primary key references assets(id) on delete cascade,
  last numeric not null,
  previous_close numeric,
  change numeric,
  change_pct numeric,
  volume numeric,
  value numeric,
  market_cap numeric,
  status data_status not null,
  delay_minutes int,
  as_of timestamptz not null,
  source text not null,
  fetched_at timestamptz not null default now()
);

create table index_values (
  index_code text not null,                    -- BRVM-C, BRVM-30, NGXASI…
  market text not null references markets(code),
  name text not null,
  session_date date not null,
  value numeric not null,
  change_pct numeric,
  source text not null,
  fetched_at timestamptz not null default now(),
  primary key (index_code, session_date)
);

create table fx_rates (
  quote text not null,                         -- devise (unités par 1 USD)
  as_of date not null,
  rate numeric not null check (rate > 0),
  source text not null,
  fetched_at timestamptz not null default now(),
  primary key (quote, as_of)
);

-- -----------------------------------------------------------------------------
-- Fondamentaux, dividendes, événements
-- -----------------------------------------------------------------------------
create table fundamentals (
  asset_id text references assets(id) on delete cascade,
  fiscal_year int not null,
  period text not null default 'FY',           -- FY | H1 | Q1…
  currency text not null,
  unit_multiplier numeric not null default 1,  -- 1, 1e3, 1e6 — normalisé à 1 en base
  revenue numeric, net_income numeric, operating_income numeric,
  total_assets numeric, total_equity numeric, total_debt numeric,
  operating_cash_flow numeric, capex numeric,
  eps numeric, dividend_per_share numeric, book_value_per_share numeric,
  -- banques
  net_banking_income numeric, customer_deposits numeric, customer_loans numeric,
  source text not null,
  source_document_id uuid,
  extracted_by text,                           -- 'manual' | 'claude-haiku-5-5' …
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  consistency_issues jsonb not null default '[]',
  fetched_at timestamptz not null default now(),
  primary key (asset_id, fiscal_year, period)
);

create table dividends (
  id bigserial primary key,
  asset_id text references assets(id) on delete cascade,
  fiscal_year int,
  amount numeric not null,
  currency text not null,
  ex_date date,
  payment_date date,
  source text not null,
  fetched_at timestamptz not null default now(),
  unique (asset_id, fiscal_year, ex_date)
);

create table corporate_events (
  id bigserial primary key,
  asset_id text references assets(id) on delete cascade,
  kind text not null check (kind in ('agm', 'egm', 'results', 'dividend', 'split', 'rights_issue', 'suspension', 'other')),
  event_date date not null,
  title_fr text, title_en text,
  details jsonb,
  source text not null,
  source_url text,
  fetched_at timestamptz not null default now()
);
create index corporate_events_date on corporate_events (event_date);

create table source_documents (
  id uuid primary key default gen_random_uuid(),
  asset_id text references assets(id) on delete set null,
  market text references markets(code),
  kind text not null check (kind in ('annual_report', 'half_year_report', 'press_release', 'bulletin', 'research_note', 'prospectus', 'regulator_notice')),
  title text,
  url text not null,
  storage_path text,                           -- copie dans Supabase Storage (si autorisée)
  published_at date,
  sha256 text unique,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Consensus analystes (notes de recherche publiques)
-- -----------------------------------------------------------------------------
create table analyst_opinions (
  id bigserial primary key,
  asset_id text references assets(id) on delete cascade,
  broker text not null,                        -- SGI / courtier / banque
  recommendation recommendation not null,
  target_price numeric,
  horizon_months int default 12,
  published_at date not null,
  source_url text,
  source_document_id uuid references source_documents(id),
  fetched_at timestamptz not null default now(),
  unique (asset_id, broker, published_at)
);

-- -----------------------------------------------------------------------------
-- Actualités, macro, opérations futures
-- -----------------------------------------------------------------------------
create table news_sources (
  id serial primary key,
  name text not null,
  kind text not null check (kind in ('rss', 'gdelt')),
  url text not null,
  market text references markets(code),
  enabled boolean not null default true
);

create table news_articles (
  id bigserial primary key,
  url text unique not null,
  title text not null,
  excerpt text,
  source text not null,
  language text,
  published_at timestamptz,
  sentiment numeric check (sentiment between -1 and 1),
  materiality smallint check (materiality between 0 and 3),
  category text,
  summary_fr text, summary_en text,
  classified_by text,
  fetched_at timestamptz not null default now()
);
create index news_published on news_articles (published_at desc);

create table news_asset_links (
  article_id bigint references news_articles(id) on delete cascade,
  asset_id text references assets(id) on delete cascade,
  relevance numeric,
  primary key (article_id, asset_id)
);

create table macro_series (
  country text not null,                       -- ISO-2 ou zone (UEMOA, CEMAC)
  indicator text not null,                     -- gdp_growth | inflation | policy_rate…
  period date not null,
  value numeric not null,
  source text not null,                        -- worldbank | imf | bceao | beac
  fetched_at timestamptz not null default now(),
  primary key (country, indicator, period, source)
);

create table capital_operations (
  id bigserial primary key,
  market text references markets(code),
  kind text not null check (kind in ('ipo', 'bond_issue', 'rights_issue', 'delisting', 'regulator_visa')),
  issuer text not null,
  title text not null,
  regulator text,                              -- AMF-UMOA, COSUMAF, SEC Nigeria
  visa_number text,
  amount numeric,
  currency text,
  price numeric,
  coupon_pct numeric,
  subscription_start date,
  subscription_end date,
  listing_date date,
  status text not null default 'announced',
  source text not null,
  source_url text,
  ai_analysis_id uuid,
  premium_until timestamptz,                   -- accès anticipé Premium
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Modèle, IA, classements
-- -----------------------------------------------------------------------------
create table consensus_results (
  asset_id text references assets(id) on delete cascade,
  as_of date not null,
  model_version text not null,
  orientation text not null,
  confidence text not null,
  confidence_value numeric not null,
  invalidation_level numeric,
  data_coverage numeric not null,
  result jsonb not null,                       -- ConsensusResult complet
  inputs jsonb not null,                       -- snapshot point-in-time (pour backtests futurs)
  created_at timestamptz not null default now(),
  primary key (asset_id, as_of, model_version)
);

create table consensus_backtests (
  id bigserial primary key,
  model_version text not null,
  scope text not null,                         -- 'ALL' | marché | asset_id
  horizon text not null,
  samples int not null,
  calls int not null,
  hits int not null,
  hit_rate numeric,
  range_coverage numeric,
  base_rate_up numeric,
  brier numeric,
  period_start date, period_end date,
  computed_at timestamptz not null default now()
);

create table ai_analyses (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,              -- type|asset|session_date|lang|prompt_version
  kind text not null,                          -- asset_analysis | chart_vision | close_report | weekly | ipo | news_summary
  asset_id text references assets(id) on delete cascade,
  market text references markets(code),
  language text not null default 'fr',
  session_date date,
  content jsonb not null,
  model text not null,
  prompt_version text not null,
  input_tokens int, output_tokens int, cache_read_tokens int,
  sources jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table rankings (
  scope text not null,                         -- 'AFRICA' | marché | 'BRVM:sector:banks'
  style text not null check (style in ('momentum', 'value', 'dividend', 'quality', 'overall')),
  session_date date not null,
  items jsonb not null,                        -- [{asset_id, score, rank, factors}]
  primary key (scope, style, session_date)
);

create table rag_chunks (
  id bigserial primary key,
  document_id uuid references source_documents(id) on delete cascade,
  asset_id text references assets(id) on delete cascade,
  content text not null,
  embedding vector(1024),
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Utilisateurs, abonnements, usage
-- -----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  language text not null default 'fr' check (language in ('fr', 'en')),
  base_currency text not null default 'XOF',
  country char(2),
  experience text check (experience in ('beginner', 'intermediate', 'pro')),
  plan plan_tier not null default 'free',
  premium_until timestamptz,
  trial_used boolean not null default false,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('revenuecat', 'cinetpay', 'notchpay', 'flutterwave')),
  provider_ref text not null,
  product_id text not null,                    -- nyota_premium_monthly | nyota_premium_yearly
  status text not null,                        -- trialing | active | grace | expired | refunded
  current_period_end timestamptz,
  raw jsonb,
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);

create table payment_events (
  id bigserial primary key,
  provider text not null,
  event_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)                  -- idempotence des webhooks
);

create table ai_usage (
  user_id uuid references auth.users(id) on delete cascade,
  day date not null default current_date,
  kind text not null,                          -- analysis | chat | vision
  count int not null default 0,
  primary key (user_id, day, kind)
);

create table watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table watchlist_items (
  watchlist_id uuid references watchlists(id) on delete cascade,
  asset_id text references assets(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (watchlist_id, asset_id)
);

create table portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Portefeuille virtuel',
  base_currency text not null default 'XOF',
  starting_cash numeric not null default 1000000,
  created_at timestamptz not null default now()
);

create table portfolio_transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  asset_id text not null references assets(id),
  side text not null check (side in ('buy', 'sell', 'dividend')),
  quantity numeric not null check (quantity > 0),
  price numeric not null check (price > 0),
  fees numeric not null default 0,
  executed_on date not null,
  created_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id text references assets(id) on delete cascade,
  kind text not null check (kind in ('price_above', 'price_below', 'change_pct', 'new_high', 'new_low', 'news', 'consensus_change', 'dividend')),
  threshold numeric,
  period text,                                 -- pour new_high/new_low : 1M, 1Y…
  active boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now()
);

create table push_tokens (
  user_id uuid references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- -----------------------------------------------------------------------------
-- Exploitation : collecte, anomalies, audit, cache API
-- -----------------------------------------------------------------------------
create table ingestion_runs (
  id bigserial primary key,
  job text not null,                           -- ingest_quotes | ingest_bulletin | classify_news…
  market text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  source_used text,
  attempts jsonb,
  rows_written int default 0,
  error text
);

create table data_anomalies (
  id bigserial primary key,
  asset_id text,
  kind text not null,
  severity anomaly_severity not null,
  message text not null,
  details jsonb,
  run_id bigint references ingestion_runs(id),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,                         -- 'system:ingest' | user uuid | 'admin:…'
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb                                -- source, version du modèle IA, prompt_version…
);

create table api_cache (
  key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null
);

create table admins (user_id uuid primary key references auth.users(id) on delete cascade);

-- -----------------------------------------------------------------------------
-- Fonctions utilitaires
-- -----------------------------------------------------------------------------
create or replace function is_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plan = 'premium' and (premium_until is null or premium_until > now())
                   from profiles where id = uid), false);
$$;

create or replace function is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = uid);
$$;

-- Incrémente atomiquement le compteur IA et renvoie false si le quota est dépassé.
create or replace function consume_ai_quota(p_kind text, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if is_premium(auth.uid()) then return true; end if;
  insert into ai_usage (user_id, day, kind, count) values (auth.uid(), current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = ai_usage.count + 1
  returning count into v;
  if v > p_limit then
    update ai_usage set count = count - 1 where user_id = auth.uid() and day = current_date and kind = p_kind;
    return false;
  end if;
  return true;
end $$;

-- Profil créé automatiquement à l'inscription.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, language) values (new.id, coalesce(new.raw_user_meta_data->>'language', 'fr'));
  insert into watchlists (user_id, name) values (new.id, 'Ma liste');
  insert into portfolios (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Limite gratuite : 1 liste de suivi.
create or replace function enforce_watchlist_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_premium(new.user_id) and (select count(*) from watchlists where user_id = new.user_id) >= 1 then
    raise exception 'FREE_PLAN_WATCHLIST_LIMIT';
  end if;
  return new;
end $$;
create trigger watchlist_limit before insert on watchlists
  for each row execute function enforce_watchlist_limit();

-- -----------------------------------------------------------------------------
-- Vues
-- -----------------------------------------------------------------------------
-- Vue publique "clôture" : pour les gratuits, on expose uniquement le dernier cours de clôture
-- (le différé intrajournalier est servi par l'edge function `quotes` après contrôle Premium).
create view quotes_close as
  select q.asset_id, b.close as last, b.session_date, b.volume, b.value, b.source, b.verified
  from quotes_latest q
  join lateral (select * from price_bars p where p.asset_id = q.asset_id order by session_date desc limit 1) b on true;

create view public_track_record as
  select distinct on (scope, horizon) scope, horizon, model_version, samples, calls, hits, hit_rate, range_coverage, base_rate_up, brier, period_start, period_end, computed_at
  from consensus_backtests order by scope, horizon, computed_at desc;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  -- Données de marché : lecture publique, écriture service_role uniquement.
  foreach t in array array['markets','market_holidays','sectors','assets','asset_shareholders','asset_executives',
    'price_bars','index_values','fx_rates','fundamentals','dividends','corporate_events','analyst_opinions',
    'news_articles','news_asset_links','macro_series','capital_operations','consensus_backtests','rankings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select using (true)', t);
  end loop;
end $$;

-- Fondamentaux non validés invisibles au public.
drop policy "public read" on fundamentals;
create policy "approved read" on fundamentals for select using (review_status = 'approved' or is_admin(auth.uid()));

-- Données réservées / internes.
alter table quotes_latest enable row level security;
create policy "premium read delayed" on quotes_latest for select using (is_premium(auth.uid()) or status = 'close');

alter table consensus_results enable row level security;   -- servi via edge function (masquage gratuit)
create policy "premium read" on consensus_results for select using (is_premium(auth.uid()));

alter table ai_analyses enable row level security;         -- servi via edge function (quota)
alter table rag_chunks enable row level security;
alter table source_documents enable row level security;
create policy "public read" on source_documents for select using (true);
alter table news_sources enable row level security;
alter table ingestion_runs enable row level security;
create policy "admin read" on ingestion_runs for select using (is_admin(auth.uid()));
alter table data_anomalies enable row level security;
create policy "admin all" on data_anomalies for all using (is_admin(auth.uid()));
alter table audit_log enable row level security;
create policy "admin read" on audit_log for select using (is_admin(auth.uid()));
alter table api_cache enable row level security;
alter table payment_events enable row level security;
alter table admins enable row level security;

-- Données utilisateur : propriétaire uniquement.
alter table profiles enable row level security;
create policy "own profile" on profiles for select using (id = auth.uid());
create policy "update own profile" on profiles for update using (id = auth.uid())
  with check (id = auth.uid());
-- plan/premium_until/trial_used ne sont modifiables que par le service_role (webhooks).
-- (Un REVOKE par colonne ne suffit pas : Supabase accorde UPDATE au niveau table.)
create or replace function protect_profile_billing() returns trigger
language plpgsql as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin')
     and (new.plan is distinct from old.plan or new.premium_until is distinct from old.premium_until
          or new.trial_used is distinct from old.trial_used) then
    raise exception 'BILLING_FIELDS_READ_ONLY';
  end if;
  return new;
end $$;
create trigger profiles_billing_guard before update on profiles
  for each row execute function protect_profile_billing();

alter table subscriptions enable row level security;
create policy "own subs" on subscriptions for select using (user_id = auth.uid());
alter table ai_usage enable row level security;
create policy "own usage" on ai_usage for select using (user_id = auth.uid());

alter table watchlists enable row level security;
create policy "own watchlists" on watchlists for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table watchlist_items enable row level security;
create policy "own items" on watchlist_items for all
  using (exists (select 1 from watchlists w where w.id = watchlist_id and w.user_id = auth.uid()))
  with check (exists (select 1 from watchlists w where w.id = watchlist_id and w.user_id = auth.uid()));
alter table portfolios enable row level security;
create policy "own portfolios" on portfolios for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table portfolio_transactions enable row level security;
create policy "own tx" on portfolio_transactions for all
  using (exists (select 1 from portfolios p where p.id = portfolio_id and p.user_id = auth.uid()))
  with check (exists (select 1 from portfolios p where p.id = portfolio_id and p.user_id = auth.uid()));
alter table alerts enable row level security;
create policy "own alerts" on alerts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table push_tokens enable row level security;
create policy "own tokens" on push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- TimescaleDB (optionnel)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'timescaledb') then
    create extension if not exists timescaledb;
    perform create_hypertable('price_bars', 'session_date', chunk_time_interval => interval '1 year', migrate_data => true, if_not_exists => true);
  end if;
exception when others then
  raise notice 'TimescaleDB indisponible, price_bars reste une table standard indexée : %', sqlerrm;
end $$;

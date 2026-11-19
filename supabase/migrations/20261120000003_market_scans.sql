-- Scan de marché précalculé après chaque séance : variations par période et distance
-- aux supports / résistances calculés sur la même période (seuil appliqué par l'app).
create table market_scans (
  market text not null references markets(code),
  period text not null check (period in ('1D', '1W', '1M', '3M', '6M', 'YTD', '1Y')),
  session_date date not null,
  rows jsonb not null,            -- ScanRow[] (packages/core/src/scan.ts)
  computed_at timestamptz not null default now(),
  primary key (market, period, session_date)
);
alter table market_scans enable row level security;
create policy "public read" on market_scans for select using (true);

-- Présentation de la société (activité), affichée dans l'onglet « Société » de la fiche.
alter table assets add column if not exists activity_fr text;
alter table assets add column if not exists activity_en text;
alter table assets add column if not exists headquarters text;
alter table assets add column if not exists employees int;
alter table assets add column if not exists founded_year int;

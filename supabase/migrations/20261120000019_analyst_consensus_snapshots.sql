-- Published analyst consensus summaries (e.g. press reviews of broker recommendations): counts per rating and
-- target range as published, with source and date. Complements individual broker notes (analyst_opinions).
create table if not exists analyst_consensus_snapshots (
  id bigserial primary key,
  asset_id text not null references assets(id) on delete cascade,
  published_at date not null,
  source_name text not null,
  source_url text,
  brokers text,                       -- names of the brokers covered, as published
  n_buy int, n_hold int, n_sell int,  -- null = not stated by the source
  target_mean numeric, target_min numeric, target_max numeric,
  reference_price numeric,            -- price the source used to compute upside
  horizon_months int default 12,
  note text,
  created_at timestamptz not null default now(),
  unique (asset_id, source_name, published_at)
);
alter table analyst_consensus_snapshots enable row level security;
create policy "premium read" on analyst_consensus_snapshots for select using (is_premium(auth.uid()));

insert into analyst_consensus_snapshots (asset_id, published_at, source_name, source_url, brokers, n_buy, n_hold, n_sell, target_mean, target_min, target_max, reference_price, note) values
('NGX:DANGCEM','2026-07-15','Nairametrics — revue des courtiers','https://nairametrics.com/2026/07/15/stock-buy-recommendations-zenith-uba-and-access-top-brokers-list/','Blue Marina, Arthur Steven, Meristem',3,0,0,1299.44,1188,1407.02,null,null),
('NGX:MTNN','2026-07-15','Nairametrics — revue des courtiers','https://nairametrics.com/2026/07/15/stock-buy-recommendations-zenith-uba-and-access-top-brokers-list/','Blue Marina, Arthur Steven, Meristem',3,0,0,1068.77,978,1209,null,null),
('NGX:ZENITHBANK','2026-07-15','Nairametrics — revue des courtiers','https://nairametrics.com/2026/07/15/stock-buy-recommendations-zenith-uba-and-access-top-brokers-list/','Cowry, Blue Marina, Arthur Steven, Meristem',4,0,0,159.48,null,null,null,null),
('NGX:GTCO','2026-07-15','Nairametrics — revue des courtiers','https://nairametrics.com/2026/07/15/stock-buy-recommendations-zenith-uba-and-access-top-brokers-list/','Blue Marina, Meristem, Arthur Steven (+ avis contraire d''Arthur Steven)',3,0,1,163.37,null,null,null,'Objectif moyen des 3 avis à l''achat ; un avis « vente » (Arthur Steven, objectif 78,45) exclu de la moyenne par la source.'),
('NGX:UBA','2026-07-15','Nairametrics — revue des courtiers','https://nairametrics.com/2026/07/15/stock-buy-recommendations-zenith-uba-and-access-top-brokers-list/','Blue Marina, Arthur Steven, Meristem',3,0,0,59.92,null,null,41,null),
('NGX:ACCESSCORP','2026-07-15','Nairametrics — revue des courtiers','https://nairametrics.com/2026/07/15/stock-buy-recommendations-zenith-uba-and-access-top-brokers-list/','Blue Marina, Arthur Steven, Meristem',3,0,0,54.17,32.02,86.30,null,'Objectifs très dispersés : la source retient une médiane de 44,18.'),
('NGX:UBA','2026-09-22','Nairametrics — revue des courtiers','https://nairametrics.com/2026/09/22/stock-buy-recommendations-bua-cement-uba-and-mtn-top-brokers-late-september-list/',null,4,null,null,59.31,50.13,66.07,44.55,null),
('NGX:BUACEMENT','2026-09-22','Nairametrics — revue des courtiers','https://nairametrics.com/2026/09/22/stock-buy-recommendations-bua-cement-uba-and-mtn-top-brokers-late-september-list/','Cowry, Blue Marina, First Securities, Futureview (achat) ; Arthur Steven (neutre)',4,1,0,null,362.79,435.75,null,null),
('NGX:BUACEMENT','2026-10-17','Nairametrics — revue des courtiers','https://nairametrics.com/2026/10/17/eight-stocks-lead-brokers-october-consensus-buy-list/',null,4,null,null,391.50,null,null,297,null),
('NGX:NB','2026-10-17','Nairametrics — revue des courtiers','https://nairametrics.com/2026/10/17/eight-stocks-lead-brokers-october-consensus-buy-list/',null,5,null,null,97.51,88.94,107.61,74.60,null),
('NGX:MTNN','2026-10-17','Nairametrics — revue des courtiers','https://nairametrics.com/2026/10/17/eight-stocks-lead-brokers-october-consensus-buy-list/',null,null,null,null,1214.83,null,null,840,'Nombre d''avis non précisé par la source.'),
('NGX:ETI','2026-10-17','Nairametrics — revue des courtiers','https://nairametrics.com/2026/10/17/eight-stocks-lead-brokers-october-consensus-buy-list/',null,null,null,null,153.59,null,null,67,'Nombre d''avis non précisé par la source.')
on conflict do nothing;

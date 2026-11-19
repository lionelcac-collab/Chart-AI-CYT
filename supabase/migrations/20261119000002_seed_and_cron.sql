-- Référentiel des marchés MVP (horaires indicatifs, à confirmer avec les règlements en vigueur)
insert into markets (code, name, countries, currency, timezone, open_time, close_time, bulletin_delay_min, regulator, phase, website) values
  ('BRVM', 'Bourse Régionale des Valeurs Mobilières', '{CI,SN,BJ,BF,ML,NE,TG,GW}', 'XOF', 'Africa/Abidjan', '09:00', '15:00', 120, 'AMF-UMOA', 1, 'https://www.brvm.org'),
  ('BVMAC', 'Bourse des Valeurs Mobilières de l''Afrique Centrale', '{CM,GA,CG,TD,CF,GQ}', 'XAF', 'Africa/Douala', '09:00', '14:00', 180, 'COSUMAF', 1, 'https://www.bvm-ac.org'),
  ('NGX', 'Nigerian Exchange', '{NG}', 'NGN', 'Africa/Lagos', '10:00', '14:30', 90, 'SEC Nigeria', 1, 'https://ngxgroup.com')
on conflict (code) do nothing;

insert into sectors (code, name_fr, name_en) values
  ('banks', 'Banques', 'Banks'),
  ('telecom', 'Télécommunications', 'Telecommunications'),
  ('consumer', 'Consommation', 'Consumer goods'),
  ('industry', 'Industrie', 'Industrials'),
  ('agri', 'Agro-industrie', 'Agribusiness'),
  ('energy', 'Énergie & services publics', 'Energy & utilities'),
  ('distribution', 'Distribution', 'Distribution'),
  ('transport', 'Transport', 'Transport'),
  ('insurance', 'Assurances', 'Insurance'),
  ('oil_gas', 'Pétrole & gaz', 'Oil & gas'),
  ('materials', 'Matériaux', 'Materials'),
  ('other', 'Autres', 'Other')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Planification (pg_cron + pg_net). À activer après avoir défini les secrets Vault :
--   select vault.create_secret('https://<project>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role_key>', 'service_role_key');
-- Les jobs tournent toutes les 15 min en semaine ; l'edge function vérifie elle-même
-- (isIngestionWindow) si la fenêtre post-séance de chaque bourse est ouverte et si
-- la séance du jour a déjà été collectée — ce qui gère les fuseaux sans multiplier les crons.
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function call_edge(fn text, body jsonb default '{}') returns void
language sql security definer as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := body);
$$;

select cron.schedule('ingest-eod', '*/15 12-20 * * 1-5', $$select call_edge('ingest-market', '{"job":"eod"}')$$);
select cron.schedule('ingest-delayed', '*/30 8-15 * * 1-5', $$select call_edge('ingest-market', '{"job":"delayed"}')$$);
select cron.schedule('news', '0 * * * *', $$select call_edge('ingest-news')$$);
select cron.schedule('post-close', '30 21 * * 1-5', $$select call_edge('post-close')$$);           -- consensus, classements, rapports, alertes
select cron.schedule('weekly-report', '0 18 * * 5', $$select call_edge('reports', '{"kind":"weekly"}')$$);
select cron.schedule('macro', '0 3 * * 1', $$select call_edge('ingest-macro')$$);
select cron.schedule('backtest', '0 4 * * 6', $$select call_edge('backtest')$$);
select cron.schedule('cache-gc', '0 2 * * *', $$delete from api_cache where expires_at < now()$$);

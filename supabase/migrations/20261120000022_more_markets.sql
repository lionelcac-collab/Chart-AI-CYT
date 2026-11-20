-- Eight more exchanges (data: Mansa Markets). Trading hours indicative, to confirm against each rulebook.
insert into markets (code, name, countries, currency, timezone, open_time, close_time, bulletin_delay_min, regulator, phase, enabled, website) values
('JSE', 'Johannesburg Stock Exchange', '{ZA}', 'ZAR', 'Africa/Johannesburg', '09:00', '17:00', 60, 'FSCA', 1, true, 'https://www.jse.co.za'),
('EGX', 'Egyptian Exchange', '{EG}', 'EGP', 'Africa/Cairo', '10:00', '14:30', 60, 'FRA', 1, true, 'https://www.egx.com.eg'),
('CSE_MA', 'Bourse de Casablanca', '{MA}', 'MAD', 'Africa/Casablanca', '09:30', '15:30', 60, 'AMMC', 1, true, 'https://www.casablanca-bourse.com'),
('NSE_KE', 'Nairobi Securities Exchange', '{KE}', 'KES', 'Africa/Nairobi', '09:30', '15:00', 60, 'CMA Kenya', 1, true, 'https://www.nse.co.ke'),
('GSE', 'Ghana Stock Exchange', '{GH}', 'GHS', 'Africa/Accra', '10:00', '15:00', 60, 'SEC Ghana', 1, true, 'https://gse.com.gh'),
('DSE', 'Dar es Salaam Stock Exchange', '{TZ}', 'TZS', 'Africa/Dar_es_Salaam', '10:00', '16:00', 60, 'CMSA Tanzania', 1, true, 'https://www.dse.co.tz'),
('USE', 'Uganda Securities Exchange', '{UG}', 'UGX', 'Africa/Kampala', '10:00', '16:00', 60, 'CMA Uganda', 1, true, 'https://www.use.or.ug'),
('RSE', 'Rwanda Stock Exchange', '{RW}', 'RWF', 'Africa/Kigali', '09:00', '12:00', 60, 'CMA Rwanda', 1, true, 'https://www.rse.rw')
on conflict (code) do update set enabled = true, name = excluded.name;
-- EGX trades Sunday–Thursday: collection and post-close also run on Sundays (other markets skip outside their window).
select cron.unschedule('ingest-eod');
select cron.schedule('ingest-eod', '*/15 11-20 * * 0-5', $$select call_edge('ingest-market', '{"job":"eod"}')$$);
select cron.unschedule('ingest-delayed');
select cron.schedule('ingest-delayed', '*/30 7-16 * * 0-5', $$select call_edge('ingest-market', '{"job":"delayed"}')$$);
select cron.unschedule('post-close');
select cron.schedule('post-close', '30 21 * * 0-5', $$select call_edge('post-close')$$);
select cron.schedule('post-close-final', '15 22 * * 0-5', $$select call_edge('post-close', '{"phase":"final"}'::jsonb)$$);

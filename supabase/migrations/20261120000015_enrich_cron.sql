-- Nightly company-profile refresh (new stocks and profiles older than 30 days), 40 per run.
select cron.schedule('enrich-companies', '45 3 * * *', $$select call_edge('enrich-companies', '{"limit":40}'::jsonb)$$);
-- Fix titles already stored with HTML entities.
update news_articles set title = replace(replace(replace(replace(title, '&#8211;', '–'), '&#8217;', '’'), '&amp;', '&'), '&#038;', '&') where title ~ '&(#\d+|amp);';

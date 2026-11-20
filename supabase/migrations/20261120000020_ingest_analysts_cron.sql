-- Weekly refresh of published broker-consensus reviews (Monday 05:37 UTC). Needs the FIRECRAWL_API_KEY secret.
select cron.schedule('ingest-analysts', '37 5 * * 1', $$select call_edge('ingest-analysts', '{"days":14,"maxArticles":4}'::jsonb)$$);

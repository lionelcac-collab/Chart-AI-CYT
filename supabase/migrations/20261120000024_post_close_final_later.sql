-- Per-market chains (JSE ~17 chunks) need more time: rankings + alerts one hour after the chains start.
select cron.unschedule('post-close-final');
select cron.schedule('post-close-final', '15 23 * * 0-5', $$select call_edge('post-close', '{"phase":"final"}'::jsonb)$$);

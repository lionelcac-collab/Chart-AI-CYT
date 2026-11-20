-- Idempotent upserts for the calendar / capital operations extracted from official bulletins.
create unique index if not exists corporate_events_uniq on corporate_events (asset_id, kind, event_date, source);
create unique index if not exists dividends_payment_uniq on dividends (asset_id, payment_date);
create unique index if not exists capital_operations_uniq on capital_operations (market, title);

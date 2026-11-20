-- Shareholding date is not always published: allow it to be unknown rather than inventing one.
-- as_of was part of the primary key, so move to a surrogate key + a unique index tolerant of null dates.
alter table asset_shareholders drop constraint if exists asset_shareholders_pkey;
alter table asset_shareholders add column if not exists id bigint generated always as identity;
alter table asset_shareholders add primary key (id);
alter table asset_shareholders alter column as_of drop not null;
create unique index if not exists asset_shareholders_uniq on asset_shareholders (asset_id, holder, coalesce(as_of, date '1900-01-01'));

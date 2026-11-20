-- News: market relevance (articles about an exchange, not only about one stock) + relevance flag.
alter table news_articles add column if not exists markets text[] not null default '{}';
alter table news_articles add column if not exists relevant boolean;
create index if not exists news_articles_markets on news_articles using gin (markets);
create index if not exists news_articles_published on news_articles (published_at desc);
-- Company profile provenance (Wikidata / Wikipedia, official sites…).
alter table assets add column if not exists wikidata_id text;
alter table assets add column if not exists profile_source text;
alter table assets add column if not exists profile_source_url text;
alter table assets add column if not exists profile_updated_at timestamptz;

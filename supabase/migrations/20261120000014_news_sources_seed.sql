-- Legal news sources: official exchange feeds, publishers' RSS (headline + link + excerpt), GDELT open index.
insert into news_sources (name, kind, url, market) values
  ('BRVM — actualités officielles', 'rss', 'https://www.brvm.org/fr/rss.xml', 'BRVM'),
  ('NGX Group — actualités officielles', 'rss', 'https://ngxgroup.com/feed/', 'NGX'),
  ('Agence Ecofin', 'rss', 'https://www.agenceecofin.com/rss', null),
  ('Financial Afrik', 'rss', 'https://www.financialafrik.com/feed/', null),
  ('Nairametrics', 'rss', 'https://nairametrics.com/feed/', 'NGX'),
  ('BusinessDay — Markets', 'rss', 'https://businessday.ng/category/markets/feed/', 'NGX'),
  ('The Africa Report', 'rss', 'https://www.theafricareport.com/feed/', null),
  ('GDELT — BRVM', 'gdelt', '("BRVM" OR "Bourse régionale des valeurs mobilières")', 'BRVM'),
  ('GDELT — BRVM grandes capitalisations', 'gdelt', '("Sonatel" OR "Orange Côte d''Ivoire" OR "Société Générale Côte d''Ivoire" OR "Ecobank Transnational" OR "Société Ivoirienne de Banque" OR "NSIA Banque")', 'BRVM'),
  ('GDELT — NGX', 'gdelt', '("Nigerian Exchange" OR "NGX Group" OR "NGX All-Share")', 'NGX'),
  ('GDELT — NGX grandes capitalisations', 'gdelt', '("Dangote Cement" OR "MTN Nigeria" OR "Zenith Bank" OR "GTCO" OR "Access Holdings" OR "Airtel Africa" OR "Seplat")', 'NGX'),
  ('GDELT — BVMAC', 'gdelt', '("BVMAC" OR "Bourse des valeurs mobilières de l''Afrique centrale")', 'BVMAC')
on conflict do nothing;

-- Business news feeds for the new exchanges' countries (public RSS: headline + link, classified/summarised by the app).
insert into news_sources (name, kind, url, market, enabled) values
('Moneyweb (Afrique du Sud)', 'rss', 'https://www.moneyweb.co.za/feed/', 'JSE', true),
('BusinessTech (Afrique du Sud)', 'rss', 'https://businesstech.co.za/news/feed/', 'JSE', true),
('Daily News Egypt — Business', 'rss', 'https://www.dailynewsegypt.com/category/business/feed/', 'EGX', true),
('Médias24 (Maroc)', 'rss', 'https://medias24.com/feed/', 'CSE_MA', true),
('LesEco.ma (Maroc)', 'rss', 'https://leseco.ma/feed/', 'CSE_MA', true),
('Capital FM Business (Kenya)', 'rss', 'https://www.capitalfm.co.ke/business/feed/', 'NSE_KE', true),
('Citi Newsroom Business (Ghana)', 'rss', 'https://citinewsroom.com/category/business/feed/', 'GSE', true),
('MyJoyOnline Business (Ghana)', 'rss', 'https://www.myjoyonline.com/business/feed/', 'GSE', true),
('Daily News (Tanzanie)', 'rss', 'https://dailynews.co.tz/feed/', 'DSE', true),
('The Independent (Ouganda)', 'rss', 'https://www.independent.co.ug/feed/', 'USE', true),
('The New Times (Rwanda)', 'rss', 'https://www.newtimes.co.rw/rss', 'RSE', true),
('GDELT — autres bourses africaines', 'gdelt', '("Johannesburg Stock Exchange" OR "Egyptian Exchange" OR "EGX30" OR "Casablanca Stock Exchange" OR "Bourse de Casablanca" OR "Nairobi Securities Exchange" OR "Ghana Stock Exchange" OR "Dar es Salaam Stock Exchange" OR "Uganda Securities Exchange" OR "Rwanda Stock Exchange")', null, true)
on conflict do nothing;
-- First run: Médias24 / BusinessTech refuse automated access (403) and The New Times / Citi Newsroom feeds are empty; the long GDELT query is rejected.
update news_sources set enabled = false where name in ('Médias24 (Maroc)', 'BusinessTech (Afrique du Sud)', 'The New Times (Rwanda)', 'Citi Newsroom Business (Ghana)', 'GDELT — autres bourses africaines');

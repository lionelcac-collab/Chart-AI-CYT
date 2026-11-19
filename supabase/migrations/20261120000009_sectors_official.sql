-- Sector taxonomy aligned with the exchanges' official classifications (BRVM 7 sectors, NGX 13 sectors).
update sectors set name_fr = 'Banques & services financiers', name_en = 'Banks & financial services' where code = 'banks';
update sectors set name_fr = 'Télécoms & technologies', name_en = 'Telecoms & technology' where code = 'telecom';
update sectors set name_fr = 'Consommation de base', name_en = 'Consumer staples' where code = 'consumer';
update sectors set name_fr = 'Industrie', name_en = 'Industrials' where code = 'industry';
update sectors set name_fr = 'Agriculture & agro-industrie', name_en = 'Agriculture & agribusiness' where code = 'agri';
update sectors set name_fr = 'Énergie & services publics', name_en = 'Energy & utilities' where code = 'energy';
update sectors set name_fr = 'Consommation discrétionnaire & distribution', name_en = 'Consumer discretionary & retail' where code = 'distribution';
update sectors set name_fr = 'Transport & logistique', name_en = 'Transport & logistics' where code = 'transport';
update sectors set name_fr = 'Ressources naturelles & matériaux', name_en = 'Natural resources & materials' where code = 'materials';
insert into sectors (code, name_fr, name_en) values
  ('conglomerates', 'Conglomérats', 'Conglomerates'),
  ('real_estate', 'Construction & immobilier', 'Construction & real estate'),
  ('healthcare', 'Santé', 'Healthcare'),
  ('services', 'Services', 'Services'),
  ('investment', 'Sociétés d’investissement', 'Investment companies')
on conflict (code) do nothing;

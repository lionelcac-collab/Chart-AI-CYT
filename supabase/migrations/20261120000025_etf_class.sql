-- Exchange-traded funds listed with stocks (mostly JSE): classify as 'etf' so stock rankings / model only cover companies.
update assets set asset_class = 'etf'
where asset_class = 'equity'
  and (name ~* '(\mETFs?\M|AMETF|\mETN\M|Satrix|CoreShares|Sygnia Itrix|1nvest|NewFunds|Easy ?ETFs|Prime ?ETF|Cloud Atlas|Absa NewGold|NewGold|Stanlib .*(Index|ETF)|Ashburton .*ETF|10X |Global X .*ETF)'
       or ticker ~* '^(STX|ETF|GLD|SYG|CSP|NFG)');
select market, asset_class, count(*) from assets where market in ('JSE','EGX','NSE_KE','CSE_MA','GSE','DSE','USE','RSE') group by 1,2 order by 1,2;
update assets set asset_class='fund' where market='JSE' and name ~* 'UCITS|Multi-Asset Income Fund';

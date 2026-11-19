-- Volume can be unknown (NGX official list publishes no reliable volume): null, not 0.
alter table price_bars alter column volume drop not null;
alter table price_bars alter column volume drop default;
update price_bars set volume = null where source = 'official_bulletin:NGX';

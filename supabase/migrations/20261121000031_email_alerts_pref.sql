-- E-mail alert digest: on by default, the user can turn it off from « Mes alertes ».
alter table profiles add column if not exists email_alerts boolean not null default true;

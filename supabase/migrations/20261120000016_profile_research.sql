-- One-time web research of company profiles: list of sources and confidence kept with the profile.
alter table assets add column if not exists profile_sources jsonb;
alter table assets add column if not exists profile_confidence text;

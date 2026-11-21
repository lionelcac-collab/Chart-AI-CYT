-- Moneroo (web checkout aggregator) as a subscription provider.
alter table subscriptions drop constraint if exists subscriptions_provider_check;
alter table subscriptions add constraint subscriptions_provider_check check (provider in ('revenuecat', 'cinetpay', 'notchpay', 'flutterwave', 'moneroo'));

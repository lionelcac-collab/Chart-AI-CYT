# Nyota ✦ — Bourses africaines & IA

Application d'analyse des marchés boursiers africains (BRVM, BVMAC, NGX, puis JSE, EGX, Casablanca…) assistée par IA,
sur **web, iOS et Android** à partir d'un seul code, en offres **Gratuit** et **Premium**, en français et en anglais.

> Outil d'information et d'analyse. Pas de conseil en investissement personnalisé, pas d'ordres de bourse.
> Estimations statistiques, pas une garantie ni un conseil en investissement.

## Documentation
- [Architecture](docs/ARCHITECTURE.md)
- [Modèle de consensus (formules) et backtest](docs/CONSENSUS_MODEL.md)
- [Coûts mensuels](docs/COSTS.md)
- [Publication App Store / Google Play](docs/STORE_PUBLISHING.md)
- [État d'avancement et ce qui dépend de vous](docs/STATUS.md)

## Structure
```
packages/core      calculs purs et testés (plus bas/hauts, indicateurs, liquidité, consensus, backtest)
packages/data      connecteurs de données (Mansa, bulletins officiels, macro, actualités) + contrôles
supabase/          migrations SQL (schéma, RLS, cron) et Edge Functions (Deno)
apps/mobile        application Expo (iOS, Android, Web)
```

## Démarrer
```bash
npm install
npm test                                  # tests core + data
cd apps/mobile && npx expo start          # app (mode DÉMO si aucun backend n'est configuré)
```
Sans `EXPO_PUBLIC_SUPABASE_URL`, l'app tourne en **mode démo** : titres **fictifs**, bandeau « données fictives » sur
chaque écran. Les calculs (plus bas/hauts, indicateurs, consensus) sont ceux du vrai code.

## Déployer le backend
```bash
supabase link --project-ref <ref>
supabase db push
node scripts/sync-shared.mjs              # copie packages/core et packages/data dans supabase/functions/_shared
supabase secrets set ANTHROPIC_API_KEY=... MANSA_API_KEY=... REVENUECAT_WEBHOOK_AUTH=... \
  REVENUECAT_SECRET_KEY=... CINETPAY_API_KEY=... CINETPAY_SITE_ID=... WEB_APP_URL=https://... ADMIN_ALERT_WEBHOOK=...
supabase functions deploy
```
Puis, dans l'éditeur SQL : `select vault.create_secret('<url>', 'project_url'); select vault.create_secret('<service_role_key>', 'service_role_key');`

## Web (Vercel)
Projet Vercel pointant sur `apps/mobile` (voir `apps/mobile/vercel.json`), variables `EXPO_PUBLIC_*`.

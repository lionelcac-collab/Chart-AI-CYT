# Nyota — Architecture

> **Nyota** (« étoile » en swahili) est le nom retenu pour « [NOM DE L'APPLI] ». Il est défini à un seul endroit
> (`APP_NAME` dans `packages/core/src/index.ts`, `name`/`slug` dans `apps/mobile/app.json`) et se change en 2 minutes.
> Vérifiez sa disponibilité (marques OAPI/INPI/EUIPO, noms de domaine, App Store) avant tout dépôt.

## 1. Vue d'ensemble

```
                ┌──────────────────────────── Clients (1 seul code) ────────────────────────────┐
                │  Expo / React Native + TypeScript + Expo Router                                 │
                │  iOS · Android · Web (React Native Web, déployé sur Vercel)                     │
                │  Graphiques : Lightweight Charts (web) · SVG natif (iOS/Android)                │
                │  Cache hors ligne : TanStack Query (24 h) · AsyncStorage                        │
                └───────┬───────────────────────────┬───────────────────────────┬────────────────┘
                        │ PostgREST (RLS)           │ Edge Functions (Deno)     │ RevenueCat SDK
                        ▼                           ▼                           ▼
┌─────────────────────────────── Supabase ───────────────────────────────┐   ┌──────────────┐
│ PostgreSQL 15 (+TimescaleDB si dispo, pgvector, pg_trgm)               │   │ RevenueCat   │
│  référentiel · price_bars · quotes_latest · fundamentals · dividends   │◄──┤ App Store    │
│  analyst_opinions · news · macro · consensus_results · rankings        │   │ Google Play  │
│  ai_analyses (cache) · audit_log · ingestion_runs · data_anomalies     │   └──────────────┘
│ Auth (OTP e-mail) · Storage (documents sources)                        │   ┌──────────────┐
│ pg_cron + pg_net → appelle les jobs                                    │◄──┤ CinetPay     │
│ Edge Functions : asset · analyze · chat · chart-vision · reports       │   │ (web : Mobile│
│   ingest-market · ingest-news · ingest-macro · post-close · backtest   │   │ Money/carte) │
│   revenuecat-webhook · payment-init · payment-webhook · delete-account │   └──────────────┘
└───────┬───────────────────────────────┬────────────────────────────────┘
        │                               │
        ▼                               ▼
┌──────────────────────┐   ┌───────────────────────────────────────────────┐
│ Claude API           │   │ Sources de données (légales)                  │
│ Haiku 5.5 : masse    │   │ BRVM, NGX : Mansa Markets API (+ bulletins)   │
│ Sonnet 5.5 : analyses│   │ BVMAC : bulletins officiels (source n° 1)     │
│ chat, vision         │   │ Banque mondiale · FMI · BCEAO/BEAC/CBN        │
└──────────────────────┘   │ RSS officiels · GDELT                         │
                           │ [désactivés] API NGX officielle · flux TR     │
                           └───────────────────────────────────────────────┘
```

## 2. Arborescence

| Dossier | Rôle |
|---|---|
| `packages/core` | Calculs purs, testés, partagés app + serveur : plus bas/plus hauts, performances, volatilité, indicateurs (MM, RSI, MACD, Bollinger, supports/résistances, figures), liquidité, ratios, contrôles de cohérence, **modèle de consensus**, **backtest**, horaires des bourses, droits Gratuit/Premium. |
| `packages/data` | Connecteurs derrière l'interface commune `MarketDataConnector` + registre avec source de secours ; Mansa, bulletins officiels, Banque mondiale/FMI, RSS/GDELT, contrôles d'anomalies, emplacements désactivés (API NGX, temps réel sous licence). |
| `supabase/migrations` | Schéma SQL, RLS, quotas, triggers, planification pg_cron. |
| `supabase/functions` | Edge Functions Deno. `_shared/core` et `_shared/data` sont **générés** par `node scripts/sync-shared.mjs` (même code que l'app). |
| `apps/mobile` | Application Expo (iOS, Android, Web). |
| `docs/` | Architecture, modèle de consensus, coûts, publication, état d'avancement. |

## 3. Flux de données

1. **Collecte (pg_cron toutes les 15 min en semaine)** → `ingest-market` vérifie pour chaque bourse, dans *son* fuseau
   (`Africa/Abidjan`, `Africa/Douala`, `Africa/Lagos`), si la séance est close + délai de publication du bulletin, et si
   la séance n'a pas déjà été collectée. Un seul cron gère donc tous les fuseaux.
2. **Sources par marché** (registre ordonné, la première source active qui répond est retenue, chaque tentative est
   journalisée dans `ingestion_runs.attempts`) :

   | Marché | Source n° 1 | Secours | Contrôle / historique |
   |---|---|---|---|
   | BRVM | Mansa Markets | — | bulletin officiel (BOC) |
   | **BVMAC** | **bulletin officiel BVMAC** (aucune API commerciale ne couvre la BVMAC) | Mansa (si couverture ajoutée) | historique reconstitué à partir des bulletins passés (`job: "backfill"`) |
   | NGX | Mansa Markets | — | bulletin / liste de cours NGX |

   Si le bulletin du jour n'est pas encore publié, la séance précédente est conservée, la collecte reste « partielle » et
   est retentée toutes les 15 min ; l'admin n'est alerté qu'après 4 h de retard.
3. **Contrôles** : cours ≤ 0, variation au-delà de la limite journalière (BRVM ±7,5 %), cotation périmée, OHLC incohérent,
   **écart > 0,5 % avec le bulletin officiel** → le cours est **bloqué** (non publié), une anomalie est créée et l'admin est
   alerté (webhook Slack/Discord/e-mail). Les cours recoupés avec le bulletin sont marqués `verified = true`.
4. **Post-séance** (`post-close`) : consensus de chaque titre (stocké avec ses entrées *point-in-time* pour les futurs
   backtests), classements (Afrique, marché, secteur × momentum/valeur/dividende/qualité/global), synthèse de clôture IA,
   évaluation des alertes + notifications push.
5. **Hebdomadaire** : rapport de la semaine, macro (Banque mondiale/FMI), backtest public du modèle.

Chaque donnée affichée porte : **source**, **horodatage**, **statut** (`Clôture du JJ/MM`, `Différé ~30 min`) — composant
`ProvenanceBadge`. Une donnée absente s'affiche « Donnée indisponible » ; aucun connecteur ne complète un champ manquant.

## 4. IA (Claude)

| Usage | Modèle | Coût maîtrisé par |
|---|---|---|
| Classement d'actualités (tickers, sentiment, matérialité, résumé FR/EN) | `claude-haiku-5-5` | lots de 25, effort `low` |
| Synthèses de clôture / hebdo | `claude-haiku-5-5` | 1 appel / marché / séance, cache |
| Extraction des états financiers (PDF) | `claude-haiku-5-5` | 1 fois par document (hash SHA-256) + contrôles de cohérence + validation admin |
| Analyse complète d'un titre | `claude-sonnet-5-5` | cache par titre × séance × langue (1 génération partagée par tous les utilisateurs) |
| Assistant conversationnel (outils sur la base) | `claude-sonnet-5-5` | quotas, effort `low`, historique tronqué, résultats d'outils plafonnés |
| Lecture de capture de graphique | `claude-sonnet-5-5` | Premium uniquement |

- Sorties **structurées** (JSON Schema via `output_config.format`) : l'app n'affiche jamais de texte libre non contrôlé
  pour les chiffres.
- Les chiffres (indicateurs, plus bas/hauts, consensus) sont **calculés par le code** ; l'IA ne fait que les expliquer.
- Prompt système stable mis en cache (`cache_control`), consigne « jamais de donnée inventée, citer date + source,
  aucune formulation impérative ».
- Repli serveur en cas de refus (`fallbacks: "default"`) activé pour Sonnet.
- **Audit** : chaque génération écrit modèle, version de prompt et consommation dans `audit_log`.

## 5. Gratuit / Premium

Une seule source de vérité : `profiles.plan` + `premium_until`, alimentée par :
- **RevenueCat** (achats intégrés Apple/Google, obligatoires sur mobile) → `revenuecat-webhook` ;
- **CinetPay** (web : Mobile Money + carte) → `payment-webhook` qui **revérifie** la transaction côté serveur, puis
  reflète l'abonnement dans RevenueCat (droit promotionnel) pour que l'app mobile voie le même statut.

Application des droits **côté serveur** : RLS (`quotes_latest` différé, `consensus_results`), quota IA atomique en SQL
(`consume_ai_quota`), limite d'1 liste de suivi (trigger), masquage du consensus pour les gratuits dans `asset`,
garde-fou empêchant un utilisateur de modifier lui-même son plan (trigger `profiles_billing_guard`, testé).

## 6. Performance réseau faible

- Bundles web découpés par route (Expo Router), données JSON compactes, pas d'images lourdes (icônes texte/SVG).
- TanStack Query : cache 24 h, pas de refetch au focus, rafraîchissement manuel (tirer pour actualiser).
- Les calculs lourds (consensus, classements) sont faits une fois par séance côté serveur et servis en cache.

## 7. Sécurité & conformité

- RLS sur toutes les tables ; écriture des données de marché réservée au `service_role`.
- Jobs protégés par la clé `service_role` ; webhooks par secret partagé + idempotence (`payment_events`).
- Suppression de compte dans l'app (`delete-account`, exigence Apple 5.1.1(v)).
- Journal d'audit des sources et des versions de modèles IA.
- Pas de revente des données brutes ; attribution « Mansa Markets » et « TradingView Lightweight Charts » affichée.

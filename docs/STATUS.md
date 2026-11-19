# État d'avancement

Légende : ✅ fait et vérifié · 🟡 fait, à valider avec vos accès/données réels · ⏳ à faire · 👤 dépend de vous

## Étape 1 — Architecture, schéma, modèle, coûts ✅
- ✅ Architecture : `docs/ARCHITECTURE.md`
- ✅ Schéma PostgreSQL + RLS + quotas + planification : `supabase/migrations/` — appliqué sur un PostgreSQL 16 local :
  création auto du profil, isolation RLS, quota IA atomique (4ᵉ analyse gratuite refusée), limite d'1 liste, impossibilité
  pour un utilisateur de se passer Premium lui-même.
- ✅ Modèle de consensus (formules) : `docs/CONSENSUS_MODEL.md`
- ✅ Coûts : `docs/COSTS.md`

## Étape 2 — MVP web + mobile (BRVM, BVMAC, NGX)
| Élément | État |
|---|---|
| Calculs (plus bas/hauts 1S→3A avec dates, position %, écarts ; performances + YTD ; volatilité ; MM20/50/200, RSI, MACD, Bollinger, supports/résistances, tendance, figures ; liquidité ; ratios) | ✅ 20 tests |
| Connecteur Mansa (cours, indices, forex, historique) + cache + quota + registre avec secours | 🟡 testé sur réponses simulées ; chemins/champs/en-tête d'auth configurables à confirmer avec la doc fournie avec votre clé |
| Parseur des bulletins officiels (PDF → texte → lignes) + recoupement > 0,5 % | 🟡 testé sur un format type ; à caler sur 3–4 vrais bulletins par bourse (`PROFILES`) et URL à renseigner (`BULLETIN_URL_*`) |
| Contrôles d'anomalies (limite ±7,5 % BRVM, cours périmés, OHLC, divergence) + alerte admin | ✅ |
| Banque mondiale / FMI, RSS + GDELT, classement d'actualités par Haiku | 🟡 code prêt ; flux RSS officiels à lister dans `news_sources` |
| Edge Functions (fiche actif, analyse IA, chat à outils, vision, rapports, collecte, post-séance, backtest, paiements, suppression de compte) | ✅ typecheck Deno ; 🟡 non exécutées contre un vrai projet Supabase/Claude |
| App Expo : tableau de bord (indices, top/flop, volumes, carte sectorielle, opportunités), fiche actif complète, graphique, screener, liste de suivi, assistant + capture de graphique, Premium, transparence du modèle, mentions légales, FR/EN, thème sombre/clair, conversion FCFA↔EUR | ✅ build web + captures vérifiées (mode démo) ; typecheck iOS/Android ✅ ; 🟡 non lancée sur appareil |
| Connexion par code e-mail, push, achats RevenueCat, paiement web CinetPay | 🟡 code prêt, nécessite vos comptes |
| Portefeuille virtuel, calendrier, écran IPO/emprunts, alertes (écran de création), rapports PDF | ⏳ tables et jobs prêts, écrans à faire |
| Extraction IA des rapports annuels (job + file de validation admin) | ⏳ contrôles de cohérence prêts (`checkFundamentalsConsistency`), job à écrire |
| Interface d'administration (anomalies, validation fondamentaux, saisie avis d'analystes) | ⏳ |

## Étape 3 — Consensus & backtest
- ✅ Modèle complet + backtest walk-forward + écran public « Transparence du modèle »
- 🟡 Le taux de réussite s'affichera après ≥ 2 ans d'historique vérifié en base (aucun chiffre affiché avant : pas de résultat inventé)
- ⏳ Collecte des avis d'analystes publics (SGI/courtiers) : saisie admin ou extraction IA des notes publiées

## Étape 4 — Stores
- ✅ Configuration EAS, permissions, conformité (voir `docs/STORE_PUBLISHING.md`)
- ⏳ Icône et écran de lancement Nyota (les fichiers d'`assets/` sont ceux du modèle Expo), captures, fiches

## Étape 5 — Phase 2 (JSE, EGX, Casablanca, NSE, GSE…)
- ✅ Codes marchés, horaires/fuseaux des principales bourses, connecteur Mansa déjà multi-marchés
- ⏳ Profils de bulletins, seuils de liquidité et limites de variation par marché, activation dans `markets.enabled`

## 👤 Ce qui dépend de vous
1. **Clé Mansa Markets API** (+ plan, quotas, doc des champs/historique) → secret `MANSA_API_KEY` (+ `MANSA_*` si besoin).
   L'hôte `mansamarkets.com` était bloqué depuis mon environnement : je n'ai pas pu lire leur doc détaillée.
2. **Projet Supabase** : URL + clés ; `supabase link`, `supabase db push`, `supabase functions deploy` ; secrets Vault `project_url` et `service_role_key` pour pg_cron.
3. **Clé API Anthropic** → secret `ANTHROPIC_API_KEY`.
4. **Comptes Apple Developer et Google Play**, compte Expo.
5. **RevenueCat** (produits, droit `premium`, webhook, clé secrète pour refléter les achats web).
6. **CinetPay** (ou NotchPay/Flutterwave) : `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `WEB_APP_URL` ; vérifier leurs endpoints actuels.
7. **URL des bulletins officiels** par bourse et liste des flux RSS officiels.
8. **Validation juridique** : statut d'outil d'information vs conseil (AMF-UMOA, COSUMAF, SEC Nigeria), politique de
   confidentialité, CGU, licence de réutilisation des bulletins.
9. **Nom et marque** : confirmer « Nyota » (ou me donner le nom définitif) et l'identité visuelle (icône).
10. **Prix** : valider la grille (`PRICING` dans `packages/core/src/entitlements.ts`).

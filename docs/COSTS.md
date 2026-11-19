# Estimation des coûts mensuels

Hypothèses : MVP BRVM + BVMAC + NGX (~210 titres), 3 langues d'affichage ramenées à 2 (FR/EN), 22 séances/mois.
Les tarifs des tiers sont **à confirmer** sur leurs grilles en vigueur au moment de l'ouverture des comptes
(je n'ai pas pu consulter tous les sites depuis cet environnement).

## 1. Infrastructure

| Poste | Lancement (≤ 2 000 utilisateurs actifs) | Croissance (~10 000 actifs/mois) |
|---|---|---|
| Supabase | Pro ~25 $ | Pro + calcul supplémentaire ~60–110 $ |
| Vercel (web) | Hobby 0 $ (usage non commercial) → Pro 20 $ dès la monétisation | 20 $ |
| Expo / EAS Build | Gratuit (builds en file d'attente) | Production ~99 $ (optionnel : builds prioritaires + mises à jour OTA élevées) |
| Notifications (Expo Push → FCM/APNs) | 0 $ | 0 $ |
| RevenueCat | 0 $ jusqu'au seuil gratuit de revenus | ~1 % du revenu au-delà |
| Nom de domaine + e-mail | ~3 $ | ~3 $ |
| **Mansa Markets API** | **selon votre plan** (à fournir) | selon plan |
| Licences de données des bourses (redistribution) | à négocier si exigé | à négocier |

## 2. IA (Claude) — tarifs API par million de jetons
Haiku 5.5 : 0,10 $ entrée / 0,50 $ sortie · Sonnet 5.5 : 2 $ entrée / 10 $ sortie (cache lecture moins cher).

| Usage | Calcul | Lancement | ~10 000 actifs |
|---|---|---|---|
| Classement d'actualités (Haiku) | ~300 articles/j, lots de 25 | < 1 $ | ~1 $ |
| Synthèses clôture + hebdo (Haiku) | 3 marchés × 22 séances | < 0,1 $ | < 0,1 $ |
| Extraction rapports financiers (Haiku, PDF) | ~400 documents/an, 1 fois chacun | ~1 $ | ~1 $ |
| Analyses complètes (Sonnet) | **mises en cache par titre × séance × langue** ; ~8 k jetons entrée + 1,5 k sortie ≈ 0,031 $ | ~40 $ (≈ 60 analyses uniques/séance) | 120–290 $ (pire cas : 210 titres × 2 langues × 22 séances) |
| Assistant (Sonnet, 2–3 appels/question) | ~0,035 $ / question | ~60 $ (1 700 questions) | ~420 $ (12 000 questions) |
| Lecture de graphiques (Sonnet, Premium) | ~0,012 $ / image | ~5 $ | ~60 $ |
| **Total IA** | | **~110 $** | **~600–800 $** |

Leviers si la facture monte : quotas (déjà en place), cache des réponses fréquentes, Haiku pour le premier tour du chat,
réponses de l'assistant mises en cache pour les questions identiques du jour, API *Batch* (–50 %) pour les analyses
pré-générées après la séance.

## 3. Comptes et frais fixes

| | Coût |
|---|---|
| Apple Developer Program | 99 $/an |
| Google Play Console | 25 $ une fois |
| Commission stores | 15 % (programmes « Small Business » Apple/Google, < 1 M$/an) |
| CinetPay / NotchPay / Flutterwave | commission par transaction (≈ 2,5–3,5 % selon moyen de paiement, à confirmer) |

## 4. Ordre de grandeur de rentabilité

| | Lancement | ~10 000 actifs |
|---|---|---|
| Coûts totaux | ~160–250 $/mois (+ Mansa) | ~800–1 200 $/mois (+ Mansa) |
| Abonnés Premium (hypothèse 4–6 %) | 80–120 | 400–600 |
| Revenu net (2 500 FCFA ≈ 3,81 €/mois, après 15 % de commission, mix mensuel/annuel) | ~280–420 € | ~1 400–2 100 € |

Point mort ≈ 60–80 abonnés au lancement (hors coût Mansa). La publicité discrète sur l'offre gratuite et l'offre annuelle
(paiement d'avance) améliorent la trésorerie.

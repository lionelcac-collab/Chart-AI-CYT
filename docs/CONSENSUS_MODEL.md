# Consensus Chart-BoursafrikIA — spécification du modèle (v1.0.0)

Implémentation : `packages/core/src/consensus.ts` (fonctions pures, testées dans `packages/core/test`).
Version affichée dans l'app : `chart-boursafrikia-consensus-1.0.0`. Toute modification des formules ⇒ nouvelle version + nouveau backtest.

> Mention obligatoire affichée partout : « Estimations statistiques, pas une garantie ni un conseil en investissement. »

## Partie A — Consensus des analystes

Sources : notes de recherche **publiques** des SGI, courtiers et banques (PDF publiés), saisies ou extraites dans
`analyst_opinions` avec date et lien source.

- On garde **l'avis le plus récent par courtier**, publié depuis **≤ 365 jours**.
- Affichés : nombre d'analystes, objectif moyen / min / max, potentiel implicite `(objectif moyen / cours − 1)`,
  répartition achat / conserver / vente, date et source de chaque avis.
- 0 analyste ⇒ message explicite « Aucun analyste ne publie de recommandation suivie sur ce titre ».

## Partie B — Modèle quantitatif

Sept facteurs, chacun ramené dans **[−1 ; +1]** (`clamp`). Un facteur sans donnée vaut `null` et **n'est pas remplacé** :
son poids est redistribué et la confiance baisse.

| Facteur | Formule |
|---|---|
| **T — Tendance & momentum** | σ = volatilité annualisée (252 séances). `m6 = ln(P/P₋₁₂₆) / (σ·√0,5)` ; `m12 = ln(P₋₂₁/P₋₂₅₂) / σ` (momentum 12-1) ; `mom = ½·clamp(m6/2) + ½·clamp(m12/2)` ; `ma = ½·sign(P − MM200) + ½·sign(MM50 − MM200)` ; `T = 0,6·mom + 0,4·ma − 0,2·[RSI>75] + 0,2·[RSI<25]` |
| **V — Valorisation relative** | `vPER = moyenne( ln(PER_pairs/PER), ln(PER_5ans/PER) ) / ln 2` ; `vPB = ln(PB_pairs/PB) / ln 2` ; `vRdt = (rdt − rdt_pairs) / max(rdt_pairs, 1)` ; `V = moyenne(disponibles)` (moins cher ⇒ positif) |
| **Q — Qualité** | `(ROE−12)/12` ; `(marge nette−8)/12` ; `(1 − D/FP)/1,5` ; `TCAM résultat 3 ans / 15` ; `(années bénéficiaires sur 5 − 3)/2`. Banques : marge et dette exclues. `Q = moyenne` |
| **D — Dividende** | `(rdt − 4)/4` ; `(années versées sur 5 − 2,5)/2,5` ; ajustement payout : > 100 % ⇒ −0,5, < 80 % ⇒ +0,2 |
| **S — Sentiment** | moyenne des scores IA [−1;1] des articles des 30 derniers jours, pondérés `exp(−âge/10 j)`, rétrécie `× n/(n+5)` |
| **M — Macro (pays)** | `(croissance PIB − 3)/3` ; `(5 − inflation)/5` ; `−Δ taux directeur 12 mois / 2` |
| **A — Analystes** | `clamp(potentiel % / 30) × n/(n+2)` |

### Pondérations par horizon

| | T | S | V | Q | D | M | A |
|---|---|---|---|---|---|---|---|
| 1 mois | 0,40 | 0,20 | 0,08 | 0,05 | 0,07 | 0,05 | 0,15 |
| 3 mois | 0,30 | 0,15 | 0,15 | 0,10 | 0,08 | 0,07 | 0,15 |
| 6 mois | 0,22 | 0,08 | 0,22 | 0,15 | 0,10 | 0,08 | 0,15 |
| 12 mois | 0,15 | 0,05 | 0,25 | 0,20 | 0,12 | 0,08 | 0,15 |

Score composite : `S_h = Σ wᵢ·fᵢ / Σ wᵢ` sur les facteurs disponibles. Couverture : `Σ w(disponibles) / Σ w`.

### Du score à la distribution

- Volatilité utilisée : `σ* = max(σ, 12 %) × k_liq` avec `k_liq` = 1 (liquidité élevée), 1,1 (moyenne), 1,25 (faible),
  1,5 (très faible) : les titres peu échangés ont des cours « figés » qui sous-estiment le risque réel.
- Horizon `h` en années, `s = σ*·√h`.
- Log-rendement `X ~ N(μ, s²)` avec **`μ = α · S_h · s`**, `α = 0,2` (≈ coefficient d'information de 0,1 ; calibré par le
  backtest, plafonné à 0,4).
- À 6 et 12 mois, mélange avec l'objectif des analystes : `μ ← (1−β)·μ + β·clamp(ln(objectif/P)·h, ±2s)`,
  `β = min(0,5 ; 0,1·n_analystes)` (moitié à 6 mois).

### Scénarios et probabilités

Seuil `k = 0,5·s` :
- **Baissier** : `X < −k`, probabilité `Φ((−k−μ)/s)`, cours représentatif = espérance conditionnelle (loi normale tronquée).
- **Central** : `−k ≤ X ≤ k`, probabilité complémentaire, cours représentatif = médiane `P·e^μ` (bornée à la bande).
- **Haussier** : `X > k`, probabilité `1 − Φ((k−μ)/s)`, espérance conditionnelle.
- **Fourchette 80 %** : `P·exp(μ ± 1,2816·s)`.

### Orientation, invalidation, confiance

- Orientation (12 mois) : `S > 0,15` positive, `S < −0,15` négative, sinon neutre. Libellés descriptifs, jamais « achetez ».
- **Niveau d'invalidation** : orientation positive ⇒ support le plus proche sous le cours (dans `2·s(3 mois)`), sinon
  `P·e^(−1,645·s(3M))` ; symétrique pour une orientation négative (résistance).
- **Confiance** `= couverture × k_liquidité × k_historique × accord`
  - `k_liquidité` : 1 / 0,85 / 0,6 / 0,4 ; `k_historique` : ≥ 504 séances 1, ≥ 252 0,85, sinon 0,6 ;
  - `accord = 1 − 0,5 × (poids des facteurs de signe opposé à S)`.
  - ≥ 0,6 élevée · ≥ 0,35 moyenne · sinon faible ; **plafonnée à « moyenne » sans fondamentaux**.
- **Facteurs principaux** : les 5 contributions `wᵢ·fᵢ / Σw` les plus fortes en valeur absolue, expliquées en langage simple
  (`explainFactor`, FR/EN).

## Score de liquidité

`fréquence = 1 − séances_sans_échange/séances` (63 séances) ; `profondeur = clamp(log₁₀(valeur_moy/plancher) / log₁₀(plafond/plancher), 0, 1)` ;
`score = 100·(0,6·fréquence + 0,4·profondeur)`. Plancher/plafond par marché (BRVM : 1 M → 500 M FCFA/jour).
Score < 45 ⇒ avertissement « titre peu échangé » affiché.

## Backtest (transparence)

`packages/core/src/backtest.ts` — *walk-forward* sans regard vers le futur :
toutes les 21 séances, à partir de 252 séances d'historique, le modèle tourne sur `bars[0..t]` uniquement, puis on compare
au cours de `t + h`. Mesures publiées (vue `public_track_record`, écran « Transparence du modèle ») :

- **Taux de réussite directionnel** (appels |S| > 0,15) **comparé au taux de base** (part des périodes haussières) ;
- **Couverture** de la fourchette 80 % (cible ≈ 80 %) ;
- **Score de Brier** de la probabilité du scénario haussier ;
- rendement moyen réalisé des appels haussiers vs baissiers.

Limite assumée : tant que les fondamentaux, actualités et avis d'analystes ne sont pas disponibles en historique
*point-in-time*, le backtest porte sur la partie « prix » du modèle. Depuis la v1, chaque consensus calculé est stocké avec
ses entrées (`consensus_results.inputs`) : le backtest du modèle complet deviendra possible au fil des mois.

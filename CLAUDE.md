# Chart-AI-CYT

## Publicités et réseaux sociaux : Metricool d'abord, Adspirer seulement en dernier recours

**Règle : utiliser Adspirer uniquement pour les tâches que Metricool ne peut pas faire.**
Adspirer est limité en crédits (offre gratuite : 15 appels par mois), Metricool non.

### Avec Metricool (par défaut)
- Résultats des publicités Meta : `getAnalyticsDataByMetrics`, réseau `metaAds`
  (ex. `FAEV01` impressions, `FAEV03` couverture totale, `FAEV04` dépenses, `FAEV05` clics).
  Marque reliée au compte publicitaire Meta : « VISITEUR Incognito » (brandId `8124630`).
- Résultats TikTok Ads, Google Ads et des réseaux sociaux (Facebook, Instagram, TikTok, LinkedIn…).
- Programmation et suivi des publications : `createScheduledPost`, `getScheduledPosts`.
- Meilleures heures de publication : `getBestTimeToPostByNetwork`.

### Avec Adspirer (seulement si Metricool ne sait pas le faire)
- Créer, modifier, mettre en pause, relancer ou supprimer une campagne, un ensemble de publicités
  ou une publicité (Meta Ads, TikTok Ads).
- Changer un budget de campagne.
- Analyser les publicités en cours d'un concurrent (`competitor_ads_research`).
- Ciblage et audiences publicitaires détaillés.

Avant tout appel Adspirer, vérifier le quota avec `get_usage_status`. Si `used >= limit`,
ne pas l'appeler : dire à l'utilisateur que le quota est épuisé jusqu'à `period_end`
et proposer le Gestionnaire de publicités Meta à la place.

## Tableau de bord des applications

Tableau de bord des applications connectées (abonnements, crédits, liens) :
https://claude.ai/artifact/VR4upJ6RjQeA7H5B8xfkho

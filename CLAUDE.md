# Chart-AI-CYT

## Publicités Meta (Facebook / Instagram) : quel connecteur utiliser

1. Vérifier d'abord le quota Adspirer avec `get_usage_status` (connecteur « Adspirer Social Ads »).
2. Si `used >= limit` (quota du mois épuisé), **ne pas appeler les autres outils Adspirer** : utiliser Metricool à la place.
   - Lecture des résultats : `getAnalyticsDataByMetrics` sur le réseau `metaAds`
     (ex. `FAEV01` impressions, `FAEV03` couverture totale, `FAEV04` dépenses, `FAEV05` clics).
   - Marque Metricool reliée au compte publicitaire Meta : « VISITEUR Incognito » (brandId `8124630`).
   - Programmation de publications : `createScheduledPost`.
   - Metricool ne crée ni ne modifie de campagnes publicitaires : pour cela, attendre la remise à zéro
     du quota Adspirer (date `period_end`) ou le dire à l'utilisateur.
3. Si le quota Adspirer n'est pas épuisé, Adspirer peut être utilisé normalement.

## Tableau de bord des applications

Tableau de bord des applications connectées (abonnements, crédits, liens) :
https://claude.ai/artifact/VR4upJ6RjQeA7H5B8xfkho

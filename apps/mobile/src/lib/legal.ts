// In-app legal texts (drafts to be validated by a lawyer before publication).
// The full versions are also published on the website (docs/legal/*) for the store listings.
type Doc = { title: string; sections: { h: string; p: string }[] };

export const LEGAL: Record<'disclaimer' | 'privacy' | 'terms' | 'sources', { fr: Doc; en: Doc }> = {
  disclaimer: {
    fr: { title: 'Avertissement', sections: [
      { h: 'Outil d’information', p: 'Nyota est un outil d’information et d’analyse des marchés financiers. Il ne fournit aucun conseil en investissement personnalisé, ne transmet aucun ordre de bourse et n’est pas un prestataire de services d’investissement agréé.' },
      { h: 'Estimations', p: 'Les scénarios, probabilités, fourchettes et classements sont des estimations statistiques issues de modèles. Ils ne constituent ni une garantie, ni une recommandation d’achat ou de vente. Les performances passées ne préjugent pas des performances futures.' },
      { h: 'Risques', p: 'Investir en bourse comporte un risque de perte en capital. Sur les marchés africains, de nombreux titres sont peu liquides : les cours peuvent être peu représentatifs et les ordres difficiles à exécuter.' },
      { h: 'Données', p: 'Les cours sont des cours de clôture ou différés, avec leur source et leur date. Une donnée absente est signalée « donnée indisponible » : Nyota n’invente jamais de valeur.' },
    ] },
    en: { title: 'Disclaimer', sections: [
      { h: 'Information tool', p: 'Nyota is a financial-market information and analysis tool. It provides no personalised investment advice, transmits no orders and is not a licensed investment firm.' },
      { h: 'Estimates', p: 'Scenarios, probabilities, ranges and rankings are model-based statistical estimates, neither a guarantee nor a buy/sell recommendation. Past performance is not indicative of future results.' },
      { h: 'Risks', p: 'Investing involves a risk of capital loss. On African markets many stocks are illiquid: prices may be unrepresentative and orders hard to execute.' },
      { h: 'Data', p: 'Prices are end-of-day or delayed, shown with their source and date. Missing data is labelled “data unavailable”: Nyota never invents values.' },
    ] },
  },
  privacy: {
    fr: { title: 'Confidentialité', sections: [
      { h: 'Données collectées', p: 'Adresse e-mail (compte), préférences (langue, devise, thème), listes de suivi, portefeuille virtuel, alertes, jeton de notification, historique d’abonnement. Les captures de graphique envoyées pour analyse ne sont pas conservées après traitement.' },
      { h: 'Finalités', p: 'Fournir le service, gérer l’abonnement, envoyer les alertes demandées, améliorer la fiabilité. Aucune revente de données personnelles. Aucun suivi publicitaire inter-applications sans consentement.' },
      { h: 'Sous-traitants', p: 'Supabase (hébergement base de données), Anthropic (traitement IA des questions et images, sans entraînement sur vos données selon ses conditions API), RevenueCat / Apple / Google (abonnements), CinetPay (paiements web), Expo (notifications).' },
      { h: 'Vos droits', p: 'Accès, rectification, suppression (suppression du compte depuis l’application), portabilité, opposition. Contact : privacy@[domaine]. Conformité RGPD et lois locales (ex. loi ivoirienne n° 2013-450, loi sénégalaise n° 2008-12, NDPA Nigeria 2023).' },
    ] },
    en: { title: 'Privacy', sections: [
      { h: 'Data collected', p: 'Email (account), preferences (language, currency, theme), watchlists, virtual portfolio, alerts, push token, subscription history. Chart screenshots sent for analysis are not stored after processing.' },
      { h: 'Purposes', p: 'Provide the service, manage subscriptions, send requested alerts, improve reliability. No sale of personal data. No cross-app ad tracking without consent.' },
      { h: 'Processors', p: 'Supabase (database hosting), Anthropic (AI processing of questions and images, no training on your data under its API terms), RevenueCat / Apple / Google (subscriptions), CinetPay (web payments), Expo (notifications).' },
      { h: 'Your rights', p: 'Access, rectification, deletion (in-app account deletion), portability, objection. Contact: privacy@[domain]. GDPR and local laws (e.g. Côte d’Ivoire law 2013-450, Senegal law 2008-12, Nigeria NDPA 2023).' },
    ] },
  },
  terms: {
    fr: { title: 'Conditions d’utilisation', sections: [
      { h: 'Service', p: 'Accès gratuit limité et abonnement Premium mensuel ou annuel avec essai gratuit de 7 jours. Renouvellement automatique sauf résiliation au moins 24 h avant l’échéance, depuis le compte Apple/Google ou l’espace web.' },
      { h: 'Usage des données', p: 'Les données de marché sont fournies pour un usage personnel dans l’application. Toute extraction, revente ou redistribution des données brutes est interdite.' },
      { h: 'Responsabilité', p: 'Nyota ne saurait être tenu responsable des décisions d’investissement prises sur la base des informations affichées.' },
    ] },
    en: { title: 'Terms of use', sections: [
      { h: 'Service', p: 'Limited free access and a monthly or yearly Premium subscription with a 7-day free trial. Auto-renews unless cancelled at least 24h before renewal, from the Apple/Google account or web account.' },
      { h: 'Data use', p: 'Market data is provided for personal use within the app. Extraction, resale or redistribution of raw data is prohibited.' },
      { h: 'Liability', p: 'Nyota is not liable for investment decisions made based on the information displayed.' },
    ] },
  },
  sources: {
    fr: { title: 'Sources des données', sections: [
      { h: 'Cours', p: 'Mansa Markets (API sous licence, attribution obligatoire) ; bulletins officiels de la BRVM, de la BVMAC et de NGX pour le contrôle et l’historique.' },
      { h: 'Fondamentaux', p: 'Rapports annuels, semestriels et communiqués publiés par les émetteurs sur les sites des bourses ; extraction assistée par IA puis contrôles de cohérence.' },
      { h: 'Macroéconomie', p: 'Banque mondiale (API Indicators), FMI (DataMapper), BCEAO, BEAC, CBN.' },
      { h: 'Actualités', p: 'Flux RSS officiels (bourses, régulateurs AMF-UMOA, COSUMAF, SEC Nigeria, émetteurs) et GDELT. Seuls titres, extraits et liens sont affichés.' },
      { h: 'Graphiques', p: 'Version web : TradingView Lightweight Charts™ (licence Apache 2.0).' },
    ] },
    en: { title: 'Data sources', sections: [
      { h: 'Prices', p: 'Mansa Markets (licensed API, attribution required); official BRVM, BVMAC and NGX bulletins for verification and history.' },
      { h: 'Fundamentals', p: 'Annual, half-year reports and releases published by issuers on exchange websites; AI-assisted extraction followed by consistency checks.' },
      { h: 'Macro', p: 'World Bank (Indicators API), IMF (DataMapper), BCEAO, BEAC, CBN.' },
      { h: 'News', p: 'Official RSS feeds (exchanges, regulators AMF-UMOA, COSUMAF, SEC Nigeria, issuers) and GDELT. Only titles, excerpts and links are shown.' },
      { h: 'Charts', p: 'Web version: TradingView Lightweight Charts™ (Apache 2.0 licence).' },
    ] },
  },
};

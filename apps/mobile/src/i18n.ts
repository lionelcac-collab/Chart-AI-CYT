import { useSettings, type Lang } from './settings';

const fr = {
  tabs: { dashboard: 'Marchés', screener: 'Screener', watchlist: 'Suivi', assistant: 'Assistant IA', more: 'Plus' },
  common: {
    unavailable: 'Donnée indisponible', closeOf: 'Clôture du', delayed: 'Différé ~{n} min', source: 'Source',
    demoBanner: 'MODE DÉMO — données fictives à des fins de présentation, aucun cours réel.',
    loading: 'Chargement…', retry: 'Réessayer', error: 'Une erreur est survenue', premium: 'Premium', free: 'Gratuit',
    seeAll: 'Tout voir', search: 'Rechercher un titre, un ticker, un ISIN…', cancel: 'Annuler', save: 'Enregistrer',
  },
  dashboard: { title: 'Marchés africains', indices: 'Indices', top: 'Plus fortes hausses', flop: 'Plus fortes baisses', volume: 'Plus échangés', heatmap: 'Carte sectorielle', opportunities: 'Meilleures opportunités (modèle)', report: 'Synthèse de clôture' },
  asset: {
    overview: 'Aperçu', ranges: 'Plus bas / plus hauts', performance: 'Performance', liquidity: 'Liquidité', fundamentals: 'Fondamentaux',
    technical: 'Technique', consensus: 'Consensus Nyota', identity: 'Identité', news: 'Actualités', dividends: 'Dividendes', peers: 'Pairs',
    period: 'Période', low: 'Plus bas', high: 'Plus haut', position: 'Position', fromHigh: 'Écart au + haut', fromLow: 'Écart au + bas',
    partial: 'historique partiel', volatility: 'Volatilité ann.', ytd: 'Depuis le 1er janv.',
    avgVolume: 'Volume moyen (3 mois)', zeroDays: 'Séances sans échange', score: 'Score de liquidité',
    illiquid: 'Titre peu échangé : les cours peuvent être peu représentatifs et difficiles à exécuter.',
    analyze: 'Analyse IA complète', analysesLeft: '{n} analyse(s) IA restante(s) aujourd’hui',
    trend: { up: 'Haussière', down: 'Baissière', sideways: 'Sans tendance' },
    lastPrice: 'Dernier cours', change: 'Variation', volumeDay: 'Volume', valueDay: 'Valeur échangée', marketCap: 'Capitalisation',
    supports: 'Supports', resistances: 'Résistances', patterns: 'Figures détectées',
  },
  consensus: {
    analysts: 'Consensus des analystes', noAnalysts: 'Aucun analyste ne publie de recommandation suivie sur ce titre.',
    model: 'Modèle quantitatif', orientation: { positive: 'Orientation positive', neutral: 'Orientation neutre', negative: 'Orientation négative' },
    confidence: { low: 'Confiance faible', medium: 'Confiance moyenne', high: 'Confiance élevée' },
    bear: 'Baissier', central: 'Central', bull: 'Haussier', probability: 'Probabilité', range: 'Fourchette 80 %',
    invalidation: 'Niveau d’invalidation', factors: 'Facteurs principaux', horizon: 'Horizon', locked: 'Scénarios, probabilités et fourchettes réservés au Premium.',
    trackRecord: 'Taux de réussite passé du modèle', target: 'Objectif moyen', buy: 'Achat', hold: 'Conserver', sell: 'Vente',
  },
  disclaimer: 'Estimations statistiques, pas une garantie ni un conseil en investissement.',
  assistant: { title: 'Assistant IA', placeholder: 'Posez une question sur un titre, un secteur, un marché…', send: 'Envoyer', chart: 'Analyser une capture de graphique', chartPremium: 'L’analyse de graphique par image est réservée au Premium.', intro: 'Je réponds à partir des données de Nyota, en citant la date et la source de chaque chiffre. Je ne donne pas de conseil personnalisé.' },
  premium: {
    title: 'Nyota Premium', subtitle: 'L’analyse complète des marchés africains', trial: 'Essai gratuit de 7 jours', monthly: 'Mensuel', yearly: 'Annuel', save: '2 mois offerts',
    features: ['Cours différés en séance', 'Consensus complet : scénarios, probabilités, invalidation', 'Analyses IA illimitées', 'Analyse de graphiques par image', 'Screener avancé', 'Alertes illimitées', 'Rapports PDF', 'Accès anticipé aux analyses d’IPO', 'Sans publicité'],
    cta: 'Commencer l’essai gratuit', restore: 'Restaurer mes achats', web: 'Paiement par Mobile Money ou carte',
    legal: 'Abonnement renouvelé automatiquement sauf résiliation au moins 24 h avant la fin de la période. Gérez-le dans les réglages de votre compte Apple / Google.',
  },
  more: { settings: 'Réglages', language: 'Langue', theme: 'Thème', themes: { system: 'Système', dark: 'Sombre', light: 'Clair' }, currency: 'Devise d’affichage', local: 'Devise locale', portfolio: 'Portefeuille virtuel', calendar: 'Calendrier', ipo: 'IPO & emprunts à venir', reports: 'Rapports', trackRecord: 'Transparence du modèle', legal: 'Mentions légales', privacy: 'Confidentialité', terms: 'Conditions d’utilisation', sources: 'Sources des données', account: 'Compte', signIn: 'Se connecter', signOut: 'Se déconnecter' },
  screener: { title: 'Screener', market: 'Marché', sector: 'Secteur', all: 'Tous', sort: 'Trier par', advanced: 'Filtres avancés (Premium)', results: '{n} résultat(s)' },
  watchlist: { title: 'Ma liste', empty: 'Ajoutez des titres depuis leur fiche (☆).', add: 'Suivre', remove: 'Ne plus suivre', limit: 'Version gratuite : 1 liste.' },
};

const en: typeof fr = {
  tabs: { dashboard: 'Markets', screener: 'Screener', watchlist: 'Watchlist', assistant: 'AI Assistant', more: 'More' },
  common: {
    unavailable: 'Data unavailable', closeOf: 'Close of', delayed: 'Delayed ~{n} min', source: 'Source',
    demoBanner: 'DEMO MODE — fictional data for presentation only, no real prices.',
    loading: 'Loading…', retry: 'Retry', error: 'Something went wrong', premium: 'Premium', free: 'Free',
    seeAll: 'See all', search: 'Search a stock, ticker, ISIN…', cancel: 'Cancel', save: 'Save',
  },
  dashboard: { title: 'African markets', indices: 'Indices', top: 'Top gainers', flop: 'Top losers', volume: 'Most traded', heatmap: 'Sector heatmap', opportunities: 'Top opportunities (model)', report: 'Closing summary' },
  asset: {
    overview: 'Overview', ranges: 'Lows / highs', performance: 'Performance', liquidity: 'Liquidity', fundamentals: 'Fundamentals',
    technical: 'Technicals', consensus: 'Nyota Consensus', identity: 'Profile', news: 'News', dividends: 'Dividends', peers: 'Peers',
    period: 'Period', low: 'Low', high: 'High', position: 'Position', fromHigh: 'From high', fromLow: 'From low',
    partial: 'partial history', volatility: 'Ann. volatility', ytd: 'Year to date',
    avgVolume: 'Avg volume (3 months)', zeroDays: 'Sessions without trades', score: 'Liquidity score',
    illiquid: 'Thinly traded stock: prices may be unrepresentative and hard to execute.',
    analyze: 'Full AI analysis', analysesLeft: '{n} AI analysis(es) left today',
    trend: { up: 'Uptrend', down: 'Downtrend', sideways: 'No trend' },
    lastPrice: 'Last price', change: 'Change', volumeDay: 'Volume', valueDay: 'Traded value', marketCap: 'Market cap',
    supports: 'Supports', resistances: 'Resistances', patterns: 'Detected patterns',
  },
  consensus: {
    analysts: 'Analyst consensus', noAnalysts: 'No analyst publishes a tracked recommendation on this stock.',
    model: 'Quantitative model', orientation: { positive: 'Positive orientation', neutral: 'Neutral orientation', negative: 'Negative orientation' },
    confidence: { low: 'Low confidence', medium: 'Medium confidence', high: 'High confidence' },
    bear: 'Bearish', central: 'Central', bull: 'Bullish', probability: 'Probability', range: '80% range',
    invalidation: 'Invalidation level', factors: 'Main drivers', horizon: 'Horizon', locked: 'Scenarios, probabilities and ranges are Premium features.',
    trackRecord: 'Model past hit rate', target: 'Mean target', buy: 'Buy', hold: 'Hold', sell: 'Sell',
  },
  disclaimer: 'Statistical estimates, not a guarantee nor investment advice.',
  assistant: { title: 'AI Assistant', placeholder: 'Ask about a stock, a sector, a market…', send: 'Send', chart: 'Analyse a chart screenshot', chartPremium: 'Chart image analysis is a Premium feature.', intro: 'I answer from Nyota’s data, citing the date and source of every figure. I do not give personalised advice.' },
  premium: {
    title: 'Nyota Premium', subtitle: 'Complete analysis of African markets', trial: '7-day free trial', monthly: 'Monthly', yearly: 'Yearly', save: '2 months free',
    features: ['Delayed intraday prices', 'Full consensus: scenarios, probabilities, invalidation', 'Unlimited AI analyses', 'Chart image analysis', 'Advanced screener', 'Unlimited alerts', 'PDF reports', 'Early access to IPO analyses', 'No ads'],
    cta: 'Start free trial', restore: 'Restore purchases', web: 'Pay with Mobile Money or card',
    legal: 'Auto-renews unless cancelled at least 24h before the end of the period. Manage it in your Apple / Google account settings.',
  },
  more: { settings: 'Settings', language: 'Language', theme: 'Theme', themes: { system: 'System', dark: 'Dark', light: 'Light' }, currency: 'Display currency', local: 'Local currency', portfolio: 'Virtual portfolio', calendar: 'Calendar', ipo: 'Upcoming IPOs & bonds', reports: 'Reports', trackRecord: 'Model transparency', legal: 'Legal notice', privacy: 'Privacy', terms: 'Terms of use', sources: 'Data sources', account: 'Account', signIn: 'Sign in', signOut: 'Sign out' },
  screener: { title: 'Screener', market: 'Market', sector: 'Sector', all: 'All', sort: 'Sort by', advanced: 'Advanced filters (Premium)', results: '{n} result(s)' },
  watchlist: { title: 'My list', empty: 'Add stocks from their page (☆).', add: 'Follow', remove: 'Unfollow', limit: 'Free plan: 1 list.' },
};

export const dictionaries: Record<Lang, typeof fr> = { fr, en };

export function useT() {
  const { lang } = useSettings();
  return { t: dictionaries[lang], lang, fmt: (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) };
}

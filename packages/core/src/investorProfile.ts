// Investor profile questionnaire (suitability): risk profile + financial knowledge.
// Used at sign-up so the AI adapts its vocabulary and flags signals that don't fit the profile.
// It never turns the AI into a personalised adviser: answers stay informative.

export type RiskProfile = 'prudent' | 'balanced' | 'dynamic' | 'aggressive';
export type KnowledgeLevel = 'beginner' | 'intermediate' | 'advanced';
type L = { fr: string; en: string };
export type ProfileQuestion = {
  id: string; kind: 'risk' | 'knowledge'; multi?: boolean; title: L; help?: L;
  options: { value: string; label: L; score: number }[];
};

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  // --- Knowledge
  { id: 'experience', kind: 'knowledge', title: { fr: 'Depuis combien de temps investissez-vous en bourse ?', en: 'How long have you been investing in shares?' }, options: [
    { value: 'none', label: { fr: 'Jamais', en: 'Never' }, score: 0 },
    { value: 'lt2', label: { fr: 'Moins de 2 ans', en: 'Less than 2 years' }, score: 1 },
    { value: '2to5', label: { fr: '2 à 5 ans', en: '2 to 5 years' }, score: 2 },
    { value: 'gt5', label: { fr: 'Plus de 5 ans', en: 'More than 5 years' }, score: 3 },
  ] },
  { id: 'instruments', kind: 'knowledge', multi: true, title: { fr: 'Quels produits avez-vous déjà détenus ?', en: 'Which products have you already held?' }, help: { fr: 'Plusieurs choix possibles.', en: 'Several choices allowed.' }, options: [
    { value: 'shares', label: { fr: 'Actions', en: 'Shares' }, score: 1 },
    { value: 'bonds', label: { fr: 'Obligations', en: 'Bonds' }, score: 1 },
    { value: 'funds', label: { fr: 'FCP / OPCVM', en: 'Mutual funds' }, score: 1 },
    { value: 'derivatives', label: { fr: 'Produits dérivés', en: 'Derivatives' }, score: 1 },
    { value: 'crypto', label: { fr: 'Cryptomonnaies', en: 'Crypto' }, score: 0 },
    { value: 'none', label: { fr: 'Aucun', en: 'None' }, score: 0 },
  ] },
  { id: 'quiz_drawdown', kind: 'knowledge', title: { fr: 'Une action perd 50 %. Quelle hausse faut-il ensuite pour revenir au prix de départ ?', en: 'A share loses 50%. What rise is then needed to get back to the starting price?' }, options: [
    { value: '50', label: { fr: '+50 %', en: '+50%' }, score: 0 },
    { value: '100', label: { fr: '+100 %', en: '+100%' }, score: 2 },
    { value: '25', label: { fr: '+25 %', en: '+25%' }, score: 0 },
    { value: 'dk', label: { fr: 'Je ne sais pas', en: 'I don’t know' }, score: 0 },
  ] },
  { id: 'quiz_liquidity', kind: 'knowledge', title: { fr: 'Une action « peu liquide », cela signifie surtout :', en: 'An “illiquid” share mainly means:' }, options: [
    { value: 'cheap', label: { fr: 'Qu’elle coûte peu cher', en: 'It is cheap' }, score: 0 },
    { value: 'hard', label: { fr: 'Qu’il peut être difficile d’acheter ou de vendre sans faire bouger le prix', en: 'It may be hard to buy or sell without moving the price' }, score: 2 },
    { value: 'safe', label: { fr: 'Qu’elle est sans risque', en: 'It is risk-free' }, score: 0 },
    { value: 'dk', label: { fr: 'Je ne sais pas', en: 'I don’t know' }, score: 0 },
  ] },
  { id: 'quiz_diversification', kind: 'knowledge', title: { fr: 'Diversifier un portefeuille sert principalement à :', en: 'Diversifying a portfolio mainly serves to:' }, options: [
    { value: 'gain', label: { fr: 'Garantir un gain', en: 'Guarantee a gain' }, score: 0 },
    { value: 'risk', label: { fr: 'Réduire le risque lié à un seul titre ou secteur', en: 'Reduce the risk tied to a single stock or sector' }, score: 2 },
    { value: 'fees', label: { fr: 'Payer moins de frais', en: 'Pay lower fees' }, score: 0 },
    { value: 'dk', label: { fr: 'Je ne sais pas', en: 'I don’t know' }, score: 0 },
  ] },
  // --- Risk
  { id: 'horizon', kind: 'risk', title: { fr: 'Pendant combien de temps comptez-vous laisser cet argent investi ?', en: 'How long do you plan to keep this money invested?' }, options: [
    { value: 'lt1', label: { fr: 'Moins d’1 an', en: 'Less than 1 year' }, score: 0 },
    { value: '1to3', label: { fr: '1 à 3 ans', en: '1 to 3 years' }, score: 1 },
    { value: '3to5', label: { fr: '3 à 5 ans', en: '3 to 5 years' }, score: 2 },
    { value: 'gt5', label: { fr: 'Plus de 5 ans', en: 'More than 5 years' }, score: 3 },
  ] },
  { id: 'objective', kind: 'risk', title: { fr: 'Quel est votre objectif principal ?', en: 'What is your main objective?' }, options: [
    { value: 'preserve', label: { fr: 'Préserver mon capital', en: 'Preserve my capital' }, score: 0 },
    { value: 'income', label: { fr: 'Des revenus réguliers (dividendes)', en: 'Regular income (dividends)' }, score: 1 },
    { value: 'balanced', label: { fr: 'Une croissance équilibrée', en: 'Balanced growth' }, score: 2 },
    { value: 'growth', label: { fr: 'Une forte croissance, en acceptant de fortes variations', en: 'Strong growth, accepting large swings' }, score: 3 },
  ] },
  { id: 'reaction', kind: 'risk', title: { fr: 'Votre portefeuille perd 20 % en un mois. Que faites-vous ?', en: 'Your portfolio drops 20% in a month. What do you do?' }, options: [
    { value: 'sell_all', label: { fr: 'Je vends tout', en: 'I sell everything' }, score: 0 },
    { value: 'sell_part', label: { fr: 'J’en vends une partie', en: 'I sell part of it' }, score: 1 },
    { value: 'wait', label: { fr: 'J’attends sans rien faire', en: 'I wait and do nothing' }, score: 2 },
    { value: 'buy', label: { fr: 'J’en profite pour acheter davantage', en: 'I buy more' }, score: 3 },
  ] },
  { id: 'share', kind: 'risk', title: { fr: 'Quelle part de votre épargne totale est (ou sera) investie en actions ?', en: 'What share of your total savings is (or will be) in shares?' }, options: [
    { value: 'lt10', label: { fr: 'Moins de 10 %', en: 'Less than 10%' }, score: 3 },
    { value: '10to25', label: { fr: '10 à 25 %', en: '10 to 25%' }, score: 2 },
    { value: '25to50', label: { fr: '25 à 50 %', en: '25 to 50%' }, score: 1 },
    { value: 'gt50', label: { fr: 'Plus de 50 %', en: 'More than 50%' }, score: 0 },
  ] },
];

export type ProfileAnswers = Record<string, string | string[]>;

export function scoreProfile(answers: ProfileAnswers): { risk: RiskProfile; knowledge: KnowledgeLevel; riskScore: number; knowledgeScore: number; complete: boolean } {
  let r = 0, k = 0, complete = true;
  for (const q of PROFILE_QUESTIONS) {
    const a = answers[q.id];
    const vals = Array.isArray(a) ? a : a ? [a] : [];
    if (!vals.length) { complete = false; continue; }
    const pts = Math.min(q.multi ? 3 : 99, vals.reduce((s, v) => s + (q.options.find((o) => o.value === v)?.score ?? 0), 0));
    if (q.kind === 'risk') r += pts; else k += pts;
  }
  // Risk score 0..12 (4 questions × 3); a "sell everything" reaction caps the profile at prudent.
  let risk: RiskProfile = r <= 4 ? 'prudent' : r <= 7 ? 'balanced' : r <= 10 ? 'dynamic' : 'aggressive';
  if (answers.reaction === 'sell_all') risk = 'prudent';
  if (answers.horizon === 'lt1' && risk !== 'prudent') risk = 'balanced';
  // Knowledge score 0..12 (experience 3 + instruments 3 + quiz 6).
  const knowledge: KnowledgeLevel = k <= 4 ? 'beginner' : k <= 8 ? 'intermediate' : 'advanced';
  return { risk, knowledge, riskScore: r, knowledgeScore: k, complete };
}

export const RISK_LABEL: Record<RiskProfile, L & { desc: L }> = {
  prudent: { fr: 'Prudent', en: 'Cautious', desc: { fr: 'Priorité à la préservation du capital, faible tolérance aux pertes.', en: 'Capital preservation first, low tolerance for losses.' } },
  balanced: { fr: 'Équilibré', en: 'Balanced', desc: { fr: 'Recherche de croissance modérée, pertes temporaires acceptées dans une certaine limite.', en: 'Moderate growth, temporary losses accepted within limits.' } },
  dynamic: { fr: 'Dynamique', en: 'Dynamic', desc: { fr: 'Recherche de croissance, accepte des variations importantes sur un horizon long.', en: 'Seeks growth, accepts large swings over a long horizon.' } },
  aggressive: { fr: 'Offensif', en: 'Aggressive', desc: { fr: 'Recherche de forte performance, tolère des pertes marquées et des titres peu liquides.', en: 'Seeks strong returns, tolerates sharp losses and illiquid stocks.' } },
};
export const KNOWLEDGE_LABEL: Record<KnowledgeLevel, L> = {
  beginner: { fr: 'Débutant', en: 'Beginner' }, intermediate: { fr: 'Intermédiaire', en: 'Intermediate' }, advanced: { fr: 'Avancé', en: 'Advanced' },
};

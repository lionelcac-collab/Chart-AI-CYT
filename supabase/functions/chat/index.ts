// POST /chat {messages:[{role,content}], lang} — expert assistant (Claude Sonnet 5.5) with tools over our DB.
// The model only answers from tool results; every figure carries its date and source.
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import { ANALYST_SYSTEM, MODELS, claude } from '../_shared/ai.ts';
import { admin, asUser, audit, currentUser, handler, isPremium, json } from '../_shared/runtime.ts';
import { buildSheet, sheetForPrompt } from '../_shared/sheet.ts';
import { loadPortfolio, type Period } from '../_shared/portfolio.ts';
import { ENTITLEMENTS } from '../_shared/core/index.ts';

const tools: Anthropic.Tool[] = [
  { name: 'search_assets', description: 'Recherche des actifs (actions, obligations, indices) par nom, ticker ou ISIN. Renvoie id, ticker, nom, marché.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, market: { type: 'string', enum: ['BRVM', 'BVMAC', 'NGX', 'JSE', 'EGX', 'CSE_MA', 'NSE_KE', 'GSE', 'DSE', 'USE', 'RSE'] } }, required: ['query'], additionalProperties: false }, strict: true },
  { name: 'get_asset_sheet', description: 'Fiche complète d’un actif : dernier cours daté, plus bas/plus hauts, performances, liquidité, ratios, technique, consensus, actualités.',
    input_schema: { type: 'object', properties: { asset_id: { type: 'string', description: 'ex. BRVM:SNTS' } }, required: ['asset_id'], additionalProperties: false }, strict: true },
  { name: 'get_rankings', description: 'Classement des meilleures opportunités (score du modèle) par style et périmètre, après la dernière séance.',
    input_schema: { type: 'object', properties: { scope: { type: 'string', description: 'AFRICA, un code de bourse (BRVM, BVMAC, NGX, JSE, EGX, CSE_MA, NSE_KE, GSE, DSE, USE, RSE) ou MARCHÉ:sector:CODE' }, style: { type: 'string', enum: ['momentum', 'value', 'dividend', 'quality', 'overall'] } }, required: ['scope', 'style'], additionalProperties: false }, strict: true },
  { name: 'get_market_overview', description: 'Indices, plus fortes hausses/baisses et volumes de la dernière séance pour un marché.',
    input_schema: { type: 'object', properties: { market: { type: 'string', enum: ['BRVM', 'BVMAC', 'NGX', 'JSE', 'EGX', 'CSE_MA', 'NSE_KE', 'GSE', 'DSE', 'USE', 'RSE'] } }, required: ['market'], additionalProperties: false }, strict: true },
  { name: 'get_market_scan', description: 'Balayage de TOUTE la cote d’un marché sur une période (identique à la page Marchés) : titres proches d’un support ou d’une résistance (écart en %), plus fortes hausses et baisses de la période. À utiliser pour toute question « quels titres… » sur supports, résistances, hausses ou baisses.',
    input_schema: { type: 'object', properties: { market: { type: 'string', enum: ['BRVM', 'BVMAC', 'NGX', 'JSE', 'EGX', 'CSE_MA', 'NSE_KE', 'GSE', 'DSE', 'USE', 'RSE'] }, period: { type: 'string', enum: ['1D', '1W', '1M', '3M', '6M', '1Y'], description: 'défaut 3M pour supports/résistances, 1D pour hausses/baisses' }, max_distance_pct: { type: 'number', description: 'écart maximal au niveau, défaut 3' } }, required: ['market'], additionalProperties: false } },
  { name: 'get_my_portfolio', description: 'Portefeuille RÉEL de l’utilisateur connecté (sa liste de suivi) : titres, nombre d’actions et montant investi s’ils sont renseignés, valeur, poids, variation et contribution de chaque titre sur la période, plus/moins-values, répartition par marché, secteur et devise. À appeler pour toute question sur « mon portefeuille », « mes titres », « ma liste ».',
    input_schema: { type: 'object', properties: { period: { type: 'string', enum: ['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y'], description: 'défaut 1Y' } }, additionalProperties: false } },
  { name: 'search_documents', description: 'Recherche plein texte dans les rapports annuels, communiqués et bulletins officiels indexés.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, asset_id: { type: 'string' } }, required: ['query'], additionalProperties: false } },
];

async function runTool(name: string, input: Record<string, string>, lang: 'fr' | 'en', userId: string) {
  const db = admin();
  switch (name) {
    case 'search_assets': {
      let q = db.from('assets').select('id, ticker, name, market, asset_class').or(`name.ilike.%${input.query}%,ticker.ilike.%${input.query}%,isin.eq.${input.query}`).limit(10);
      if (input.market) q = q.eq('market', input.market);
      return (await q).data ?? [];
    }
    case 'get_asset_sheet': {
      const s = await buildSheet(db, input.asset_id);
      return s ? sheetForPrompt(s, lang) : { error: 'actif introuvable' };
    }
    case 'get_rankings': {
      const { data } = await db.from('rankings').select('session_date, items').eq('scope', input.scope).eq('style', input.style).order('session_date', { ascending: false }).limit(1).maybeSingle();
      return data ?? { error: 'donnée indisponible' };
    }
    case 'get_market_overview': {
      const [idx, movers] = await Promise.all([
        db.from('index_values').select('index_code, name, session_date, value, change_pct, source').eq('market', input.market).order('session_date', { ascending: false }).limit(6),
        db.from('market_latest').select('asset_id, ticker, name, session_date, close, change_pct, volume, value, source').eq('market', input.market),
      ]);
      const all = movers.data ?? [];
      const date = all.map((r) => r.session_date as string).sort().pop();
      const m = all.filter((r) => r.session_date === date && r.change_pct != null).sort((a, b) => Number(b.change_pct) - Number(a.change_pct));
      return { session: date, source: 'clôtures vérifiées (bulletin officiel ou fournisseur licencié)', indices: idx.data?.length ? idx.data : 'donnée indisponible',
        listed: m.length, up: m.filter((r) => Number(r.change_pct) > 0).length, down: m.filter((r) => Number(r.change_pct) < 0).length,
        top: m.slice(0, 5), flop: m.slice(-5).reverse(), mostTraded: [...m].sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0)).slice(0, 5) };
    }
    case 'get_market_scan': {
      const period = (input.period as string) || '3M';
      const maxD = Number((input as Record<string, unknown>).max_distance_pct ?? 3);
      const { data } = await db.from('market_scans').select('session_date, rows').eq('market', input.market).eq('period', period).order('session_date', { ascending: false }).limit(1).maybeSingle();
      if (!data) return { error: 'donnée indisponible' };
      type R = { ticker: string; name: string; last: number; support: number | null; resistance: number | null; supportDistPct: number | null; resistanceDistPct: number | null; returnPct: number | null; illiquid: boolean };
      const rows = data.rows as R[];
      const r2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
      const pick = (r: R) => ({ titre: `${r.name} (${r.ticker})`, cours: r.last, support: r.support, resistance: r.resistance, ecart_support_pct: r2(r.supportDistPct), ecart_resistance_pct: r2(r.resistanceDistPct), variation_periode_pct: r2(r.returnPct), peu_liquide: r.illiquid });
      const near = (k: 'supportDistPct' | 'resistanceDistPct') => rows.filter((r) => r[k] != null && r[k]! >= 0 && r[k]! <= maxD).sort((a, b) => a[k]! - b[k]!).map(pick);
      const byRet = rows.filter((r) => r.returnPct != null).sort((a, b) => b.returnPct! - a.returnPct!);
      return { market: input.market, period, closeDate: data.session_date, source: 'calcul Chart-BoursafrikIA sur les clôtures vérifiées', titres_analyses: rows.length, max_distance_pct: maxD,
        proches_support: near('supportDistPct'), proches_resistance: near('resistanceDistPct'),
        plus_fortes_hausses: byRet.filter((r) => r.returnPct! > 0).slice(0, 8).map(pick), plus_fortes_baisses: byRet.filter((r) => r.returnPct! < 0).slice(-8).reverse().map(pick) };
    }
    case 'get_my_portfolio': {
      const pf = await loadPortfolio(db, userId, ((input.period as Period) || '1Y'), 'XOF');
      if ('empty' in pf && pf.empty) return { empty: true, message: 'La liste de suivi de l’utilisateur est vide.' };
      const p = pf as Exclude<typeof pf, { empty: true }>;
      const ids = p.lines.map((l) => l.assetId);
      const { data: secs } = await db.from('assets').select('id, sectors(name_fr)').in('id', ids);
      const sectorOf = new Map((secs ?? []).map((a) => [a.id, (a.sectors as unknown as { name_fr: string } | null)?.name_fr ?? 'Secteur non renseigné']));
      const r2 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 100) / 100);
      const group = (key: (l: (typeof p.lines)[number]) => string) => {
        const m = new Map<string, number>();
        for (const l of p.lines) { const w = (l as { weightPct?: number | null }).weightPct; if (w != null) m.set(key(l), (m.get(key(l)) ?? 0) + w); }
        return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r2(v)]));
      };
      return {
        devise_affichage: 'FCFA (XOF)', mode: p.mode === 'value' ? 'valeur réelle (quantités renseignées)' : 'pondération égale (aucune quantité renseignée : poids identiques, pas de valeur en FCFA)',
        periode: p.period, debut: p.start, fin: p.end, resume: p.summary,
        titres: p.lines.map((l) => {
          const x = l as typeof l & { weightPct?: number | null; contributionPts?: number | null; pnl?: number | null; pnlPct?: number | null };
          return { id: x.assetId, titre: `${x.name} (${x.ticker})`, marche: x.market, secteur: sectorOf.get(x.assetId), devise: x.currency, nombre_actions: x.quantity, montant_investi_devise_titre: x.cost,
            cours_debut: r2(x.priceStart), cours_fin: r2(x.priceEnd), derniere_cotation: x.lastDate, variation_pct: r2(x.returnPct), valeur_fcfa: r2(x.valueEnd), poids_pct: r2(x.weightPct),
            contribution_pts: r2(x.contributionPts), plus_value_fcfa: r2(x.pnl), plus_value_pct: r2(x.pnlPct) };
        }),
        repartition_par_marche_pct: group((l) => l.market), repartition_par_secteur_pct: group((l) => sectorOf.get(l.assetId) ?? '—'), repartition_par_devise_pct: group((l) => l.currency),
        change: p.fx, source: 'clôtures vérifiées ajustées (bulletins officiels / fournisseur licencié), calcul Chart-BoursafrikIA',
      };
    }
    case 'search_documents': {
      let q = db.from('rag_chunks').select('content, metadata, document_id').textSearch('content', input.query, { type: 'websearch', config: 'french' }).limit(6);
      if (input.asset_id) q = q.eq('asset_id', input.asset_id);
      return (await q).data ?? [];
    }
  }
  return { error: 'outil inconnu' };
}

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  const premium = await isPremium(user.id);
  const limit = premium ? ENTITLEMENTS.premium.chatMessagesPerDay : ENTITLEMENTS.free.chatMessagesPerDay;
  // Premium also has a fair-use cap: count manually (consume_ai_quota bypasses premium).
  const { data: allowed } = premium ? { data: true } : await asUser(req).rpc('consume_ai_quota', { p_kind: 'chat', p_limit: limit });
  if (!allowed) return json({ error: 'QUOTA_EXCEEDED', limit }, 402);

  const { messages, lang = 'fr', context } = (await req.json()) as { messages: { role: 'user' | 'assistant'; content: string }[]; lang: 'fr' | 'en'; context?: 'portfolio' };
  const history: Anthropic.Beta.BetaMessageParam[] = messages.slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  const system = [{ type: 'text' as const, text: ANALYST_SYSTEM + `\nUtilise les outils pour toute donnée chiffrée. Pour les questions sur plusieurs titres (supports, résistances, hausses, baisses), utilise get_market_scan qui couvre toute la cote. Cite date et source de chaque chiffre.
Mise en forme (affichage mobile) : titres courts avec ##, listes à puces avec -, gras avec **. JAMAIS de tableau. Dates au format JJ/MM/AAAA. Pourcentages à 2 décimales. N'écris pas de nom de champ technique ni de mot anglais (« sideways » = latérale, « breakdown » = cassure). Vouvoie toujours l'utilisateur. Ne cite jamais de nom d'outil, de table ou de champ technique. Arrondis les prix à 2 décimales maximum. Réponse concise et concrète : évite les généralités, chaque affirmation s'appuie sur un chiffre daté.
CONCLUSION OBLIGATOIRE : termine TOUJOURS par une section « ## Conclusion » de 3 à 5 puces, précise et tranchée sur la lecture des données (sans recommandation personnelle ni impératif) : 1) la lecture d'ensemble des signaux les plus pertinents (« majoritairement positifs », « majoritairement négatifs » ou « mitigés ») avec les 2 ou 3 éléments qui pèsent le plus (consensus du modèle et sa confiance, tendance, RSI/MACD, supports/résistances, liquidité, consensus d'analystes s'il existe) ; 2) le scénario le plus probable selon le modèle avec sa probabilité et son horizon ; 3) les niveaux de prix qui confirmeraient ou invalideraient cette lecture ; 4) ce qu'il faut surveiller (prochaine publication, dividende, volume). Si plusieurs titres sont concernés, une puce par titre principal, en commençant par le consensus le plus net. Puis termine exactement par cette phrase : « Ceci n'est pas un conseil en investissement ; pour une analyse approfondie adaptée à votre situation, consultez un professionnel agréé (SGI, conseiller en investissement financier). »`, cache_control: { type: 'ephemeral' as const } }];
  // Investor profile (suitability questionnaire): adapt vocabulary and flag mismatches; never personal advice.
  const { data: ip } = await admin().from('investor_profiles').select('risk_profile, knowledge_level, answers').eq('user_id', user.id).maybeSingle();
  if (ip) {
    const RISK: Record<string, string> = { prudent: 'Prudent (préservation du capital, faible tolérance aux pertes)', balanced: 'Équilibré (croissance modérée, pertes temporaires limitées acceptées)', dynamic: 'Dynamique (croissance, accepte de fortes variations sur un horizon long)', aggressive: 'Offensif (forte performance recherchée, tolère des pertes marquées et des titres peu liquides)' };
    const KNOW: Record<string, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé' };
    const a = ip.answers as Record<string, string>;
    system.push({ type: 'text' as const, text:
      `PROFIL INVESTISSEUR de l'utilisateur (questionnaire) : risque ${RISK[ip.risk_profile] ?? ip.risk_profile} ; connaissances ${KNOW[ip.knowledge_level] ?? ip.knowledge_level} ; horizon ${a.horizon ?? '?'} ; objectif ${a.objective ?? '?'} ; réaction à une baisse de 20 % : ${a.reaction ?? '?'}.
Adapte ta réponse : niveau Débutant → phrases simples, définis chaque terme technique (RSI, support, liquidité, PER…) en une courte parenthèse, moins de chiffres, l'essentiel d'abord ; Intermédiaire → vocabulaire courant expliqué brièvement ; Avancé → vocabulaire technique sans explications, plus de détails chiffrés.
Compatibilité avec le profil de risque : signale explicitement (« ⚠ Peu compatible avec votre profil … ») les titres, scénarios ou situations qui ne correspondent pas au profil (ex. pour un profil Prudent : titre très volatil, peu liquide, forte concentration, scénario baissier probable ; pour un horizon court : volatilité élevée). Pour les questions renforcer/vendre/maintenir, indique pour chaque signal s'il est compatible avec le profil. Cela reste une information : jamais de recommandation personnalisée ni de formulation impérative.` } as never);
  } else {
    system.push({ type: 'text' as const, text: `Profil investisseur non renseigné : adopte un niveau Intermédiaire et ajoute en une phrase, juste AVANT la section Conclusion, la proposition de remplir le profil investisseur (menu Plus → Mon profil investisseur) pour des réponses adaptées. La dernière ligne de la réponse reste toujours la phrase sur le conseil en investissement.` } as never);
  }

  // Portfolio mode (Suivi screen): the question is about the user's own holdings.
  if (context === 'portfolio') system.push({ type: 'text' as const, text:
    `CONTEXTE : l'utilisateur t'interroge depuis l'écran « Suivi », à propos de SON portefeuille réel. Appelle d'abord get_my_portfolio (période 1Y sauf si la question en précise une autre ; « ce mois-ci » = 1M), puis, AVANT de conclure, appelle get_asset_sheet EN PARALLÈLE (plusieurs appels dans le même tour) sur les 3 à 5 lignes les plus importantes pour la question (plus gros poids ou plus fortes contributions) : la conclusion doit citer leur consensus, leur scénario le plus probable et leurs niveaux clés. Ne dis jamais que tu n'as pas consulté ces données : consulte-les.
Analyse sa situation concrète : performance et ce qui l'explique (contributions), concentration (poids du 1er titre et des 3 premiers, marché, secteur, devise), plus/moins-values, titres peu liquides ou qui ne cotent plus, exposition au naira, niveaux techniques et consensus du modèle sur ses lignes principales.
Tu peux décrire des points d'attention et des leviers généraux (diversification, horizon, liquidité) mais JAMAIS de recommandation personnalisée d'achat, de vente ou d'arbitrage, ni de formulation impérative. Si aucune quantité n'est renseignée, précise que l'analyse suppose des poids égaux et invite à renseigner le nombre d'actions (bouton ✎) pour une analyse en valeur réelle. Ne révèle aucune donnée d'un autre utilisateur.
QUESTIONS « renforcer / vendre / maintenir » : tu ne donnes pas d'ordre personnalisé. Classe chaque ligne (appelle get_asset_sheet sur chacune, au moins les plus gros poids) en trois blocs : « Signaux plutôt favorables à un renforcement », « Signaux plutôt favorables à un allègement », « Signaux neutres (statu quo) ». Pour chaque titre : orientation et confiance du modèle de consensus, scénarios et probabilités, tendance, support/résistance les plus proches, niveau d'invalidation, poids dans le portefeuille (concentration) et plus/moins-value. Avant la conclusion, rappelle : « Ces signaux sont statistiques ; la décision d'acheter, vendre ou conserver vous appartient. »
QUESTIONS « que feriez-vous à ma place » : tu ne décides pas à la place de l'utilisateur. Structure : 1) ce que montrent les données (performance, contributeurs, concentration, risques) ; 2) deux ou trois options possibles décrites objectivement (par ex. conserver tel quel, rééquilibrer pour réduire la concentration, diversifier par marché/secteur) avec leurs avantages, inconvénients et risques ; 3) les questions à se poser (horizon, tolérance au risque, besoins de liquidité, fiscalité) ; 4) suggestion de consulter un conseiller agréé pour une décision personnalisée.` } as never);

  let usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  for (let turn = 0; turn < 8; turn++) {
    const res = await claude().beta.messages.create({
      model: MODELS.deep, max_tokens: 4000, system, tools: tools as never, messages: history,
      output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    } as never) as unknown as Anthropic.Beta.BetaMessage;
    usage = { input_tokens: usage.input_tokens + res.usage.input_tokens, output_tokens: usage.output_tokens + res.usage.output_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens + (res.usage.cache_read_input_tokens ?? 0), cache_creation_input_tokens: usage.cache_creation_input_tokens + (res.usage.cache_creation_input_tokens ?? 0) };
    if (res.stop_reason === 'refusal') return json({ error: 'AI_REFUSAL' }, 422);
    history.push({ role: 'assistant', content: res.content as never });
    if (res.stop_reason !== 'tool_use') {
      const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
      await audit(user.id, 'chat', 'ai', null, { model: res.model, usage, turns: turn + 1 });
      return json({ reply: text });
    }
    const results = await Promise.all(res.content.filter((b) => b.type === 'tool_use').map(async (b) => {
      const tu = b as Anthropic.Beta.BetaToolUseBlock;
      try {
        return { type: 'tool_result' as const, tool_use_id: tu.id, content: JSON.stringify(await runTool(tu.name, tu.input as Record<string, string>, lang, user.id)).slice(0, 60_000) };
      } catch (e) {
        return { type: 'tool_result' as const, tool_use_id: tu.id, content: `Erreur: ${(e as Error).message}`, is_error: true };
      }
    }));
    history.push({ role: 'user', content: results });
  }
  return json({ reply: lang === 'fr' ? 'Désolé, je n’ai pas pu terminer cette recherche.' : 'Sorry, I could not complete this research.' });
}));

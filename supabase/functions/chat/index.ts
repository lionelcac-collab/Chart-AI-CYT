// POST /chat {messages:[{role,content}], lang} — expert assistant (Claude Sonnet 5.5) with tools over our DB.
// The model only answers from tool results; every figure carries its date and source.
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import { ANALYST_SYSTEM, MODELS, claude } from '../_shared/ai.ts';
import { admin, asUser, audit, currentUser, handler, isPremium, json } from '../_shared/runtime.ts';
import { buildSheet, sheetForPrompt } from '../_shared/sheet.ts';
import { ENTITLEMENTS } from '../_shared/core/index.ts';

const tools: Anthropic.Tool[] = [
  { name: 'search_assets', description: 'Recherche des actifs (actions, obligations, indices) par nom, ticker ou ISIN. Renvoie id, ticker, nom, marché.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, market: { type: 'string', enum: ['BRVM', 'BVMAC', 'NGX'] } }, required: ['query'], additionalProperties: false }, strict: true },
  { name: 'get_asset_sheet', description: 'Fiche complète d’un actif : dernier cours daté, plus bas/plus hauts, performances, liquidité, ratios, technique, consensus, actualités.',
    input_schema: { type: 'object', properties: { asset_id: { type: 'string', description: 'ex. BRVM:SNTS' } }, required: ['asset_id'], additionalProperties: false }, strict: true },
  { name: 'get_rankings', description: 'Classement des meilleures opportunités (score du modèle) par style et périmètre, après la dernière séance.',
    input_schema: { type: 'object', properties: { scope: { type: 'string', description: 'AFRICA, BRVM, BVMAC, NGX ou MARCHÉ:sector:CODE' }, style: { type: 'string', enum: ['momentum', 'value', 'dividend', 'quality', 'overall'] } }, required: ['scope', 'style'], additionalProperties: false }, strict: true },
  { name: 'get_market_overview', description: 'Indices, plus fortes hausses/baisses et volumes de la dernière séance pour un marché.',
    input_schema: { type: 'object', properties: { market: { type: 'string', enum: ['BRVM', 'BVMAC', 'NGX'] } }, required: ['market'], additionalProperties: false }, strict: true },
  { name: 'get_market_scan', description: 'Balayage de TOUTE la cote d’un marché sur une période (identique à la page Marchés) : titres proches d’un support ou d’une résistance (écart en %), plus fortes hausses et baisses de la période. À utiliser pour toute question « quels titres… » sur supports, résistances, hausses ou baisses.',
    input_schema: { type: 'object', properties: { market: { type: 'string', enum: ['BRVM', 'BVMAC', 'NGX'] }, period: { type: 'string', enum: ['1D', '1W', '1M', '3M', '6M', '1Y'], description: 'défaut 3M pour supports/résistances, 1D pour hausses/baisses' }, max_distance_pct: { type: 'number', description: 'écart maximal au niveau, défaut 3' } }, required: ['market'], additionalProperties: false } },
  { name: 'search_documents', description: 'Recherche plein texte dans les rapports annuels, communiqués et bulletins officiels indexés.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, asset_id: { type: 'string' } }, required: ['query'], additionalProperties: false } },
];

async function runTool(name: string, input: Record<string, string>, lang: 'fr' | 'en') {
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

  const { messages, lang = 'fr' } = (await req.json()) as { messages: { role: 'user' | 'assistant'; content: string }[]; lang: 'fr' | 'en' };
  const history: Anthropic.Beta.BetaMessageParam[] = messages.slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  const system = [{ type: 'text' as const, text: ANALYST_SYSTEM + `\nUtilise les outils pour toute donnée chiffrée. Pour les questions sur plusieurs titres (supports, résistances, hausses, baisses), utilise get_market_scan qui couvre toute la cote. Cite date et source de chaque chiffre.
Mise en forme (affichage mobile) : titres courts avec ##, listes à puces avec -, gras avec **. JAMAIS de tableau. Dates au format JJ/MM/AAAA. Pourcentages à 2 décimales. N'écris pas de nom de champ technique ni de mot anglais (« sideways » = latérale, « breakdown » = cassure). Réponse concise. Termine par : « Information, pas un conseil en investissement. »`, cache_control: { type: 'ephemeral' as const } }];

  let usage = { input_tokens: 0, output_tokens: 0 };
  for (let turn = 0; turn < 6; turn++) {
    const res = await claude().beta.messages.create({
      model: MODELS.deep, max_tokens: 4000, system, tools: tools as never, messages: history,
      output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    } as never) as unknown as Anthropic.Beta.BetaMessage;
    usage = { input_tokens: usage.input_tokens + res.usage.input_tokens, output_tokens: usage.output_tokens + res.usage.output_tokens };
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
        return { type: 'tool_result' as const, tool_use_id: tu.id, content: JSON.stringify(await runTool(tu.name, tu.input as Record<string, string>, lang)).slice(0, 60_000) };
      } catch (e) {
        return { type: 'tool_result' as const, tool_use_id: tu.id, content: `Erreur: ${(e as Error).message}`, is_error: true };
      }
    }));
    history.push({ role: 'user', content: results });
  }
  return json({ reply: lang === 'fr' ? 'Désolé, je n’ai pas pu terminer cette recherche.' : 'Sorry, I could not complete this research.' });
}));

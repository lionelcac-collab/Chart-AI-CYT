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
        db.from('quotes_latest').select('asset_id, last, change_pct, volume, value, as_of, source').like('asset_id', `${input.market}:%`).order('change_pct', { ascending: false }),
      ]);
      const m = movers.data ?? [];
      return { indices: idx.data, top: m.slice(0, 5), flop: m.slice(-5).reverse(), mostTraded: [...m].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 5) };
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
  const system = [{ type: 'text' as const, text: ANALYST_SYSTEM + `\nUtilise les outils pour toute donnée chiffrée. Cite date et source de chaque chiffre. Termine par : « Information, pas un conseil en investissement. »`, cache_control: { type: 'ephemeral' as const } }];

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

// POST /analyze {assetId, lang} — full AI analysis of an asset (Claude Sonnet 5.5).
// Free: 3/day (atomic quota in SQL). Cached per asset × session × language.
import { ASSET_ANALYSIS_SCHEMA, MODELS, cached, generateJson } from '../_shared/ai.ts';
import { admin, asUser, currentUser, handler, json } from '../_shared/runtime.ts';
import { buildSheet, sheetForPrompt } from '../_shared/sheet.ts';
import { ENTITLEMENTS } from '../_shared/core/index.ts';

const PROMPT_VERSION = 'asset-analysis-v1';

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  const { assetId, lang = 'fr' } = await req.json();
  const { data: allowed, error } = await asUser(req).rpc('consume_ai_quota', { p_kind: 'analysis', p_limit: ENTITLEMENTS.free.aiAnalysesPerDay });
  if (error) throw error;
  if (!allowed) return json({ error: 'QUOTA_EXCEEDED', limit: ENTITLEMENTS.free.aiAnalysesPerDay }, 402);

  const db = admin();
  const sheet = await buildSheet(db, assetId);
  if (!sheet) return json({ error: 'actif introuvable' }, 404);
  if (!sheet.lastClose) return json({ error: 'DATA_UNAVAILABLE' }, 422);

  const key = `asset_analysis|${assetId}|${sheet.lastClose.date}|${lang}|${PROMPT_VERSION}`;
  const out = await cached(key, null, async () => {
    const r = await generateJson({
      model: MODELS.deep,
      schema: ASSET_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
      effort: 'medium',
      content: [{ type: 'text', text:
        `Produis l'analyse complète de cet actif en langue « ${lang} » à partir de ces données (JSON). ` +
        `Explique la technique, les fondamentaux, le consensus et les 3 scénarios du modèle sans en modifier les chiffres. ` +
        `Liste dans dataGaps les données manquantes. Ne formule aucune recommandation impérative.\n\n` +
        JSON.stringify(sheetForPrompt(sheet, lang)) }],
    });
    return { content: r.data, model: r.model, promptVersion: PROMPT_VERSION, usage: r.usage,
      meta: { kind: 'asset_analysis', asset_id: assetId, market: sheet.asset.market, language: lang, session_date: sheet.lastClose!.date } };
  });
  return json({ ...out, disclaimer: sheet.consensus?.disclaimer });
}));

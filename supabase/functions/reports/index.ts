// POST /reports
//   {kind:'close', market}  → latest cached closing summary (public).
//   {kind:'weekly'}         → (service role, cron) generates the weekly summary per market with Claude Haiku 5.5.
import { MODELS, cached, generateJson } from '../_shared/ai.ts';
import { admin, handler, json, requireService } from '../_shared/runtime.ts';
import { MVP_MARKETS } from '../_shared/core/index.ts';

const SCHEMA = { type: 'object', additionalProperties: false, required: ['title', 'body_fr', 'body_en', 'highlights'],
  properties: { title: { type: 'string' }, body_fr: { type: 'string' }, body_en: { type: 'string' }, highlights: { type: 'array', items: { type: 'string' } } } };

Deno.serve(handler(async (req) => {
  const { kind = 'close', market } = await req.json().catch(() => ({}));
  const db = admin();
  if (kind === 'close') {
    const { data } = await db.from('ai_analyses').select('content, session_date, model').eq('kind', 'close_report').eq('market', market).order('session_date', { ascending: false }).limit(1).maybeSingle();
    return json({ content: data?.content ?? null, sessionDate: data?.session_date ?? null });
  }
  requireService(req);
  const week = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const out: Record<string, unknown> = {};
  for (const m of MVP_MARKETS) {
    const [{ data: idx }, { data: events }, { data: ops }] = await Promise.all([
      db.from('index_values').select('index_code, session_date, value, change_pct, source').eq('market', m).gte('session_date', since).order('session_date'),
      db.from('corporate_events').select('asset_id, kind, event_date, title_fr').gte('event_date', week).lte('event_date', new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)).like('asset_id', `${m}:%`),
      db.from('capital_operations').select('kind, issuer, title, subscription_start, subscription_end, listing_date, source').eq('market', m).in('status', ['announced', 'open']),
    ]);
    const r = await cached(`weekly_report|${m}|${week}|v1`, null, async () => {
      const g = await generateJson({ model: MODELS.bulk, effort: 'low', schema: SCHEMA, content: [{ type: 'text', text:
        `Synthèse hebdomadaire du marché ${m} (FR et EN, 200 mots max chacun) : évolution des indices sur la semaine, calendrier de la semaine à venir, IPO/emprunts en cours. Uniquement ces données, sources citées : ` +
        JSON.stringify({ indices: idx, upcoming: events, operations: ops }) }] });
      return { content: g.data, model: g.model, promptVersion: 'weekly-v1', usage: g.usage, meta: { kind: 'weekly_report', market: m, session_date: week } };
    });
    out[m] = r.content;
  }
  return json(out);
}));

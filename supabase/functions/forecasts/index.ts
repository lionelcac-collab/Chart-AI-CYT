// POST /forecasts — Premium « Prévisions » section.
//   {action:'list'}                 → latest model forecasts for every stock (ranking screen). Free: teaser counts only.
//   {action:'detail', assetId}      → blind walk-forward check of the model on this stock's own price history.
//   {action:'explain', assetId, lang} → AI reading of the forecasts (Claude Sonnet 5.5), cached per session × language.
// Forecasts are statistical scenarios computed by the code (consensus model), never invented by the AI.
import { MODELS, cached, generateJson } from '../_shared/ai.ts';
import { admin, currentUser, handler, isPremium, json } from '../_shared/runtime.ts';
import { buildSheet, sheetForPrompt } from '../_shared/sheet.ts';
import { HORIZON_SESSIONS, backtest, type ConsensusResult, type Horizon } from '../_shared/core/index.ts';

const PROMPT_VERSION = 'forecast-reading-v1';
const HORIZONS: Horizon[] = ['1M', '3M', '6M', '12M'];

type ForecastListRow = { assetId: string; asOf: string; orientation: string; [k: string]: unknown };

const READING_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['headline', 'horizons', 'drivers', 'risks', 'watch', 'conclusion'],
  properties: {
    headline: { type: 'string', description: 'Une phrase : lecture d’ensemble des prévisions du modèle.' },
    horizons: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['horizon', 'reading'], properties: { horizon: { type: 'string', enum: HORIZONS }, reading: { type: 'string' } } } },
    drivers: { type: 'array', items: { type: 'string' }, description: 'Facteurs qui expliquent la prévision (issus de topFactors et des données).' },
    risks: { type: 'array', items: { type: 'string' }, description: 'Ce qui pourrait faire échouer le scénario central (liquidité, données manquantes, invalidation…).' },
    watch: { type: 'array', items: { type: 'string' }, description: 'Niveaux de prix et événements à surveiller, chiffrés.' },
    conclusion: { type: 'string' },
  },
} as const;

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  const premium = await isPremium(user?.id);
  const { action = 'list', assetId, lang = 'fr' } = (await req.json().catch(() => ({}))) as { action?: string; assetId?: string; lang?: 'fr' | 'en' };
  const db = admin();

  if (action === 'list') {
    // Same list for every user: shared 30-minute cache (masking for free users is applied after).
    const { data: hit } = await db.from('api_cache').select('payload').eq('key', 'forecast_list').gt('expires_at', new Date().toISOString()).maybeSingle();
    let rows = hit?.payload as ForecastListRow[] | undefined;
    if (!rows) {
      rows = await buildList();
      await db.from('api_cache').upsert({ key: 'forecast_list', payload: rows, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }, { onConflict: 'key' });
    }
    if (!premium) {
      const count = (o: string) => rows!.filter((r) => r.orientation === o).length;
      return json({ locked: true, total: rows.length, positive: count('positive'), neutral: count('neutral'), negative: count('negative'), asOf: rows.reduce((m, r) => (r.asOf > m ? r.asOf : m), '') });
    }
    return json({ locked: false, rows });
  }
  async function buildList() {
    // Paged read (max 1 000 rows per request); stocks only (ETFs / funds excluded).
    const data: Record<string, any>[] = [];
    for (let from = 0; ; from += 500) {
      const { data: page, error } = await db.from('latest_consensus').select('asset_id, as_of, orientation, confidence, confidence_value, invalidation_level, result, assets!inner(name, ticker, market, currency, asset_class, is_active, sectors(name_fr, name_en))')
        .eq('assets.asset_class', 'equity').eq('assets.is_active', true).order('asset_id').range(from, from + 499);
      if (error) throw error;
      data.push(...(page ?? []));
      if ((page ?? []).length < 500) break;
    }
    const rows = (data ?? []).map((r) => {
      const c = r.result as ConsensusResult;
      const a = r.assets as unknown as { name: string; ticker: string; market: string; currency: string; sectors: { name_fr: string; name_en: string } | null };
      return {
        assetId: r.asset_id, asOf: r.as_of, name: a?.name, ticker: a?.ticker, market: a?.market, currency: a?.currency,
        sector: a?.sectors ? { fr: a.sectors.name_fr, en: a.sectors.name_en } : null,
        price: c.price, orientation: r.orientation, confidence: r.confidence, confidenceValue: Number(r.confidence_value),
        invalidation: r.invalidation_level == null ? null : Number(r.invalidation_level),
        illiquid: c.liquidity?.warning ?? false, analysts: c.analysts?.count ?? 0,
        horizons: Object.fromEntries(c.forecasts.map((f) => [f.horizon, {
          central: f.central.returnPct, pBull: f.bull.probability, pBear: f.bear.probability, pCentral: f.central.probability,
          low: f.rangeLow, high: f.rangeHigh, bull: f.bull.returnPct, bear: f.bear.returnPct,
        }])),
      };
    });
    return rows;
  }

  if (!premium) return json({ error: 'PREMIUM_REQUIRED' }, 402);
  if (!assetId) return json({ error: 'assetId requis' }, 400);
  const sheet = await buildSheet(db, assetId);
  if (!sheet) return json({ error: 'actif introuvable' }, 404);

  if (action === 'detail') {
    // Blind test on this stock: at each past date the model only sees prices up to that date (price-only part of the model).
    const bars = sheet.bars;
    const out = HORIZONS.slice(0, 3).map((h) => {
      const r = backtest(bars, { horizon: h, step: h === '1M' ? 21 : 42, minHistory: 252 });
      return { horizon: h, samples: r.samples.slice(-24).map((s) => ({ date: s.date, predicted: s.predictedReturnPct, realised: s.realisedReturnPct, inRange: s.inRange, hit: s.hit })),
        n: r.samples.length, calls: r.calls, hitRate: r.hitRate, rangeCoverage: r.rangeCoverage, baseRateUp: r.baseRateUp };
    });
    return json({ assetId, sessions: bars.length, horizonSessions: HORIZON_SESSIONS, backtests: out });
  }

  if (action === 'explain') {
    if (!sheet.consensus || !sheet.lastClose) return json({ error: 'DATA_UNAVAILABLE' }, 422);
    const key = `forecast_reading|${assetId}|${sheet.lastClose.date}|${lang}|${PROMPT_VERSION}`;
    const out = await cached(key, null, async () => {
      const r = await generateJson({
        model: MODELS.deep, effort: 'medium', maxTokens: 4000,
        schema: READING_SCHEMA as unknown as Record<string, unknown>,
        content: [{ type: 'text', text:
          `Rédige en langue « ${lang} » la lecture des PRÉVISIONS du modèle pour cet actif (bloc consensus.forecasts : horizons 1M/3M/6M/12M, scénarios baissier/central/haussier avec probabilités, fourchette à 80 %, niveau d'invalidation), en t'appuyant sur les autres données pour les expliquer. ` +
          `Ne modifie aucun chiffre du modèle et n'en invente aucun ; cite les probabilités et rendements tels quels (arrondis). Vouvoiement. Ne cite pas le nom technique ni la version du modèle (dis « le modèle »). ` +
          `horizons : une phrase par horizon (scénario le plus probable + probabilité + fourchette). drivers : 2 à 4 facteurs. risks : 2 à 4 risques (signale la faible liquidité et les données manquantes). watch : 2 à 4 niveaux/événements chiffrés. ` +
          `conclusion : 3 à 4 phrases tranchées sur ce que disent les prévisions et leur fiabilité (confiance, couverture des données, accord avec les analystes s'il y en a), puis termine exactement par : « ${lang === 'fr' ? 'Ceci n’est pas un conseil en investissement ; pour une analyse approfondie adaptée à votre situation, consultez un professionnel agréé (SGI, conseiller en investissement financier).' : 'This is not investment advice; for an in-depth analysis suited to your situation, consult a licensed professional (broker, financial adviser).'} » ` +
          `Aucune formulation impérative (pas d'« achetez », « vendez »).\n\n` + JSON.stringify(sheetForPrompt(sheet, lang)) }],
      });
      return { content: r.data, model: r.model, promptVersion: PROMPT_VERSION, usage: r.usage,
        meta: { kind: 'forecast_reading', asset_id: assetId, market: sheet.asset.market, language: lang, session_date: sheet.lastClose!.date } };
    });
    return json({ ...out, asOf: sheet.lastClose.date, disclaimer: sheet.consensus.disclaimer });
  }
  return json({ error: 'action inconnue' }, 400);
}));

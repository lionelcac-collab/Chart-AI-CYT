// Job (after all sessions): consensus for every asset, opportunity rankings,
// closing report per market (Claude Haiku 5.5), alerts + push notifications.
import { MODELS, cached, generateJson } from '../_shared/ai.ts';
import { admin, handler, json, requireService } from '../_shared/runtime.ts';
import { buildSheet, loadBars } from '../_shared/sheet.ts';
import { evaluateAlerts } from '../_shared/alerts.ts';
import { MARKETS, MARKET_LABEL, MVP_MARKETS, SCAN_PERIODS, scanMarket, type FactorKey, type MarketCode, type ScanInput } from '../_shared/core/index.ts';

type Row = { assetId: string; market: string; sector: string | null; name: string; scores: Partial<Record<FactorKey | 'overall', number>>; illiquid: boolean; confidence: string };

const REPORT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'body_fr', 'body_en', 'highlights'],
  properties: { title: { type: 'string' }, body_fr: { type: 'string' }, body_en: { type: 'string' }, highlights: { type: 'array', items: { type: 'string' } } },
};


const CHUNK = 80;

Deno.serve(handler(async (req) => {
  requireService(req);
  const db = admin();
  const body = (await req.json().catch(() => ({}))) as { phase?: 'consensus' | 'summary' | 'final'; market?: MarketCode; offset?: number; limit?: number };

  // Cron entry point: fan out one call per market chunk (each call stays well within the edge time limit).
  // The 'final' phase (rankings + alerts) runs from its own schedule, after the chunks.
  if (!body.phase) {
    const calls: unknown[] = [];
    for (const m of MVP_MARKETS) {
      const { count } = await db.from('assets').select('id', { count: 'exact', head: true }).eq('market', m).eq('is_active', true).eq('asset_class', 'equity');
      for (let off = 0; off < (count ?? 0); off += CHUNK) calls.push({ phase: 'consensus', market: m, offset: off, limit: CHUNK });
      if (count) calls.push({ phase: 'summary', market: m });
    }
    for (const c of calls) await db.rpc('call_edge', { fn: 'post-close', body: c });
    return json({ dispatched: calls.length });
  }

  if (body.phase === 'consensus') {
    const m = body.market!;
    const { data: assets } = await db.from('assets').select('id').eq('market', m).eq('is_active', true).eq('asset_class', 'equity').order('id').range(body.offset ?? 0, (body.offset ?? 0) + (body.limit ?? CHUNK) - 1);
    let n = 0;
    for (const a of assets ?? []) {
      const s = await buildSheet(db, a.id).catch((e) => { console.warn(a.id, e.message); return null; });
      if (!s?.consensus) continue;
      const c = s.consensus;
      await db.from('consensus_results').upsert({
        asset_id: a.id, as_of: c.asOf, model_version: c.modelVersion, orientation: c.orientation, confidence: c.confidence,
        confidence_value: c.confidenceValue, invalidation_level: c.invalidationLevel, data_coverage: c.dataCoverage,
        result: c, inputs: s.consensusInputs,
      }, { onConflict: 'asset_id,as_of,model_version' });
      n++;
    }
    return json({ market: m, offset: body.offset ?? 0, consensus: n });
  }

  if (body.phase === 'summary') {
    const m = body.market!;
    const { data: assets } = await db.from('assets').select('id, market, name').eq('market', m).eq('is_active', true).eq('asset_class', 'equity');
  // Market scans: movers per period + proximity to supports / resistances (dashboard).
  {
    const inputs: ScanInput[] = [];
    for (const a of assets ?? []) {
      const bars = await loadBars(db, a.id, 2);
      if (bars.length >= 2) inputs.push({ assetId: a.id, ticker: a.id.split(':')[1]!, name: a.name, bars });
    }
    if (inputs.length) {
    const date = inputs.map((i) => i.bars[i.bars.length - 1]!.date).sort().pop()!;
    await db.from('market_scans').upsert(SCAN_PERIODS.map((period) => ({ market: m, period, session_date: date, rows: scanMarket(inputs, period) })), { onConflict: 'market,period,session_date' });
    }
  }


  // Closing report per market (cached per market × session), built only from verified closes (market_latest).
  const SRC: Record<string, string> = { 'official_bulletin:BRVM': 'Bulletin officiel de la cote BRVM', 'official_bulletin:BVMAC': 'Bulletin officiel de la cote BVMAC', 'official_bulletin:NGX': 'NGX Daily Official List', mansa: 'Mansa Markets' };
  const r2 = (x: unknown) => (x == null ? null : Math.round(Number(x) * 100) / 100);
  {
    const [{ data: idx }, { data: rows }] = await Promise.all([
      db.from('index_values').select('index_code, name, value, change_pct, session_date').eq('market', m).order('session_date', { ascending: false }).limit(4),
      db.from('market_latest').select('ticker, name, session_date, close, change_pct, volume, value, currency, source').eq('market', m),
    ]);
    if (rows?.length) {
    const date = rows.map((r) => r.session_date as string).sort().pop()!;
    const day = rows.filter((r) => r.session_date === date);
    const priced = day.filter((r) => r.change_pct != null).map((r) => ({ titre: `${r.name} (${r.ticker})`, cloture: r2(r.close), variation_pct: r2(r.change_pct), valeur_echangee: r2(r.value), volume: r.volume == null ? null : Number(r.volume) }));
    const up = priced.filter((r) => (r.variation_pct ?? 0) > 0).sort((a, b) => b.variation_pct! - a.variation_pct!);
    const down = priced.filter((r) => (r.variation_pct ?? 0) < 0).sort((a, b) => a.variation_pct! - b.variation_pct!);
    const sources = [...new Set(day.map((r) => SRC[r.source as string] ?? (String(r.source).startsWith('official_bulletin') ? (m === 'NGX' ? SRC['official_bulletin:NGX'] : `Bulletin officiel de la cote ${m}`) : r.source)))];
    const [y, mo, d] = date.split('-');
    await cached(`close_report|${m}|${date}|v2`, null, async () => {
      const r = await generateJson({ model: MODELS.bulk, effort: 'low', schema: REPORT_SCHEMA, content: [{ type: 'text', text:
        `Rédige la synthèse de clôture du marché ${MARKETS[m as 'BRVM']?.name ?? m} (${MARKET_LABEL[m]?.short ?? m}) pour la séance du ${d}/${mo}/${y}, en français (body_fr) et en anglais (body_en), 120 mots maximum chacun, pour un lecteur grand public.\n` +
        `Règles de style : phrases naturelles ; n'écris JAMAIS de nom de champ technique (pas de « change_pct », « mostTraded », « as_of », pas d'horodatage) ; dates au format JJ/MM/AAAA ; pourcentages avec 2 décimales et le signe (+1,25 %) ; montants avec séparateurs de milliers et la devise ; cite la source en fin de texte (« Source : … »). ` +
        `Si une information manque (par ex. les indices), dis-le en une courte phrase sans insister. N'invente rien. highlights : 3 points clés courts.\n` +
        `Données (${sources.join(', ')}) : ` +
        JSON.stringify({ seance: `${d}/${mo}/${y}`, devise: day[0]?.currency, titres_cotes: day.length, hausses: up.length, baisses: down.length, inchanges: priced.length - up.length - down.length,
          indices: idx?.length ? idx : 'indisponibles', plus_fortes_hausses: up.slice(0, 5), plus_fortes_baisses: down.slice(0, 5),
          plus_echanges: [...priced].sort((a, b) => (b.valeur_echangee ?? b.volume ?? 0) - (a.valeur_echangee ?? a.volume ?? 0)).slice(0, 5), source: sources }) }] });
      return { content: r.data, model: r.model, promptVersion: 'close-report-v2', usage: r.usage, meta: { kind: 'close_report', market: m, session_date: date } };
    });
  }
  }

    return json({ market: m, summary: true });
  }

  // phase 'final': rankings from the latest model results, then alerts.
  const { data: latest } = await db.from('latest_consensus').select('asset_id, as_of, confidence, confidence_value, result, assets!inner(market, name, is_active, sectors(code))').eq('assets.is_active', true);
  const rows: Row[] = [];
  let sessionDate = '';
  for (const l of latest ?? []) {
    const a = l.assets as unknown as { market: string; name: string; sectors: { code?: string } | null };
    const c = l.result as { factors: { key: FactorKey; score: number | null }[]; forecasts: { score: number }[]; liquidity?: { warning?: boolean } | null };
    sessionDate = l.as_of > sessionDate ? l.as_of : sessionDate;
    const f = Object.fromEntries(c.factors.filter((x) => x.score != null).map((x) => [x.key, x.score!]));
    rows.push({ assetId: l.asset_id, market: a.market, sector: a.sectors?.code ?? null, name: a.name,
      scores: { ...f, overall: c.forecasts[3]!.score * (0.5 + 0.5 * Number(l.confidence_value)) }, illiquid: c.liquidity?.warning ?? false, confidence: l.confidence });
  }

  // Rankings: AFRICA, per market, per market×sector. Illiquid stocks are kept but flagged and ranked after liquid ones.
  const styles = { momentum: 'trend', value: 'valuation', dividend: 'dividend', quality: 'quality', overall: 'overall' } as const;
  const scopes: Record<string, Row[]> = { AFRICA: rows };
  for (const r of rows) {
    (scopes[r.market] ??= []).push(r);
    if (r.sector) (scopes[`${r.market}:sector:${r.sector}`] ??= []).push(r);
  }
  const rankingRows = [];
  for (const [scope, list] of Object.entries(scopes)) {
    for (const [style, key] of Object.entries(styles)) {
      const items = list.filter((r) => r.scores[key] != null)
        .sort((a, b) => Number(a.illiquid) - Number(b.illiquid) || b.scores[key]! - a.scores[key]!)
        .slice(0, 20).map((r, i) => ({ rank: i + 1, asset_id: r.assetId, name: r.name, score: r.scores[key], illiquid: r.illiquid, confidence: r.confidence }));
      rankingRows.push({ scope, style, session_date: sessionDate || new Date().toISOString().slice(0, 10), items });
    }
  }
  if (rankingRows.length) await db.from('rankings').upsert(rankingRows, { onConflict: 'scope,style,session_date' });

  // Alerts (per asset and global watchlist alerts) → in-app notifications + push.
  const alertsRes = await evaluateAlerts(db).catch((e) => ({ error: String(e) }));
  await db.from('ingestion_runs').insert({ job: 'post_close_final', status: 'error' in (alertsRes as object) ? 'partial' : 'ok', rows_written: rankingRows.length, attempts: [{ ranked: rows.length, rankings: rankingRows.length, alerts: alertsRes }], finished_at: new Date().toISOString() });
  return json({ ranked: rows.length, rankings: rankingRows.length, alerts: alertsRes });
}));

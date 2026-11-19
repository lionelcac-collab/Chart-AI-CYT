// Job (after all sessions): consensus for every asset, opportunity rankings,
// closing report per market (Claude Haiku 5.5), alerts + push notifications.
import { MODELS, cached, generateJson } from '../_shared/ai.ts';
import { admin, handler, json, requireService } from '../_shared/runtime.ts';
import { buildSheet, loadBars } from '../_shared/sheet.ts';
import { MVP_MARKETS, SCAN_PERIODS, scanMarket, type FactorKey, type ScanInput } from '../_shared/core/index.ts';

type Row = { assetId: string; market: string; sector: string | null; name: string; scores: Partial<Record<FactorKey | 'overall', number>>; illiquid: boolean; confidence: string };

const REPORT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'body_fr', 'body_en', 'highlights'],
  properties: { title: { type: 'string' }, body_fr: { type: 'string' }, body_en: { type: 'string' }, highlights: { type: 'array', items: { type: 'string' } } },
};

async function sendPush(tokens: string[], title: string, body: string, data: Record<string, string>) {
  // Expo push service (relays to FCM / APNs). Batches of 100.
  for (let i = 0; i < tokens.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.slice(i, i + 100).map((to) => ({ to, title, body, data, sound: 'default' }))),
    }).catch((e) => console.warn('push', e));
  }
}

Deno.serve(handler(async (req) => {
  requireService(req);
  const db = admin();
  const { data: assets } = await db.from('assets').select('id, market, name, sectors(code)').eq('is_active', true).eq('asset_class', 'equity');
  const rows: Row[] = [];
  let sessionDate = '';
  for (const a of assets ?? []) {
    const s = await buildSheet(db, a.id).catch((e) => { console.warn(a.id, e.message); return null; });
    if (!s?.consensus) continue;
    const c = s.consensus;
    sessionDate = c.asOf > sessionDate ? c.asOf : sessionDate;
    await db.from('consensus_results').upsert({
      asset_id: a.id, as_of: c.asOf, model_version: c.modelVersion, orientation: c.orientation, confidence: c.confidence,
      confidence_value: c.confidenceValue, invalidation_level: c.invalidationLevel, data_coverage: c.dataCoverage,
      result: c, inputs: s.consensusInputs,
    }, { onConflict: 'asset_id,as_of,model_version' });
    const f = Object.fromEntries(c.factors.filter((x) => x.score != null).map((x) => [x.key, x.score!]));
    rows.push({ assetId: a.id, market: a.market, sector: (a.sectors as { code?: string } | null)?.code ?? null, name: a.name,
      scores: { ...f, overall: c.forecasts[3]!.score * (0.5 + 0.5 * c.confidenceValue) }, illiquid: (c.liquidity?.warning ?? false), confidence: c.confidence });
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

  // Market scans: movers per period + proximity to supports / resistances (dashboard).
  for (const m of MVP_MARKETS) {
    const inputs: ScanInput[] = [];
    for (const a of (assets ?? []).filter((x) => x.market === m)) {
      const bars = await loadBars(db, a.id, 2);
      if (bars.length >= 2) inputs.push({ assetId: a.id, ticker: a.id.split(':')[1]!, name: a.name, bars });
    }
    if (!inputs.length) continue;
    const date = inputs.map((i) => i.bars[i.bars.length - 1]!.date).sort().pop()!;
    await db.from('market_scans').upsert(SCAN_PERIODS.map((period) => ({ market: m, period, session_date: date, rows: scanMarket(inputs, period) })), { onConflict: 'market,period,session_date' });
  }

  // Closing report per market (cached per market × session), built only from verified closes (market_latest).
  const SRC: Record<string, string> = { 'official_bulletin:BRVM': 'Bulletin officiel de la cote BRVM', 'official_bulletin:BVMAC': 'Bulletin officiel de la cote BVMAC', 'official_bulletin:NGX': 'NGX Daily Official List', mansa: 'Mansa Markets' };
  const r2 = (x: unknown) => (x == null ? null : Math.round(Number(x) * 100) / 100);
  for (const m of MVP_MARKETS) {
    const [{ data: idx }, { data: rows }] = await Promise.all([
      db.from('index_values').select('index_code, name, value, change_pct, session_date').eq('market', m).order('session_date', { ascending: false }).limit(4),
      db.from('market_latest').select('ticker, name, session_date, close, change_pct, volume, value, currency, source').eq('market', m),
    ]);
    if (!rows?.length) continue;
    const date = rows.map((r) => r.session_date as string).sort().pop()!;
    const day = rows.filter((r) => r.session_date === date);
    const priced = day.filter((r) => r.change_pct != null).map((r) => ({ titre: `${r.name} (${r.ticker})`, cloture: r2(r.close), variation_pct: r2(r.change_pct), valeur_echangee: r2(r.value), volume: r.volume == null ? null : Number(r.volume) }));
    const up = priced.filter((r) => (r.variation_pct ?? 0) > 0).sort((a, b) => b.variation_pct! - a.variation_pct!);
    const down = priced.filter((r) => (r.variation_pct ?? 0) < 0).sort((a, b) => a.variation_pct! - b.variation_pct!);
    const sources = [...new Set(day.map((r) => SRC[r.source as string] ?? (String(r.source).startsWith('official_bulletin') ? (m === 'NGX' ? SRC['official_bulletin:NGX'] : `Bulletin officiel de la cote ${m}`) : r.source)))];
    const [y, mo, d] = date.split('-');
    await cached(`close_report|${m}|${date}|v2`, null, async () => {
      const r = await generateJson({ model: MODELS.bulk, effort: 'low', schema: REPORT_SCHEMA, content: [{ type: 'text', text:
        `Rédige la synthèse de clôture du marché ${m} pour la séance du ${d}/${mo}/${y}, en français (body_fr) et en anglais (body_en), 120 mots maximum chacun, pour un lecteur grand public.\n` +
        `Règles de style : phrases naturelles ; n'écris JAMAIS de nom de champ technique (pas de « change_pct », « mostTraded », « as_of », pas d'horodatage) ; dates au format JJ/MM/AAAA ; pourcentages avec 2 décimales et le signe (+1,25 %) ; montants avec séparateurs de milliers et la devise ; cite la source en fin de texte (« Source : … »). ` +
        `Si une information manque (par ex. les indices), dis-le en une courte phrase sans insister. N'invente rien. highlights : 3 points clés courts.\n` +
        `Données (${sources.join(', ')}) : ` +
        JSON.stringify({ seance: `${d}/${mo}/${y}`, devise: day[0]?.currency, titres_cotes: day.length, hausses: up.length, baisses: down.length, inchanges: priced.length - up.length - down.length,
          indices: idx?.length ? idx : 'indisponibles', plus_fortes_hausses: up.slice(0, 5), plus_fortes_baisses: down.slice(0, 5),
          plus_echanges: [...priced].sort((a, b) => (b.valeur_echangee ?? b.volume ?? 0) - (a.valeur_echangee ?? a.volume ?? 0)).slice(0, 5), source: sources }) }] });
      return { content: r.data, model: r.model, promptVersion: 'close-report-v2', usage: r.usage, meta: { kind: 'close_report', market: m, session_date: date } };
    });
  }

  // Alerts
  const { data: alerts } = await db.from('alerts').select('*').eq('active', true);
  const { data: quotes } = await db.from('quotes_latest').select('asset_id, last, change_pct');
  const qm = new Map((quotes ?? []).map((x) => [x.asset_id, x]));
  let fired = 0;
  for (const al of alerts ?? []) {
    const q = qm.get(al.asset_id);
    if (!q) continue;
    const hit = (al.kind === 'price_above' && q.last >= al.threshold) || (al.kind === 'price_below' && q.last <= al.threshold) ||
      (al.kind === 'change_pct' && Math.abs(q.change_pct ?? 0) >= al.threshold);
    if (!hit || (al.last_triggered_at && Date.now() - new Date(al.last_triggered_at).getTime() < 20 * 3600_000)) continue;
    const { data: toks } = await db.from('push_tokens').select('token').eq('user_id', al.user_id);
    await sendPush((toks ?? []).map((t) => t.token), `Alerte ${al.asset_id}`, `Dernier cours : ${q.last} (${(q.change_pct ?? 0).toFixed(2)} %)`, { assetId: al.asset_id });
    await db.from('alerts').update({ last_triggered_at: new Date().toISOString() }).eq('id', al.id);
    fired++;
  }
  return json({ consensus: rows.length, rankings: rankingRows.length, alertsFired: fired });
}));

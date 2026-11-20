// Job (pg_cron): end-of-day / delayed ingestion per market, timezone-aware.
// Sources per market (first enabled one that answers wins, every attempt is logged):
//   BRVM  : licensed real-time (disabled) → Mansa ; official bulletin = cross-check + history
//   BVMAC : OFFICIAL BULLETIN (primary, no commercial API covers BVMAC) → Mansa (if it ever adds coverage)
//   NGX   : official NGX API (disabled) → Mansa ; official bulletin = cross-check
// Steps: fetch → validation → cross-check with the bulletin → upsert → anomalies + admin alert.
// Extra job: {"job":"backfill","market":"BVMAC","from":"2024-01-01","to":"2024-12-31"} rebuilds history from past bulletins.
import { getDocumentProxy } from 'npm:unpdf@1.4.0';
import { admin, handler, json, requireService } from '../_shared/runtime.ts';
import { saveBrvmEvents } from '../_shared/events.ts';
import { MARKETS, MVP_MARKETS, isIngestionWindow, localClock, type MarketCode, type Quote } from '../_shared/core/index.ts';
import {
  BulletinConnector, ConnectorRegistry, layoutText, LicensedRealtimeConnector, MansaConnector, NgxOfficialConnector, businessDays, crossCheck, validateQuote,
  type Anomaly, type BulletinSourceConfig, type MarketDataConnector,
} from '../_shared/data/index.ts';

const mansa = new MansaConnector({
  apiKey: Deno.env.get('MANSA_API_KEY') ?? undefined,
  baseUrl: Deno.env.get('MANSA_BASE_URL') ?? undefined,
  authHeader: Deno.env.get('MANSA_AUTH_HEADER') ?? undefined,
  requestsPerMinute: Number(Deno.env.get('MANSA_RPM') ?? 30),
  delayMinutes: Number(Deno.env.get('MANSA_DELAY_MIN') ?? 0),
});

/** Bulletin location per market, from secrets:
 *  BULLETIN_URL_<M>   direct template, e.g. https://…/BOC_{YYYYMMDD}.pdf
 *  or BULLETIN_INDEX_<M> (listing page) + BULLETIN_LINK_<M> (regex with {YYYY}{MM}{DD} placeholders). */
const bulletinSource = (m: MarketCode): BulletinSourceConfig => ({
  urlTemplate: Deno.env.get(`BULLETIN_URL_${m}`) ?? undefined,
  indexUrl: Deno.env.get(`BULLETIN_INDEX_${m}`) ?? undefined,
  linkPattern: Deno.env.get(`BULLETIN_LINK_${m}`) ?? undefined,
});
const bulletin = new BulletinConnector({
  sources: Object.fromEntries(MVP_MARKETS.map((m) => [m, bulletinSource(m)])),
  // Layout-preserving extraction: the bulletin readers rely on column alignment.
  extractText: async (bytes) => layoutText(await getDocumentProxy(bytes)),
  backfillDelayMs: 1500,
});

const registry = new ConnectorRegistry({
  BRVM: [new LicensedRealtimeConnector(), mansa],
  BVMAC: [bulletin, mansa],
  NGX: [new NgxOfficialConnector(), mansa],
});
const byId: Record<string, MarketDataConnector> = { [mansa.id]: mansa, [bulletin.id]: bulletin };

/** Hours after the expected bulletin time before a missing bulletin triggers an admin alert. */
const ALERT_GRACE_HOURS = 4;
function pastAlertCutoff(market: MarketCode): boolean {
  const info = MARKETS[market as 'BRVM'];
  const { hhmm } = localClock(info.timezone);
  const [h, m] = info.close.split(':').map(Number) as [number, number];
  const cutoff = h * 60 + m + info.bulletinDelayMin + ALERT_GRACE_HOURS * 60;
  const [ch, cm] = hhmm.split(':').map(Number) as [number, number];
  return ch * 60 + cm >= Math.min(cutoff, 23 * 60 + 59);
}

/** Bulletin closes of a session, used to cross-check another source. */
async function bulletinCloses(market: MarketCode, date: string) {
  const s = await bulletin.getSession(market, date).catch(() => null);
  return s ? s.rows.map((r) => ({ assetId: `${market}:${r.ticker}`, close: r.close })) : null;
}

async function ingest(market: MarketCode, job: 'eod' | 'delayed', force = false) {
  const db = admin();
  const info = MARKETS[market as 'BRVM'];
  const today = localClock(info.timezone).date;
  if (job === 'eod') {
    if (!force && !isIngestionWindow(info)) return { market, skipped: 'hors fenêtre' };
    const { data: done } = await db.from('ingestion_runs').select('id').eq('job', 'eod').eq('market', market).eq('status', 'ok').gte('started_at', `${today}T00:00:00Z`).limit(1);
    if (done?.length) return { market, skipped: 'déjà collecté' };
  }
  const { data: run } = await db.from('ingestion_runs').insert({ job, market }).select('id').single();
  const anomalies: Anomaly[] = [];
  const { value: quotes, source, attempts } = await registry.quotes(market);
  if (!quotes) {
    await db.from('ingestion_runs').update({ status: 'failed', attempts, finished_at: new Date().toISOString(), error: 'aucune source disponible' }).eq('id', run!.id);
    if (pastAlertCutoff(market)) await alertAdmin(`Collecte ${market} échouée : aucune source disponible`, attempts);
    return { market, status: 'failed' };
  }
  // A bulletin source may return the previous session while today's bulletin is not yet published.
  const sessionDate = quotes[0]!.provenance.asOf.slice(0, 10);
  const todayPending = job === 'eod' && sessionDate < today;

  for (const q of quotes) anomalies.push(...validateQuote(q, market, { today }));
  let verifiedIds = new Set<string>();
  if (source === bulletin.id) {
    verifiedIds = new Set(quotes.map((q) => q.assetId)); // the official bulletin IS the reference
  } else if (job === 'eod') {
    const ref = await bulletinCloses(market, sessionDate);
    if (ref) {
      anomalies.push(...crossCheck(quotes, ref));
      const blocked = new Set(anomalies.filter((a) => a.kind === 'source_divergence').map((a) => a.assetId));
      verifiedIds = new Set(ref.map((r) => r.assetId).filter((id) => !blocked.has(id)));
    }
  }
  const blocked = new Set(anomalies.filter((a) => a.severity === 'block').map((a) => a.assetId));
  const ok = quotes.filter((q) => !blocked.has(q.assetId));

  // Make sure every asset exists (new listings).
  const { data: known } = await db.from('assets').select('id').eq('market', market);
  const knownIds = new Set((known ?? []).map((a) => a.id));
  const missing = ok.filter((q) => !knownIds.has(q.assetId));
  if (missing.length) {
    const assets = await (byId[source!] ?? mansa).listAssets(market).catch(() => []);
    const rows = assets.filter((a) => missing.some((m) => m.assetId === a.id)).map((a) => ({ id: a.id, market, ticker: a.ticker, isin: a.isin, name: a.name, country: a.country || null, currency: a.currency }));
    if (rows.length) await db.from('assets').upsert(rows, { onConflict: 'id' });
  }

  const quoteRows = ok.map((q: Quote) => ({
    asset_id: q.assetId, last: q.last, previous_close: q.previousClose, change: q.change, change_pct: q.changePct, volume: q.volume, value: q.value,
    market_cap: q.marketCap, status: q.provenance.status.kind, delay_minutes: q.provenance.status.kind === 'delayed' ? q.provenance.status.delayMinutes : null,
    as_of: q.provenance.asOf, source: q.provenance.source, fetched_at: q.provenance.fetchedAt,
  }));
  await db.from('quotes_latest').upsert(quoteRows, { onConflict: 'asset_id' });
  if (job === 'eod') {
    // Only closing prices go into the history; intraday (delayed) quotes only update quotes_latest.
    const bars = ok.filter((q) => q.provenance.status.kind === 'close').map((q) => ({
      asset_id: q.assetId, session_date: q.provenance.asOf.slice(0, 10), close: q.last, volume: q.volume, value: q.value,
      source: q.provenance.source, verified: verifiedIds.has(q.assetId),
    }));
    await db.from('price_bars').upsert(bars, { onConflict: 'asset_id,session_date' });
    // Same rule as prices: only closing index levels go into the history.
    const indices = (await mansa.getIndices(market).catch(() => [])).filter((i) => i.provenance.status.kind === 'close');
    if (indices.length) await db.from('index_values').upsert(indices.map((i) => ({ index_code: i.code, market, name: i.name, session_date: i.provenance.asOf.slice(0, 10), value: i.value, change_pct: i.changePct, source: i.provenance.source })), { onConflict: 'index_code,session_date' });
  }
  if (anomalies.length) await db.from('data_anomalies').insert(anomalies.map((a) => ({ asset_id: a.assetId, kind: a.kind, severity: a.severity, message: a.message, details: a.details ?? null, run_id: run!.id })));
  if (blocked.size) await alertAdmin(`${blocked.size} cours bloqués sur ${market} (contrôle d'anomalies)`, anomalies.filter((a) => a.severity === 'block'));
  await db.from('ingestion_runs').update({ status: blocked.size || todayPending ? 'partial' : 'ok', error: todayPending ? `bulletin du ${today} non publié, séance du ${sessionDate} utilisée` : null, source_used: source, attempts, rows_written: ok.length, finished_at: new Date().toISOString() }).eq('id', run!.id);
  if (todayPending && pastAlertCutoff(market)) await alertAdmin(`${market} : bulletin du ${today} toujours absent`, { lastSession: sessionDate });
  return { market, source, session: sessionDate, written: ok.length, blocked: blocked.size, todayPending };
}

/** Rebuilds daily history from past official bulletins (one download per business day, polite delay). */
async function backfill(market: MarketCode, from: string, to: string) {
  const db = admin();
  const { data: run } = await db.from('ingestion_runs').insert({ job: 'backfill', market }).select('id').single();
  let sessions = 0, rows = 0;
  for (const d of businessDays(from, to)) {
    const s = await bulletin.getSession(market, d).catch((e) => { console.warn(market, d, e.message); return null; });
    if (!s) continue; // holiday or missing bulletin: nothing is invented
    const quotes = bulletin.toQuotes(s).filter((q) => validateQuote(q, market, { today: d }).every((a) => a.severity !== 'block'));
    const known = new Set(((await db.from('assets').select('id').eq('market', market)).data ?? []).map((a) => a.id));
    const newAssets = s.rows.filter((r) => !known.has(`${market}:${r.ticker}`)).map((r) => ({ id: `${market}:${r.ticker}`, market, ticker: r.ticker, name: r.name ?? r.ticker, currency: MARKETS[market as 'BRVM'].currency }));
    if (newAssets.length) await db.from('assets').upsert(newAssets, { onConflict: 'id' });
    await db.from('price_bars').upsert(s.rows.filter((r) => quotes.some((q) => q.assetId === `${market}:${r.ticker}`)).map((r) => ({
      asset_id: `${market}:${r.ticker}`, session_date: d, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0, value: r.value,
      source: bulletin.id, verified: true,
    })), { onConflict: 'asset_id,session_date' });
    sessions++; rows += quotes.length;
    await new Promise((r) => setTimeout(r, 1500));
  }
  await db.from('ingestion_runs').update({ status: 'ok', source_used: bulletin.id, rows_written: rows, finished_at: new Date().toISOString() }).eq('id', run!.id);
  return { market, sessions, rows };
}

async function alertAdmin(subject: string, details: unknown) {
  const hook = Deno.env.get('ADMIN_ALERT_WEBHOOK'); // Slack/Discord/email relay
  console.warn(subject, JSON.stringify(details).slice(0, 2000));
  if (hook) await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `[Chart-BoursafrikIA] ${subject}` }) }).catch(() => {});
}

Deno.serve(handler(async (req) => {
  requireService(req);
  const body = await req.json().catch(() => ({}));
  const { job = 'eod', markets = MVP_MARKETS } = body;
  if (job === 'backfill') {
    if (!body.market || !body.from || !body.to) return json({ error: 'market, from, to requis' }, 400);
    return json(await backfill(body.market, body.from, body.to));
  }
  // Calendar (general meetings, dividends) + capital operations from a BRVM bulletin: {"job":"events","date":"YYYY-MM-DD"} (default: latest).
  if (job === 'events') {
    const s = body.date ? await bulletin.getSession('BRVM', body.date) : await bulletin.latestSession('BRVM');
    if (!s?.text) return json({ error: 'bulletin introuvable' }, 404);
    const debug = body.debug ? s.text.split('\n').filter((l: string) => /cotation le|AMF-UMOA/.test(l)).slice(0, 20) : undefined;
    return json({ date: s.date, url: s.url, ...(await saveBrvmEvents(admin(), s.text, s.url)), debug });
  }
  const results = [];
  // force: manual run outside the post-close window (admin / first run).
  for (const m of markets as MarketCode[]) results.push(await ingest(m, job, body.force === true).catch((e) => ({ market: m, error: (e as Error).message })));
  // FX once per EOD run
  if (job === 'eod' && mansa.isEnabled()) {
    const fx = await mansa.getForex().catch(() => []);
    if (fx.length) await admin().from('fx_rates').upsert(fx.map((r) => ({ quote: r.quote, as_of: r.provenance.asOf.slice(0, 10), rate: r.rate, source: r.provenance.source })), { onConflict: 'quote,as_of' });
  }
  // Daily: refresh the BRVM calendar / dividends / operations from the latest bulletin (failures don't block prices).
  let events: unknown = null;
  if (job === 'eod' && (markets as string[]).includes('BRVM')) {
    events = await bulletin.latestSession('BRVM').then((s) => (s.text ? saveBrvmEvents(admin(), s.text, s.url) : null)).catch((e) => ({ error: (e as Error).message }));
  }
  return json({ results, events });
}));

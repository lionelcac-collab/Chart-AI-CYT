// Job (pg_cron): end-of-day / delayed ingestion per market, timezone-aware.
// 1) primary connector (Mansa) → fallback  2) validation  3) cross-check with the
// official bulletin when available  4) upsert  5) anomalies + admin alert.
import { extractText, getDocumentProxy } from 'npm:unpdf@1.4.0';
import { admin, handler, json, requireService } from '../_shared/runtime.ts';
import { MARKETS, MVP_MARKETS, isIngestionWindow, localClock, type MarketCode, type Quote } from '../_shared/core/index.ts';
import { ConnectorRegistry, MansaConnector, NgxOfficialConnector, LicensedRealtimeConnector, PROFILES, crossCheck, parseBulletinText, validateQuote, type Anomaly } from '../_shared/data/index.ts';

const mansa = new MansaConnector({
  apiKey: Deno.env.get('MANSA_API_KEY') ?? undefined,
  baseUrl: Deno.env.get('MANSA_BASE_URL') ?? undefined,
  authHeader: Deno.env.get('MANSA_AUTH_HEADER') ?? undefined,
  requestsPerMinute: Number(Deno.env.get('MANSA_RPM') ?? 30),
  delayMinutes: Number(Deno.env.get('MANSA_DELAY_MIN') ?? 0),
});
const registry = new ConnectorRegistry({
  BRVM: [new LicensedRealtimeConnector(), mansa],
  BVMAC: [mansa],
  NGX: [new NgxOfficialConnector(), mansa],
});

/** Downloads and parses the official bulletin. URL template from env, e.g. BULLETIN_URL_BRVM=https://…/boc_{YYYYMMDD}.pdf */
async function bulletinCloses(market: MarketCode, date: string): Promise<{ assetId: string; close: number; row: unknown }[] | null> {
  const tpl = Deno.env.get(`BULLETIN_URL_${market}`);
  const profile = PROFILES[market as 'BRVM'];
  if (!tpl || !profile) return null;
  const url = tpl.replace('{YYYYMMDD}', date.replaceAll('-', '')).replace('{YYYY-MM-DD}', date);
  const res = await fetch(url);
  if (!res.ok) return null;
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: true });
  return parseBulletinText(text as string, profile).map((r) => ({ assetId: `${market}:${r.ticker}`, close: r.close, row: r }));
}

async function ingest(market: MarketCode, job: 'eod' | 'delayed') {
  const db = admin();
  const info = MARKETS[market as 'BRVM'];
  const today = localClock(info.timezone).date;
  if (job === 'eod') {
    if (!isIngestionWindow(info)) return { market, skipped: 'hors fenêtre' };
    const { data: done } = await db.from('ingestion_runs').select('id').eq('job', 'eod').eq('market', market).eq('status', 'ok').gte('started_at', `${today}T00:00:00Z`).limit(1);
    if (done?.length) return { market, skipped: 'déjà collecté' };
  }
  const { data: run } = await db.from('ingestion_runs').insert({ job, market }).select('id').single();
  const anomalies: Anomaly[] = [];
  const { value: quotes, source, attempts } = await registry.quotes(market);
  if (!quotes) {
    await db.from('ingestion_runs').update({ status: 'failed', attempts, finished_at: new Date().toISOString(), error: 'aucune source disponible' }).eq('id', run!.id);
    await alertAdmin(`Collecte ${market} échouée : aucune source disponible`, attempts);
    return { market, status: 'failed' };
  }

  for (const q of quotes) anomalies.push(...validateQuote(q, market, { today }));
  let verifiedIds = new Set<string>();
  if (job === 'eod') {
    const ref = await bulletinCloses(market, today).catch(() => null);
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
    const assets = await mansa.listAssets(market).catch(() => []);
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
    const bars = ok.map((q) => ({
      asset_id: q.assetId, session_date: q.provenance.asOf.slice(0, 10), close: q.last, volume: q.volume ?? 0, value: q.value,
      source: q.provenance.source, verified: verifiedIds.has(q.assetId),
    }));
    await db.from('price_bars').upsert(bars, { onConflict: 'asset_id,session_date' });
    const indices = await mansa.getIndices(market).catch(() => []);
    if (indices.length) await db.from('index_values').upsert(indices.map((i) => ({ index_code: i.code, market, name: i.name, session_date: i.provenance.asOf.slice(0, 10), value: i.value, change_pct: i.changePct, source: i.provenance.source })), { onConflict: 'index_code,session_date' });
  }
  if (anomalies.length) await db.from('data_anomalies').insert(anomalies.map((a) => ({ asset_id: a.assetId, kind: a.kind, severity: a.severity, message: a.message, details: a.details ?? null, run_id: run!.id })));
  if (blocked.size) await alertAdmin(`${blocked.size} cours bloqués sur ${market} (contrôle d'anomalies)`, anomalies.filter((a) => a.severity === 'block'));
  await db.from('ingestion_runs').update({ status: blocked.size ? 'partial' : 'ok', source_used: source, attempts, rows_written: ok.length, finished_at: new Date().toISOString() }).eq('id', run!.id);
  return { market, source, written: ok.length, blocked: blocked.size };
}

async function alertAdmin(subject: string, details: unknown) {
  const hook = Deno.env.get('ADMIN_ALERT_WEBHOOK'); // Slack/Discord/email relay
  console.warn(subject, JSON.stringify(details).slice(0, 2000));
  if (hook) await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `[Nyota] ${subject}` }) }).catch(() => {});
}

Deno.serve(handler(async (req) => {
  requireService(req);
  const { job = 'eod', markets = MVP_MARKETS } = await req.json().catch(() => ({}));
  const results = [];
  for (const m of markets as MarketCode[]) results.push(await ingest(m, job).catch((e) => ({ market: m, error: (e as Error).message })));
  // FX once per EOD run
  if (job === 'eod' && mansa.isEnabled()) {
    const fx = await mansa.getForex().catch(() => []);
    if (fx.length) await admin().from('fx_rates').upsert(fx.map((r) => ({ quote: r.quote, as_of: r.provenance.asOf.slice(0, 10), rate: r.rate, source: r.provenance.source })), { onConflict: 'quote,as_of' });
  }
  return json({ results });
}));

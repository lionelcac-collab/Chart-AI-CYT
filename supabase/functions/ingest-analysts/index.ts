// Weekly job: new published broker-consensus reviews → analyst_consensus_snapshots.
//  1. Firecrawl search finds recent broker-recommendation reviews (Nairametrics, NGX).
//  2. Articles not yet stored are read with Firecrawl (markdown).
//  3. Claude Haiku extracts ONLY the figures stated in the article (counts per rating, brokers, targets, reference price).
//  4. Each row is matched to a listed stock and sanity-checked against our latest close before being written.
// Needs the FIRECRAWL_API_KEY secret. Body: {days?: number (default 14), maxArticles?: number (default 4), urls?: string[]}.
import { MODELS, generateJson } from '../_shared/ai.ts';
import { admin, audit, handler, json, requireService } from '../_shared/runtime.ts';

const SOURCE = 'Nairametrics — revue des courtiers';
const FC = 'https://api.firecrawl.dev/v2';
const num = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const int = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const str = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['is_broker_review', 'rows'],
  properties: {
    is_broker_review: { type: 'boolean', description: 'true only if the article reviews several brokers’ stock recommendations with targets.' },
    rows: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['ticker', 'company', 'n_buy', 'n_hold', 'n_sell', 'brokers', 'target_mean', 'target_min', 'target_max', 'reference_price', 'note'],
        properties: {
          ticker: { type: 'string', description: 'NGX ticker chosen from the provided list, or "" if none matches.' },
          company: { type: 'string' },
          n_buy: int, n_hold: int, n_sell: int, brokers: str,
          target_mean: num, target_min: num, target_max: num, reference_price: num,
          note: { ...str, description: 'French, short: individual broker targets or caveats stated in the article (e.g. sell rating with its target).' },
        },
      },
    },
  },
} as const;

async function fc(path: string, body: unknown) {
  const key = Deno.env.get('FIRECRAWL_API_KEY');
  if (!key) throw new Error('FIRECRAWL_API_KEY manquant');
  const r = await fetch(`${FC}${path}`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`firecrawl ${path} ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j as Record<string, any>;
}

Deno.serve(handler(async (req) => {
  requireService(req);
  const db = admin();
  const { days = 14, maxArticles = 4, urls } = (await req.json().catch(() => ({}))) as { days?: number; maxArticles?: number; urls?: string[] };
  const log: Record<string, unknown>[] = [];
  let written = 0;
  const started = new Date().toISOString();
  try {
    // 1. Candidates
    let found: { url: string; title?: string }[] = (urls ?? []).map((url) => ({ url }));
    if (!found.length) {
      const tbs = days <= 7 ? 'qdr:w' : 'qdr:m';
      for (const q of ['site:nairametrics.com stock buy recommendations brokers', 'site:nairametrics.com brokers consensus buy list stocks']) {
        const s = await fc('/search', { query: q, limit: 8, tbs, sources: [{ type: 'web' }] });
        const items = (s.data?.web ?? s.data ?? []) as { url: string; title?: string }[];
        found.push(...items.filter((x) => /nairametrics\.com\/\d{4}\/\d{2}\/\d{2}\//.test(x.url)));
      }
    }
    found = [...new Map(found.map((f) => [f.url.replace(/^http:/, 'https:').replace(/[#?].*$/, ''), f])).entries()].map(([url, f]) => ({ ...f, url }));
    const { data: known } = await db.from('analyst_consensus_snapshots').select('source_url').in('source_url', found.map((f) => f.url));
    const knownSet = new Set((known ?? []).map((k) => k.source_url));
    const todo = found.filter((f) => !knownSet.has(f.url) && /recommend|consensus|broker|buy list|stocks to buy/i.test(`${f.url} ${f.title ?? ''}`)).slice(0, maxArticles);
    log.push({ step: 'search', found: found.length, new: todo.length });

    const { data: assets } = await db.from('assets').select('id, ticker, name').eq('market', 'NGX').eq('is_active', true).eq('asset_class', 'equity');
    const byTicker = new Map((assets ?? []).map((a) => [a.ticker.toUpperCase(), a]));
    const list = (assets ?? []).map((a) => `${a.ticker}=${a.name}`).join('; ');

    for (const art of todo) {
      // 2. Read the article
      const sc = await fc('/scrape', { url: art.url, formats: ['markdown'], onlyMainContent: true });
      const md: string = sc.data?.markdown ?? '';
      const meta = sc.data?.metadata ?? {};
      const published = String(meta.publishedTime ?? meta['article:published_time'] ?? '').slice(0, 10) || (/\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(art.url)?.slice(1).join('-') ?? '');
      if (!md || !/^\d{4}-\d{2}-\d{2}$/.test(published)) { log.push({ url: art.url, result: 'unreadable' }); continue; }
      // 3. Extract stated figures only
      const r = await generateJson<{ is_broker_review: boolean; rows: any[] }>({
        model: MODELS.bulk, schema: SCHEMA as unknown as Record<string, unknown>, maxTokens: 6000, effort: 'low',
        content: [{ type: 'text', text:
          `Extract from this Nigerian financial article the per-stock summary of brokers' recommendations. Use ONLY figures explicitly written in the article; null when not stated (never compute or guess). ` +
          `n_buy counts Buy/Upside ratings; n_hold counts Hold/Neutral; n_sell counts Sell. target_mean/min/max are the brokers' targets as stated (for the positive ratings if the article says so — mention it in note). ` +
          `reference_price is the share price the article uses to compute upside. ticker must be chosen from this list of NGX stocks (ticker=name): ${list}\n\nARTICLE (${art.url}):\n${md.slice(0, 40000)}` }],
      });
      if (!r.data.is_broker_review) { log.push({ url: art.url, result: 'not a broker review' }); continue; }
      // 4. Match + sanity checks
      const { data: closes } = await db.from('market_latest').select('asset_id, close').in('asset_id', r.data.rows.map((x) => `NGX:${String(x.ticker).toUpperCase()}`));
      const close = new Map((closes ?? []).map((c) => [c.asset_id, Number(c.close)]));
      const rows = [];
      const rejected: string[] = [];
      for (const x of r.data.rows) {
        const a = byTicker.get(String(x.ticker ?? '').toUpperCase());
        if (!a) { rejected.push(`${x.company}: titre non trouvé`); continue; }
        const n = (x.n_buy ?? 0) + (x.n_hold ?? 0) + (x.n_sell ?? 0);
        if (!n && x.target_mean == null) { rejected.push(`${a.ticker}: aucun chiffre`); continue; }
        const px = close.get(a.id);
        const ref = x.reference_price ?? x.target_mean;
        // A reference price/target far from our latest close usually means a wrong stock match: reject.
        if (px && ref && (ref / px > 4 || ref / px < 0.25)) { rejected.push(`${a.ticker}: incohérent avec le cours (${ref} vs ${px})`); continue; }
        rows.push({ asset_id: a.id, published_at: published, source_name: SOURCE, source_url: art.url, brokers: x.brokers, n_buy: x.n_buy, n_hold: x.n_hold, n_sell: x.n_sell,
          target_mean: x.target_mean, target_min: x.target_min, target_max: x.target_max, reference_price: x.reference_price, note: x.note });
      }
      if (rows.length) {
        const { error } = await db.from('analyst_consensus_snapshots').upsert(rows, { onConflict: 'asset_id,source_name,published_at' });
        if (error) throw error;
        written += rows.length;
      }
      await audit('system:analysts', 'ingest_consensus', 'analyst_consensus_snapshots', art.url, { model: MODELS.bulk, rows: rows.length, rejected });
      log.push({ url: art.url, published, rows: rows.length, rejected });
    }
    await db.from('ingestion_runs').insert({ job: 'ingest_analysts', status: 'ok', rows_written: written, attempts: log, started_at: started, finished_at: new Date().toISOString(), source_used: 'firecrawl+claude' });
  } catch (e) {
    log.push({ error: String((e as Error).message ?? e).slice(0, 300) });
    await db.from('ingestion_runs').insert({ job: 'ingest_analysts', status: 'failed', rows_written: written, attempts: log, started_at: started, finished_at: new Date().toISOString(), source_used: 'firecrawl+claude' });
  }
  return json({ written, log });
}));

// Exports a compact snapshot of the Chart-BoursafrikIA database (latest closes, indices, 3 years of split-adjusted
// daily history) for the offline web demo. Uses the Supabase Management API (SQL), token injected by
// the session proxy or SUPABASE_ACCESS_TOKEN.
//   npx tsx scripts/export-db-snapshot.mts --ref <project-ref> --out snapshot-db.json [--years 3]
import { writeFileSync } from 'node:fs';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1]! : d; };
const REF = arg('ref', '');
const OUT = arg('out', 'snapshot-db.json');
const YEARS = Number(arg('years', '3'));
if (!REF) throw new Error('--ref required');

async function sql<T>(query: string): Promise<T[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.SUPABASE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers, body: JSON.stringify({ query }) });
  if (!res.ok) throw new Error(`SQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T[]>;
}

const latest = await sql<Record<string, unknown>>(`select * from market_latest order by market, ticker`);
const indices = await sql<Record<string, unknown>>(`select distinct on (index_code) index_code, name, market, value, change_pct, session_date, source from index_values order by index_code, session_date desc`);
// Compact history: one row per asset, dates as day offsets from a base date, adjusted closes, volumes (null = unknown).
const base = '2015-01-01';
const hist = await sql<{ asset_id: string; d: number[]; c: number[]; v: (number | null)[] }>(`
  select asset_id,
    array_agg((session_date - date '${base}') order by session_date) d,
    array_agg(round((close * adjusted_factor)::numeric, 4) order by session_date) c,
    array_agg(volume order by session_date) v
  from price_bars where session_date >= current_date - interval '${YEARS} years'
  group by asset_id`);
const out = {
  kind: 'db',
  fetchedAt: new Date().toISOString(),
  source: 'Base Chart-BoursafrikIA (bulletins officiels BRVM/BVMAC/NGX + Mansa Markets)',
  sourceUrl: 'https://mansamarkets.com',
  plan: 'snapshot',
  base,
  latest,
  indices,
  history: Object.fromEntries(hist.map((h) => [h.asset_id, { d: h.d, c: h.c.map(Number), v: h.v.map((x) => (x == null ? null : Number(x))) }])),
  markets: {}, fx: [],
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`snapshot: ${latest.length} assets, ${indices.length} indices, ${hist.reduce((s, h) => s + h.d.length, 0)} bars → ${OUT} (${(JSON.stringify(out).length / 1e6).toFixed(1)} MB)`);

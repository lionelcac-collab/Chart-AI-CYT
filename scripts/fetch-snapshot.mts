// Fetches a real-data snapshot from the Mansa API (current quotes, indices, FX) for the web demo.
// Usage: MANSA_API_KEY=... NODE_USE_ENV_PROXY=1 npx tsx scripts/fetch-snapshot.mts <out.json>
// The key is never written to the output. ~5 API calls.
import { writeFileSync } from 'node:fs';
import { MVP_MARKETS } from '../packages/core/src/index.ts';
import { MansaConnector } from '../packages/data/src/index.ts';

const key = process.env.MANSA_API_KEY;
if (!key) throw new Error('MANSA_API_KEY missing');
const c = new MansaConnector({ apiKey: key });

const markets: Record<string, unknown> = {};
for (const m of MVP_MARKETS) {
  const quotes = await c.getQuotes(m);
  const assets = await c.listAssets(m); // same endpoint: served from the connector cache
  const names = Object.fromEntries(assets.map((a) => [a.id, a.name]));
  markets[m] = { quotes: quotes.map((q) => ({ ...q, name: names[q.assetId] ?? q.assetId.split(':')[1] })) };
}
const indices = await c.getIndices();
const fx = await c.getForex();
const out = { fetchedAt: new Date().toISOString(), source: 'Mansa Markets', sourceUrl: 'https://mansamarkets.com', plan: 'free', markets, indices: indices.filter((i) => (MVP_MARKETS as readonly string[]).includes(i.market)), fx };
writeFileSync(process.argv[2] ?? 'snapshot.json', JSON.stringify(out));
console.log(`snapshot: ${Object.entries(markets).map(([m, v]) => `${m}=${(v as { quotes: unknown[] }).quotes.length}`).join(' ')} indices=${out.indices.length} fx=${fx.length}`);

// Live check against the real Mansa API. Skipped unless MANSA_API_KEY is set:
//   MANSA_API_KEY=... npx vitest run test/mansa.live.test.ts
import { describe, expect, it } from 'vitest';
import { MansaConnector, validateQuote } from '../src';

const key = process.env.MANSA_API_KEY;
describe.skipIf(!key)('Mansa live API', () => {
  const c = new MansaConnector({ apiKey: key });
  for (const m of ['BRVM', 'BVMAC', 'NGX'] as const) {
    it(`${m}: quotes are usable`, async () => {
      const q = await c.getQuotes(m);
      expect(q.length).toBeGreaterThan(0);
      const blocked = q.flatMap((x) => validateQuote(x, m)).filter((a) => a.severity === 'block');
      const noPct = q.filter((x) => x.changePct === null).map((x) => x.assetId);
      console.log(`${m}: ${q.length} stocks, status=${JSON.stringify(q[0]!.provenance.status)}, traded=${q.filter((x) => (x.volume ?? 0) > 0).length}, blocked=${blocked.length}, variation hidden=${noPct.join(',') || 'none'}`);
    }, 30_000);
  }
  it('indices', async () => {
    const idx = await c.getIndices();
    console.log(idx.filter((i) => ['BRVM', 'BVMAC', 'NGX'].includes(i.market)).map((i) => `${i.market} ${i.code} ${i.value}`).join(' | '));
  }, 30_000);
});

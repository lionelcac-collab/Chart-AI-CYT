// Response shapes captured from the live Mansa API on 2026-11-19 (values trimmed).
import { describe, expect, it } from 'vitest';
import { MansaConnector, type FetchLike } from '../src';

const live = {
  bvmac: { success: true, data: [
    { ticker: 'BGFIHC', name: 'BGFI HC', price: 82500, change: -5900, change_pct: 0, volume: 0, scraped_at: '2026-11-19T09:00:45.258+00:00', currency: 'XAF' },
    { ticker: 'SOCAPALM', name: 'SOCAPALM', price: 49000, change: 0, change_pct: 0, volume: 2, scraped_at: '2026-11-19T09:00:45.258+00:00', currency: 'XAF' },
  ], meta: { exchange: 'BVMAC', currency: 'XAF', data_freshness: '30_minutes', source: 'mansa_api' }, pagination: { total: 2, has_more: false } },
  brvm: { success: true, data: [
    { ticker: 'SNTS', name: 'Sonatel Senegal', price: 4110, change: -35, change_pct: -0.8444, volume: 61469, scraped_at: '2026-11-19T16:30:00+00:00', currency: 'XOF' },
  ] },
  indices: { success: true, data: [
    { market_id: 'ivory-coast', index_name: 'BRVM-CI Index', index_value: 502.68, index_change: -10.17, index_change_pct: -1.983, scraped_at: '2026-11-19T16:30:00+00:00' },
    { market_id: 'nigeria', index_name: 'NGX All-Share Index (ASI)', index_value: 248329.65, index_change: null, index_change_pct: -0.4, scraped_at: '2026-11-19T08:58:28+00:00' },
  ] },
  forex: { success: true, data: [
    { pair: 'USD/EUR', base: 'USD', quote: 'EUR', rate: 0.911253, as_of: '2026-11-19T00:02:31+00:00', source: 'open.er-api.com' },
  ] },
};
const f = (async (url: string) => {
  const body = url.includes('/bvmac/stocks') ? live.bvmac : url.includes('/ivory-coast/stocks') ? live.brvm : url.includes('/indices') ? live.indices : url.includes('/forex') ? live.forex : null;
  return { ok: !!body, status: body ? 200 : 404, json: async () => body, text: async () => '' };
}) as FetchLike;

describe('Mansa connector on live response shapes', () => {
  const c = new MansaConnector({ apiKey: 'k', fetch: f });

  it('BVMAC: contradictory change/change_pct is not displayed; before the open = previous session close', async () => {
    const q = await c.getQuotes('BVMAC');
    const bgfi = q.find((x) => x.assetId === 'BVMAC:BGFIHC')!;
    expect(bgfi).toMatchObject({ last: 82500, change: null, changePct: null, previousClose: null });
    // 09:00 UTC = 10:00 Douala, the BVMAC session opens at 09:00 local ⇒ delayed intraday
    expect(bgfi.provenance.status.kind).toBe('delayed');
    expect(q.find((x) => x.assetId === 'BVMAC:SOCAPALM')).toMatchObject({ changePct: 0, previousClose: 49000 });
  });

  it('BRVM: after the close the snapshot is that session close; previous close derived from change', async () => {
    const [s] = await c.getQuotes('BRVM');
    expect(s).toMatchObject({ assetId: 'BRVM:SNTS', last: 4110, previousClose: 4145, changePct: -0.8444 });
    expect(s!.provenance.status).toEqual({ kind: 'close', sessionDate: '2026-11-19' });
  });

  it('before the open the snapshot is attributed to the previous business day', () => {
    // Monday 08:00 in Lagos (07:00 UTC) ⇒ Friday's close
    expect(c.sessionStatus('NGX', '2026-11-16T07:00:00Z').status).toEqual({ kind: 'close', sessionDate: '2026-11-13' });
  });

  it('undefined options (unset env vars) keep the defaults', async () => {
    const calls: Record<string, string>[] = [];
    const f2 = (async (url: string, init?: { headers?: Record<string, string> }) => { calls.push(init!.headers!); return { ok: true, status: 200, json: async () => live.brvm, text: async () => '' }; }) as FetchLike;
    const c2 = new MansaConnector({ apiKey: 'k', baseUrl: undefined, authHeader: undefined, delayMinutes: Number(undefined), fetch: f2 });
    expect(await c2.getQuotes('BRVM')).toHaveLength(1);
    expect(calls[0]!['X-API-Key']).toBe('k');
  });

  it('indices and forex use Mansa field names', async () => {
    const idx = await c.getIndices('BRVM');
    expect(idx).toEqual([expect.objectContaining({ code: 'BRVM-CI Index', market: 'BRVM', value: 502.68, changePct: -1.983 })]);
    expect((await c.getIndices()).map((i) => i.market).sort()).toEqual(['BRVM', 'NGX']);
    const fx = await c.getForex();
    expect(fx[0]).toMatchObject({ quote: 'EUR', rate: 0.911253 });
    expect(fx[0]!.provenance.source).toBe('mansa:open.er-api.com');
  });
});

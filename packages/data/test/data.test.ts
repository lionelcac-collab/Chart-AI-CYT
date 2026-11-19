import { describe, expect, it } from 'vitest';
import {
  ConnectorRegistry, MansaConnector, NgxOfficialConnector, PROFILES, crossCheck, parseBulletinText, parseFeed,
  parseNumber, rows, validateQuote, type FetchLike,
} from '../src';

const mockFetch = (routes: Record<string, unknown>, status = 200): FetchLike & { calls: { url: string; headers?: Record<string, string> }[] } => {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const f = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers });
    const key = Object.keys(routes).find((k) => url.includes(k));
    return { ok: status < 400 && !!key, status: key ? status : 404, json: async () => (key ? routes[key] : {}), text: async () => '' };
  }) as FetchLike & { calls: typeof calls };
  f.calls = calls;
  return f;
};

describe('mansa connector', () => {
  it('is disabled without key and maps tolerant field names, never inventing prices', async () => {
    expect(new MansaConnector({}).isEnabled()).toBe(false);
    const f = mockFetch({ '/api/v1/markets/exchanges/ivory-coast/stocks': { data: [
      { symbol: 'SNTS', name: 'Sonatel', price: '25 500', previous_close: 25000, volume: 1200, scraped_at: '2026-11-18T18:00:00Z' },
      { symbol: 'XXXX', name: 'No price' },
    ] } });
    const c = new MansaConnector({ apiKey: 'k', fetch: f });
    const q = await c.getQuotes('BRVM');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ assetId: 'BRVM:SNTS', last: 25500, previousClose: 25000, changePct: 2 });
    expect(q[0]!.provenance).toMatchObject({ source: 'mansa', status: { kind: 'close', sessionDate: '2026-11-18' } });
    expect(f.calls[0]!.url).toContain('https://mansaapi.com/api/v1/markets/exchanges/ivory-coast/stocks');
    expect(f.calls[0]!.headers!['X-API-Key']).toBe('k');
    await c.getQuotes('BRVM'); // cached
    expect(f.calls).toHaveLength(1);
  });
  it('rows() unwraps common envelopes', () => {
    expect(rows({ data: { stocks: [{ a: 1 }] } })).toHaveLength(1);
    expect(rows([{ a: 1 }, { a: 2 }])).toHaveLength(2);
  });
});

describe('registry fallback', () => {
  it('falls back and records attempts; disabled placeholders are skipped', async () => {
    const bad = new MansaConnector({ apiKey: 'k', fetch: mockFetch({}, 500) });
    const good = new MansaConnector({ apiKey: 'k2', fetch: mockFetch({ '/api/v1/markets/exchanges/nigeria/stocks': [{ ticker: 'DANGCEM', close: 500 }] }) });
    (good as unknown as { id: string }).id = 'mansa_backup';
    const reg = new ConnectorRegistry({ NGX: [new NgxOfficialConnector(), bad, good] });
    const r = await reg.quotes('NGX');
    expect(r.source).toBe('mansa_backup');
    expect(r.attempts.map((a) => a.ok)).toEqual([false, true]);
  });
});

describe('validation', () => {
  const prov = { source: 'mansa', fetchedAt: '', asOf: '2026-11-18', status: { kind: 'close' as const, sessionDate: '2026-11-18' } };
  it('blocks moves beyond the BRVM ±7.5 % limit', () => {
    const a = validateQuote({ assetId: 'BRVM:X', last: 109, previousClose: 100, change: 9, changePct: 9, volume: 1, value: 1, marketCap: null, provenance: prov }, 'BRVM', { today: '2026-11-18' });
    expect(a.map((x) => x.kind)).toContain('price_jump');
    const ok = validateQuote({ assetId: 'BRVM:X', last: 107, previousClose: 100, change: 7, changePct: 7, volume: 1, value: 1, marketCap: null, provenance: prov }, 'BRVM', { today: '2026-11-18' });
    expect(ok).toHaveLength(0);
  });
  it('cross-checks against the bulletin', () => {
    const q = [{ assetId: 'BRVM:X', last: 101, previousClose: null, change: null, changePct: null, volume: null, value: null, marketCap: null, provenance: prov }];
    expect(crossCheck(q, [{ assetId: 'BRVM:X', close: 100 }])).toHaveLength(1);
    expect(crossCheck(q, [{ assetId: 'BRVM:X', close: 100.8 }])).toHaveLength(0);
  });
});

describe('bulletin parser', () => {
  it('parses French-formatted rows', () => {
    expect(parseNumber('12 500,50'.replace(' ', ''), true)).toBe(12500.5);
    const text = [
      'Bulletin Officiel de la Cote',
      'SNTS SONATEL SENEGAL 25 000 25 100 25 600 24 900 25 500 2,00% 1 234 31 467 000',
      'ORAC ORANGE COTE D\'IVOIRE 14 000 - - - 14 000 0,00% 0 0',
      'Total 123',
    ].join('\n');
    const r = parseBulletinText(text, PROFILES.BRVM);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ ticker: 'SNTS', name: 'SONATEL SENEGAL', previousClose: 25000, high: 25600, low: 24900, close: 25500, changePct: 2, volume: 1234, value: 31467000 });
    expect(r[1]).toMatchObject({ ticker: 'ORAC', open: null, close: 14000, volume: 0 });
  });
});

describe('rss', () => {
  it('parses RSS items', () => {
    const xml = `<rss><channel><item><title><![CDATA[Résultats S1 &amp; dividende]]></title><link>https://x.org/a</link><pubDate>Tue, 18 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Texte&lt;/p&gt;</description></item></channel></rss>`;
    const n = parseFeed(xml, 'brvm');
    expect(n[0]).toMatchObject({ title: 'Résultats S1 & dividende', url: 'https://x.org/a', publishedAt: '2026-11-18T10:00:00.000Z', excerpt: 'Texte' });
  });
});

import { describe, expect, it } from 'vitest';
import { BulletinConnector, ConnectorRegistry, MansaConnector, businessDays, type FetchLike } from '../src';

// BVMAC-style rows: TICKER NAME PREV CLOSE VAR% VOLUME VALUE (profile BVMAC)
const BULLETIN = (close: string) => [
  'BOURSE DES VALEURS MOBILIERES DE L\'AFRIQUE CENTRALE — Bulletin officiel de la cote',
  `SEMC SOCIETE DES EAUX MINERALES DU CAMEROUN 52 000 ${close} 0,00% 0 0`,
  'SAFACAM SAFACAM 32 000 32 500 1,56% 120 3 900 000',
  'Total général',
].join('\n');

function site(published: Record<string, string>, opts: { index?: boolean } = {}): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const f = (async (url: string) => {
    urls.push(url);
    if (opts.index && url === 'https://bourse.example/bulletins/') {
      const links = Object.keys(published).map((d) => `<a href="/wp-content/uploads/BOC_${d.replaceAll('-', '')}.pdf">BOC ${d}</a>`).join('');
      return { ok: true, status: 200, json: async () => ({}), text: async () => `<html>${links}<a href="/autre.pdf">x</a></html>` };
    }
    const m = url.match(/BOC_(\d{4})(\d{2})(\d{2})\.pdf$/);
    const date = m ? `${m[1]}-${m[2]}-${m[3]}` : '';
    const body = published[date];
    return { ok: !!body, status: body ? 200 : 404, json: async () => ({}), text: async () => '', arrayBuffer: async () => new TextEncoder().encode(body ?? '').buffer as ArrayBuffer };
  }) as FetchLike & { urls: string[] };
  f.urls = urls;
  return f;
}
const extractText = async (b: Uint8Array) => new TextDecoder().decode(b);

describe('BulletinConnector (BVMAC primary source)', () => {
  it('businessDays skips weekends', () => {
    expect(businessDays('2026-11-13', '2026-11-17')).toEqual(['2026-11-13', '2026-11-16', '2026-11-17']);
  });

  it('reads the latest published bulletin via a URL template, falling back to previous sessions', async () => {
    const f = site({ '2026-11-17': BULLETIN('52 000') }); // 18th not yet published
    const c = new BulletinConnector({ sources: { BVMAC: { urlTemplate: 'https://bourse.example/BOC_{YYYYMMDD}.pdf' } }, extractText, fetch: f });
    expect(c.isEnabled()).toBe(true);
    const s = await c.latestSession('BVMAC', '2026-11-18');
    expect(s.date).toBe('2026-11-17');
    const q = c.toQuotes(s);
    expect(q).toHaveLength(2);
    expect(q[1]).toMatchObject({ assetId: 'BVMAC:SAFACAM', last: 32500, previousClose: 32000, changePct: 1.56, volume: 120, value: 3900000 });
    expect(q[1]!.provenance).toMatchObject({ source: 'official_bulletin', status: { kind: 'close', sessionDate: '2026-11-17' } });
    expect(q[0]!.volume).toBe(0); // untraded stock keeps its reference price, flagged by zero volume
  });

  it('finds the bulletin link on an index page', async () => {
    const f = site({ '2026-11-18': BULLETIN('52 500') }, { index: true });
    const c = new BulletinConnector({ sources: { BVMAC: { indexUrl: 'https://bourse.example/bulletins/', linkPattern: 'BOC_{YYYYMMDD}\\.pdf' } }, extractText, fetch: f });
    const s = await c.getSession('BVMAC', '2026-11-18');
    expect(s!.url).toBe('https://bourse.example/wp-content/uploads/BOC_20261118.pdf');
    expect(s!.rows[0]!.close).toBe(52500);
    expect(await c.getSession('BVMAC', '2026-11-19')).toBeNull();
  });

  it('rebuilds history from past bulletins and never invents missing sessions', async () => {
    const f = site({ '2026-11-16': BULLETIN('51 000'), '2026-11-18': BULLETIN('52 500') });
    const c = new BulletinConnector({ sources: { BVMAC: { urlTemplate: 'https://bourse.example/BOC_{YYYYMMDD}.pdf' } }, extractText, fetch: f });
    const bars = await c.getHistory('BVMAC', 'SEMC', '2026-11-16', '2026-11-18');
    expect(bars.map((b) => [b.date, b.close])).toEqual([['2026-11-16', 51000], ['2026-11-18', 52500]]);
  });

  it('is disabled without configuration and the registry then falls back to Mansa', async () => {
    const bulletin = new BulletinConnector({ sources: { BVMAC: {} }, extractText });
    expect(bulletin.isEnabled()).toBe(false);
    const mansaFetch = (async () => ({ ok: true, status: 200, json: async () => [{ ticker: 'SEMC', close: 52000 }], text: async () => '' })) as FetchLike;
    const reg = new ConnectorRegistry({ BVMAC: [bulletin, new MansaConnector({ apiKey: 'k', fetch: mansaFetch })] });
    expect((await reg.quotes('BVMAC')).source).toBe('mansa');
  });

  it('a garbled bulletin is an error, not an empty market', async () => {
    const f = site({ '2026-11-18': 'texte illisible' });
    const c = new BulletinConnector({ sources: { BVMAC: { urlTemplate: 'https://bourse.example/BOC_{YYYYMMDD}.pdf' } }, extractText, fetch: f });
    await expect(c.getSession('BVMAC', '2026-11-18')).rejects.toThrow(/aucune ligne/);
  });
});

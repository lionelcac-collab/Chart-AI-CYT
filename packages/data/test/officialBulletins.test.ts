// Fixtures are short excerpts of real official bulletins (BRVM 18/11/2022 and 17/11/2026,
// BVMAC 18/11/2026, NGX 18/11/2026), extracted with pdftotext -layout.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bvmacBocUrlFromIndex, brvmBocUrls, frNum, ngxDailyListUrl, parseBrvmBoc, parseBvmacBoc, parseNgxDailyList } from '../src';

const fx = JSON.parse(readFileSync(new URL('./fixtures-bulletins.json', import.meta.url), 'utf8')) as Record<string, string>;

describe('official bulletins', () => {
  it('frNum reads French numbers', () => {
    expect(frNum('253 957 060')).toBe(253957060);
    expect(frNum('-0,84 %')).toBe(-0.84);
    expect(frNum('SP')).toBeNull();
  });

  it('BRVM 2026 layout: Sonatel 17/11/2026; suspended stocks are skipped', () => {
    const r = parseBrvmBoc(fx.brvm26!);
    expect(r.find((x) => x.ticker === 'SNTS')).toEqual({ ticker: 'SNTS', name: 'SONATEL SN', previousClose: 4145, open: 4195, close: 4110, changePct: -0.84, volume: 61469, value: 253957060 });
    expect(r.find((x) => x.ticker === 'BBGC')!.close).toBe(9000);
    expect(r.find((x) => x.ticker === 'SICC')).toBeUndefined(); // SP = suspended
    expect(r.some((x) => x.ticker === 'TOTAL')).toBe(false);
  });

  it('BRVM 2022 layout (no sector column)', () => {
    expect(parseBrvmBoc(fx.brvm22!)[0]).toMatchObject({ ticker: 'SNTS', close: 14495, volume: 9223 });
  });

  it('BVMAC: rows anchored on ISIN, canonical tickers, spaced short names', () => {
    const r = parseBvmacBoc(fx.bvmac!);
    expect(r.find((x) => x.ticker === 'SOCAPALM')).toMatchObject({ isin: 'CM0000010025', previousClose: 48999, close: 49000, volume: 2, value: 98000 });
    expect(r.find((x) => x.ticker === 'BANGE')).toMatchObject({ close: 228085, volume: 0 });
  });

  it('NGX: close from the Current Market Price column, also when the symbol touches the name', () => {
    const r = parseNgxDailyList(fx.ngx!);
    expect(r.find((x) => x.ticker === 'OKOMUOIL')!.close).toBe(1137.1);
    expect(r.find((x) => x.ticker === 'PRESCO')!.close).toBe(1656.8);
    expect(parseNgxDailyList(fx.ngxAcc!).find((x) => x.ticker === 'ACCESSCORP')!.close).toBe(27.2);
  });

  it('URLs', () => {
    expect(brvmBocUrls('2026-11-17')[0]).toBe('https://www.brvm.org/sites/default/files/boc_20261117_2.pdf');
    expect(ngxDailyListUrl('2024-11-08')).toContain('Equities%20for%2008-11-2024.pdf');
    const html = '<a href="https://www.bvm-ac.org/wp-content/uploads/2026/11/BOC-20261118.pdf">x</a><a href="https://https://www.bvm-ac.org/wp-content/uploads/2020/08/BOC-BVMAC-07-08-2020.pdf">y</a>';
    expect(bvmacBocUrlFromIndex(html, '2026-11-18')).toContain('BOC-20261118.pdf');
    expect(bvmacBocUrlFromIndex(html, '2020-08-07')).toBe('https://www.bvm-ac.org/wp-content/uploads/2020/08/BOC-BVMAC-07-08-2020.pdf');
    expect(bvmacBocUrlFromIndex(html, '2020-08-08')).toBeNull();
    const html2 = '<a href="https://www.bvm-ac.org/wp-content/uploads/2023/01/BOC-automatise-20230111-vf.pdf">z</a>';
    expect(bvmacBocUrlFromIndex(html2, '2023-01-11')).toContain('BOC-automatise-20230111-vf.pdf');
    expect(bvmacBocUrlFromIndex(html2, '2023-01-12')).toBeNull();
  });
});

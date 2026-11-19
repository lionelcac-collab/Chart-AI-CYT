import { describe, expect, it } from 'vitest';
import { periodSlice, scanAsset, scanMarket, scanView, type Bar } from '../src';

const mk = (closes: number[], start = '2026-01-05'): Bar[] => {
  const out: Bar[] = []; const d = new Date(`${start}T00:00:00Z`); let i = 0;
  while (out.length < closes.length) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) { const c = closes[i++]!; out.push({ date: d.toISOString().slice(0, 10), open: c, high: c, low: c, close: c, volume: 100 }); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

describe('market scan', () => {
  it('1D return uses the previous session; period slices end at the last session', () => {
    const bars = mk([100, 100, 110]);
    expect(scanAsset({ assetId: 'X', ticker: 'X', name: 'X', bars }, '1D')!.returnPct).toBeCloseTo(10, 9);
    expect(periodSlice(bars, '1D')).toHaveLength(2);
  });

  it('price just above the period low ⇒ near support; resistance = nearest level above', () => {
    // range 100–120 for 40 sessions, then back down to 101
    const closes = Array.from({ length: 40 }, (_, i) => 110 + 10 * Math.sin(i / 3));
    const bars = mk([...closes, 101]);
    const r = scanAsset({ assetId: 'X', ticker: 'X', name: 'X', bars }, '1M')!;
    expect(r.support).not.toBeNull();
    expect(r.support!).toBeLessThan(101);
    expect(r.supportDistPct!).toBeLessThan(3);
    expect(r.resistance!).toBeGreaterThan(101);
  });

  it('at a new high there is no resistance in the window', () => {
    const bars = mk(Array.from({ length: 30 }, (_, i) => 100 + i));
    const r = scanAsset({ assetId: 'X', ticker: 'X', name: 'X', bars }, '1M')!;
    expect(r.resistance).toBeNull();
    expect(r.resistanceDistPct).toBeNull();
  });

  it('scanView sorts gainers/losers and filters by the near threshold', () => {
    const rows = scanMarket([
      { assetId: 'A', ticker: 'A', name: 'A', bars: mk([100, 120]) },
      { assetId: 'B', ticker: 'B', name: 'B', bars: mk([100, 90]) },
      { assetId: 'C', ticker: 'C', name: 'C', bars: mk([100, 105]) },
    ], '1D');
    const v = scanView(rows, 3);
    expect(v.gainers.map((r) => r.assetId)).toEqual(['A', 'C']);
    expect(v.losers.map((r) => r.assetId)).toEqual(['B']);
    const loose = scanView(rows, 100);
    expect(loose.nearSupport.length + loose.nearResistance.length).toBeGreaterThan(0);
  });
});

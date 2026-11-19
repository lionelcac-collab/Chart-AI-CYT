import { describe, expect, it } from 'vitest';
import {
  analystConsensus, backtest, bollinger, checkFundamentalsConsistency, computeConsensus, computePerformance,
  computeRange, computeRanges, computeRatios, convert, detectPatterns, ema, horizonForecast, liquidity, macd, rsi, sma,
  DEFAULT_PARAMS, sessionState, MARKETS, windowStart, type Bar,
} from '../src';

/** Deterministic pseudo-random generator (mulberry32) for synthetic test series. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Business-day series starting 2022-01-03. */
function series(n: number, drift = 0.0004, vol = 0.012, seed = 1, start = 1000): Bar[] {
  const r = rng(seed);
  const out: Bar[] = [];
  const d = new Date('2022-01-03T00:00:00Z');
  let p = start;
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const z = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
      p = p * Math.exp(drift + vol * z);
      out.push({ date: d.toISOString().slice(0, 10), open: p, high: p * 1.01, low: p * 0.99, close: p, volume: Math.round(1000 + r() * 5000) });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe('currency', () => {
  it('uses the fixed CFA parity', () => {
    expect(convert(655.957, 'XOF', 'EUR')).toBeCloseTo(1, 9);
    expect(convert(1, 'EUR', 'XAF')).toBeCloseTo(655.957, 9);
    expect(convert(1000, 'XOF', 'XAF')).toBeCloseTo(1000, 9);
  });
  it('returns null when a rate is missing instead of guessing', () => {
    expect(convert(100, 'NGN', 'EUR')).toBeNull();
    expect(convert(1500, 'NGN', 'XOF', { NGN: 1500, EUR: 0.9 })).toBeCloseTo(655.957 * 0.9, 6);
  });
});

describe('indicators', () => {
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  it('sma / ema', () => {
    expect(sma(v, 3)[2]).toBe(2);
    expect(sma(v, 3)[9]).toBe(9);
    expect(sma(v, 3)[1]).toBeNull();
    expect(ema(v, 3)[2]).toBe(2);
    expect(ema(v, 3)[3]).toBeCloseTo(3, 9);
  });
  it('rsi is 100 for a monotonic rise and bounded', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up)[29]).toBe(100);
    const s = series(300).map((b) => b.close);
    rsi(s).forEach((x) => { if (x != null) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100); } });
  });
  it('macd histogram = macd - signal; bollinger brackets the mean', () => {
    const s = series(200).map((b) => b.close);
    const m = macd(s);
    expect(m.histogram[199]).toBeCloseTo(m.macd[199]! - m.signal[199]!, 9);
    const bb = bollinger(s);
    expect(bb.upper[199]!).toBeGreaterThan(bb.middle[199]!);
    expect(bb.lower[199]!).toBeLessThan(bb.middle[199]!);
  });
});

describe('patterns', () => {
  const mk = (closes: number[]): Bar[] => closes.map((c, i) => ({ date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), open: c, high: c, low: c, close: c, volume: 1 }));
  it('double top needs a neckline break; never both double top and bottom', () => {
    // flat 40, peak 120 at 60-day window position ~10, trough 100, peak 120 again, then fall below 100
    const base = Array.from({ length: 40 }, () => 100);
    const shape = [...Array.from({ length: 10 }, (_, i) => 100 + i * 2), 120, ...Array.from({ length: 10 }, (_, i) => 118 - i * 1.8), 101, ...Array.from({ length: 10 }, (_, i) => 102 + i * 1.8), 120, ...Array.from({ length: 15 }, (_, i) => 118 - i * 1.6), 95, 94];
    const p = detectPatterns(mk([...base, ...shape])).map((x) => x.name);
    expect(p).toContain('double_top');
    expect(p).not.toContain('double_bottom');
    const unconfirmed = detectPatterns(mk([...base, ...shape.slice(0, -4), 110])).map((x) => x.name);
    expect(unconfirmed).not.toContain('double_top');
  });
});

describe('ranges (plus bas / plus haut)', () => {
  const bars = series(800);
  it('computes window starts', () => {
    expect(windowStart('2024-03-31', '1M')).toBe('2024-03-02');
    expect(windowStart('2024-06-15', 'YTD')).toBe('2024-01-01');
    expect(windowStart('2024-06-15', '3Y')).toBe('2021-06-15');
  });
  it('low <= last <= high and position in [0,100]', () => {
    for (const r of computeRanges(bars)) {
      expect(r.low).toBeLessThanOrEqual(r.high);
      expect(r.positionPct).toBeGreaterThanOrEqual(0);
      expect(r.positionPct).toBeLessThanOrEqual(100);
      expect(r.distanceFromHighPct).toBeLessThanOrEqual(0);
      expect(r.distanceFromLowPct).toBeGreaterThanOrEqual(0);
      expect(r.lowDate <= bars[bars.length - 1]!.date).toBe(true);
    }
  });
  it('flags partial windows', () => {
    expect(computeRange(series(100), '1Y')!.partial).toBe(true);
    expect(computeRange(bars, '1Y')!.partial).toBe(false);
  });
  it('treats history starting a few days after the window start as complete', () => {
    const b = series(800);
    const last = b[b.length - 1]!.date;
    const start = windowStart(last, '3Y');
    const trimmed = b.filter((x) => x.date > start).filter((x, i) => i > 2); // starts ~3-5 days late
    expect(computeRange(trimmed, '3Y')!.partial).toBe(false);
    expect(computePerformance(trimmed, '3Y').returnPct).not.toBeNull();
    const late = b.filter((x) => x.date > start).slice(15);
    expect(computeRange(late, '3Y')!.partial).toBe(true);
    expect(computePerformance(late, '3Y').returnPct).toBeNull();
  });
  it('exact extremes on a hand-made series', () => {
    const b: Bar[] = [
      { date: '2024-01-02', open: null, high: null, low: null, close: 10, volume: 1 },
      { date: '2024-01-03', open: null, high: 15, low: 9, close: 12, volume: 1 },
      { date: '2024-01-04', open: null, high: null, low: null, close: 11, volume: 1 },
    ];
    const r = computeRange(b, '1W')!;
    expect(r).toMatchObject({ low: 9, lowDate: '2024-01-03', high: 15, highDate: '2024-01-03' });
    expect(r.positionPct).toBeCloseTo(((11 - 9) / 6) * 100, 9);
  });
  it('performance uses the close on/before window start', () => {
    const p = computePerformance(bars, '1Y');
    const ref = bars.find((b) => b.date === p.referenceDate)!;
    expect(p.returnPct).toBeCloseTo((bars[bars.length - 1]!.close / ref.close - 1) * 100, 9);
  });
});

describe('liquidity', () => {
  it('scores illiquid series low with a warning', () => {
    const b = series(100).map((x, i) => ({ ...x, volume: i % 4 === 0 ? 10 : 0 }));
    const l = liquidity(b);
    expect(l.warning).toBe(true);
    expect(l.zeroVolumeSessions).toBeGreaterThan(40);
  });
});

describe('fundamentals', () => {
  it('ratios and unit-error detection', () => {
    const prov = { source: 't', fetchedAt: '', asOf: '', status: { kind: 'unavailable' as const } };
    const h = [
      { fiscalYear: 2020, revenue: 100, netIncome: 10, provenance: prov },
      { fiscalYear: 2021, revenue: 110, netIncome: 11, provenance: prov },
      { fiscalYear: 2022, revenue: 120, netIncome: 12, provenance: prov },
      { fiscalYear: 2023, revenue: 133.1, netIncome: 13.31, totalEquity: 66.55, eps: 2, dividendPerShare: 1, bookValuePerShare: 10, provenance: prov },
    ];
    const r = computeRatios(h, 20);
    expect(r.per).toBe(10);
    expect(r.pb).toBe(2);
    expect(r.dividendYieldPct).toBe(5);
    expect(r.roePct).toBeCloseTo(20, 6);
    expect(r.revenueCagr3yPct).toBeCloseTo(10, 6);
    const issues = checkFundamentalsConsistency({ ...h[3]!, revenue: 133100 }, h[2]);
    expect(issues.some((i) => i.field === 'revenue')).toBe(true);
  });
});

describe('consensus', () => {
  it('analyst consensus keeps latest per broker within a year', () => {
    const a = analystConsensus([
      { broker: 'SGI A', recommendation: 'hold', targetPrice: 90, publishedAt: '2023-01-01' },
      { broker: 'SGI A', recommendation: 'buy', targetPrice: 120, publishedAt: '2024-05-01' },
      { broker: 'SGI B', recommendation: 'sell', targetPrice: 80, publishedAt: '2024-04-01' },
      { broker: 'SGI C', recommendation: 'buy', targetPrice: 200, publishedAt: '2020-01-01' },
    ], 100, '2024-06-01');
    expect(a.count).toBe(2);
    expect(a.targetMean).toBe(100);
    expect(a.distribution).toEqual({ buy: 1, hold: 0, sell: 1 });
  });

  it('scenario probabilities sum to 1 and range brackets the central price', () => {
    for (const S of [-1, -0.3, 0, 0.4, 1]) {
      const f = horizonForecast(100, S, 0.25, '3M', DEFAULT_PARAMS);
      expect(f.bear.probability + f.central.probability + f.bull.probability).toBeCloseTo(1, 6);
      expect(f.bear.price).toBeLessThan(f.central.price);
      expect(f.central.price).toBeLessThan(f.bull.price);
      expect(f.rangeLow).toBeLessThan(100 * (1 + f.expectedReturnPct / 100));
      expect(f.rangeHigh).toBeGreaterThan(100 * (1 + f.expectedReturnPct / 100));
    }
    const mid = horizonForecast(100, 0.5, 0.25, '12M', DEFAULT_PARAMS);
    expect(mid.central.returnPct).toBeCloseTo(mid.expectedReturnPct, 6); // central = median forecast
    const up = horizonForecast(100, 1, 0.25, '12M', DEFAULT_PARAMS);
    const down = horizonForecast(100, -1, 0.25, '12M', DEFAULT_PARAMS);
    expect(up.bull.probability).toBeGreaterThan(down.bull.probability);
  });

  it('a strong uptrend yields a positive orientation; no data ⇒ null', () => {
    const res = computeConsensus({ bars: series(600, 0.002, 0.01, 7) })!;
    expect(res.orientation).toBe('positive');
    expect(res.invalidationLevel!).toBeLessThan(res.price);
    expect(res.forecasts).toHaveLength(4);
    expect(res.confidence).not.toBe('high'); // price-only ⇒ capped at medium
    expect(computeConsensus({ bars: series(10) })).toBeNull();
  });

  it('illiquidity lowers confidence and widens ranges', () => {
    const liquid = series(600, 0.001, 0.012, 3);
    const illiquid = liquid.map((b, i) => ({ ...b, volume: i % 5 === 0 ? 5 : 0 }));
    const a = computeConsensus({ bars: liquid })!;
    const b = computeConsensus({ bars: illiquid })!;
    expect(b.confidenceValue).toBeLessThan(a.confidenceValue);
    const w = (r: typeof a) => r.forecasts[3]!.rangeHigh - r.forecasts[3]!.rangeLow;
    expect(w(b)).toBeGreaterThan(w(a));
  });
});

describe('backtest', () => {
  it('runs walk-forward without look-ahead and reports coverage', () => {
    const bars = series(900, 0.0005, 0.012, 11);
    const r = backtest(bars, { horizon: '1M' });
    expect(r.samples.length).toBeGreaterThan(20);
    expect(r.rangeCoverage!).toBeGreaterThan(0.5);
    // sample dates strictly increasing and before the realised window end
    for (let i = 1; i < r.samples.length; i++) expect(r.samples[i]!.date > r.samples[i - 1]!.date).toBe(true);
  });
});

describe('markets', () => {
  it('BRVM session state in Abidjan time (UTC+0)', () => {
    expect(sessionState(MARKETS.BRVM, new Date('2024-06-12T10:00:00Z'))).toBe('open');
    expect(sessionState(MARKETS.BRVM, new Date('2024-06-12T16:00:00Z'))).toBe('closed');
    expect(sessionState(MARKETS.BRVM, new Date('2024-06-15T10:00:00Z'))).toBe('weekend');
    // Lagos is UTC+1: 09:30 UTC = 10:30 local ⇒ open
    expect(sessionState(MARKETS.NGX, new Date('2024-06-12T09:30:00Z'))).toBe('open');
  });
});

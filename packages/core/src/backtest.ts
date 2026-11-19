/**
 * Walk-forward backtest of the consensus model.
 *
 * At each rebalance date t (every `step` sessions, with ≥ `minHistory` sessions
 * of history) the model is run on bars[0..t] only — no look-ahead — and its
 * forecast for horizon h is compared with the realised close at t + h sessions.
 *
 * Historical fundamentals / news / analyst data are rarely available as
 * point-in-time snapshots, so by default the backtest runs the price-only
 * part of the model (trend factor + liquidity + volatility). Pass a
 * `snapshotAt(t)` provider to backtest the full model when point-in-time
 * snapshots exist (table `consensus_inputs_snapshots`).
 */
import type { Bar } from './types';
import { computeConsensus, DEFAULT_PARAMS, HORIZON_SESSIONS, type ConsensusInputs, type Horizon, type ModelParams } from './consensus';

export interface BacktestOptions {
  horizon: Horizon;
  step?: number;          // sessions between forecasts (default 21)
  minHistory?: number;    // default 252
  /** |S| below this counts as "neutral" (no directional call). */
  neutralBand?: number;   // default 0.15
  snapshotAt?: (bars: Bar[]) => Omit<ConsensusInputs, 'bars'>;
  params?: ModelParams;
}

export interface BacktestSample {
  date: string;
  score: number;
  predictedReturnPct: number;
  realisedReturnPct: number;
  pBull: number;
  inRange: boolean;
  directional: 'up' | 'down' | 'neutral';
  hit: boolean | null;
}

export interface BacktestResult {
  horizon: Horizon;
  samples: BacktestSample[];
  calls: number;           // directional calls
  hits: number;
  hitRate: number | null;  // hits / calls
  /** Share of realised prices inside the 80 % range (target ≈ 0.80). */
  rangeCoverage: number | null;
  /** Brier score of P(bull) vs realised "return > +k" (lower is better; 0.25 = coin flip at p=0.5). */
  brier: number | null;
  avgReturnUpCalls: number | null;
  avgReturnDownCalls: number | null;
  /** Base rate: share of samples where price rose (to compare the hit rate against). */
  baseRateUp: number | null;
}

export function backtest(bars: Bar[], opts: BacktestOptions): BacktestResult {
  const step = opts.step ?? 21;
  const minHistory = opts.minHistory ?? 252;
  const band = opts.neutralBand ?? 0.15;
  const H = HORIZON_SESSIONS[opts.horizon];
  const params = opts.params ?? DEFAULT_PARAMS;
  const samples: BacktestSample[] = [];
  let brierSum = 0, brierN = 0;

  for (let t = minHistory; t + H < bars.length; t += step) {
    const hist = bars.slice(0, t + 1);
    const extra = opts.snapshotAt ? opts.snapshotAt(hist) : {};
    const res = computeConsensus({ ...extra, bars: hist }, params);
    if (!res) continue;
    const f = res.forecasts.find((x) => x.horizon === opts.horizon)!;
    const p0 = hist[hist.length - 1]!.close;
    const p1 = bars[t + H]!.close;
    const realised = (p1 / p0 - 1) * 100;
    const directional = f.score > band ? 'up' : f.score < -band ? 'down' : 'neutral';
    const hit = directional === 'neutral' ? null : directional === 'up' ? realised > 0 : realised < 0;
    // "bull" region threshold used by the model: X > k, k = 0.5·s
    const bullThreshold = (Math.exp(0.5 * res.sigma * Math.sqrt(H / 252)) - 1) * 100;
    const bullRealised = realised > bullThreshold ? 1 : 0;
    brierSum += (f.bull.probability - bullRealised) ** 2;
    brierN++;
    samples.push({
      date: hist[hist.length - 1]!.date,
      score: f.score,
      predictedReturnPct: f.expectedReturnPct,
      realisedReturnPct: realised,
      pBull: f.bull.probability,
      inRange: p1 >= f.rangeLow && p1 <= f.rangeHigh,
      directional,
      hit,
    });
  }

  const calls = samples.filter((s) => s.hit !== null);
  const hits = calls.filter((s) => s.hit).length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    horizon: opts.horizon,
    samples,
    calls: calls.length,
    hits,
    hitRate: calls.length ? hits / calls.length : null,
    rangeCoverage: samples.length ? samples.filter((s) => s.inRange).length / samples.length : null,
    brier: brierN ? brierSum / brierN : null,
    avgReturnUpCalls: mean(samples.filter((s) => s.directional === 'up').map((s) => s.realisedReturnPct)),
    avgReturnDownCalls: mean(samples.filter((s) => s.directional === 'down').map((s) => s.realisedReturnPct)),
    baseRateUp: samples.length ? samples.filter((s) => s.realisedReturnPct > 0).length / samples.length : null,
  };
}

/** Aggregates per-asset backtests into the public track record (pooled counts). */
export function poolBacktests(results: BacktestResult[]): Pick<BacktestResult, 'calls' | 'hits' | 'hitRate' | 'rangeCoverage' | 'baseRateUp'> & { samples: number } {
  const all = results.flatMap((r) => r.samples);
  const calls = all.filter((s) => s.hit !== null);
  const hits = calls.filter((s) => s.hit).length;
  return {
    samples: all.length,
    calls: calls.length,
    hits,
    hitRate: calls.length ? hits / calls.length : null,
    rangeCoverage: all.length ? all.filter((s) => s.inRange).length / all.length : null,
    baseRateUp: all.length ? all.filter((s) => s.realisedReturnPct > 0).length / all.length : null,
  };
}

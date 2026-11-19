/**
 * Market scan: biggest gainers / losers over a period, and stocks trading close to a
 * support or a resistance computed on that same period.
 * Computed once per session on the server (post-close → table `market_scans`) and by the
 * app in demo mode. The "near" threshold is applied by the app so the user can change it.
 */
import type { Bar } from './types';
import { supportResistance } from './indicators';
import { computePerformance, windowStart, type RangePeriod } from './ranges';
import { liquidity } from './liquidity';

export type ScanPeriod = '1D' | RangePeriod;
export const SCAN_PERIODS: ScanPeriod[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y'];

export interface ScanRow {
  assetId: string;
  ticker: string;
  name: string;
  last: number;
  lastDate: string;
  returnPct: number | null;
  /** Nearest level below the price (pivot cluster or period low), and distance in % (≥ 0). */
  support: number | null;
  supportDistPct: number | null;
  /** Nearest level above the price (pivot cluster or period high), and distance in % (≥ 0). */
  resistance: number | null;
  resistanceDistPct: number | null;
  illiquid: boolean;
}

export interface ScanInput { assetId: string; ticker: string; name: string; bars: Bar[] }

/** Bars of the window ending at the last session ('1D' = last 2 sessions). */
export function periodSlice(bars: Bar[], period: ScanPeriod): Bar[] {
  if (period === '1D') return bars.slice(-2);
  const last = bars[bars.length - 1];
  if (!last) return [];
  const start = windowStart(last.date, period);
  return bars.filter((b) => (period === 'YTD' ? b.date >= start : b.date > start));
}

export function scanAsset(input: ScanInput, period: ScanPeriod): ScanRow | null {
  const { bars } = input;
  const last = bars[bars.length - 1];
  if (!last || bars.length < 2) return null;
  const price = last.close;

  let returnPct: number | null;
  if (period === '1D') {
    const prev = bars[bars.length - 2]!.close;
    returnPct = prev > 0 ? ((price - prev) / prev) * 100 : null;
  } else {
    returnPct = computePerformance(bars, period).returnPct;
  }

  // Levels: pivot clusters of the window + the window's own low/high (always meaningful,
  // even on short windows with few pivots). For 1D, use the last 20 sessions.
  const win = period === '1D' ? bars.slice(-20) : periodSlice(bars, period);
  const lookaround = win.length >= 120 ? 3 : 2;
  const pivots = win.length >= 2 * lookaround + 1 ? supportResistance(win, lookaround, 1.5, 6) : [];
  const lows = win.map((b) => b.low ?? b.close);
  const highs = win.map((b) => b.high ?? b.close);
  const below = [...pivots.filter((l) => l.price < price).map((l) => l.price), Math.min(...lows)].filter((p) => p < price);
  const above = [...pivots.filter((l) => l.price > price).map((l) => l.price), Math.max(...highs)].filter((p) => p > price);
  const support = below.length ? Math.max(...below) : null;
  const resistance = above.length ? Math.min(...above) : null;

  return {
    assetId: input.assetId, ticker: input.ticker, name: input.name, last: price, lastDate: last.date,
    returnPct,
    support, supportDistPct: support != null ? ((price - support) / price) * 100 : null,
    resistance, resistanceDistPct: resistance != null ? ((resistance - price) / price) * 100 : null,
    illiquid: liquidity(bars)?.warning ?? false,
  };
}

export function scanMarket(inputs: ScanInput[], period: ScanPeriod): ScanRow[] {
  return inputs.map((i) => scanAsset(i, period)).filter((r): r is ScanRow => r !== null);
}

export interface ScanView { gainers: ScanRow[]; losers: ScanRow[]; nearSupport: ScanRow[]; nearResistance: ScanRow[] }

/** Splits scan rows into the four lists shown on the dashboard. */
export function scanView(rows: ScanRow[], nearPct = 3, top = 5): ScanView {
  const withRet = rows.filter((r) => r.returnPct != null);
  return {
    gainers: [...withRet].filter((r) => r.returnPct! > 0).sort((a, b) => b.returnPct! - a.returnPct!).slice(0, top),
    losers: [...withRet].filter((r) => r.returnPct! < 0).sort((a, b) => a.returnPct! - b.returnPct!).slice(0, top),
    nearSupport: rows.filter((r) => r.supportDistPct != null && r.supportDistPct <= nearPct).sort((a, b) => a.supportDistPct! - b.supportDistPct!),
    nearResistance: rows.filter((r) => r.resistanceDistPct != null && r.resistanceDistPct <= nearPct).sort((a, b) => a.resistanceDistPct! - b.resistanceDistPct!),
  };
}

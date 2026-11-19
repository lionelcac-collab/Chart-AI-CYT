/**
 * REAL-DATA SNAPSHOT mode: a dated snapshot of the Mansa API (current quotes, indices, FX),
 * injected into the web page at build time as `window.__CHART_BOURSAFRIKIA_SNAPSHOT__`
 * (scripts/fetch-snapshot.mts + scripts/build-web-demo.mjs --snapshot).
 * Everything that needs price history (charts, highs/lows, technicals, consensus, period
 * movers, supports/resistances) is shown as "data unavailable": nothing is simulated.
 */
import type { IndexQuote } from '@chart-boursafrikia/data';
import type { MarketCode, Quote } from '@chart-boursafrikia/core';

export interface SnapshotQuote extends Quote { name: string }
export interface LatestRow {
  asset_id: string; market: MarketCode; ticker: string; name: string; currency: string; sector: string | null;
  session_date: string; close: number | string; previous_close: number | string | null; change_pct: number | string | null;
  volume: number | string | null; value: number | string | null; source: string;
}
export interface Snapshot {
  /** 'db' = export of the Chart-BoursafrikIA database (history included); absent = Mansa quotes only. */
  kind?: 'db';
  base?: string;
  latest?: LatestRow[];
  history?: Record<string, { d: number[]; c: number[]; v: (number | null)[] }>;
  fetchedAt: string;
  source: string;
  sourceUrl: string;
  plan: string;
  markets: Partial<Record<MarketCode, { quotes: SnapshotQuote[] }>>;
  indices: IndexQuote[];
  fx: { quote: string; rate: number }[];
}

export const SNAPSHOT: Snapshot | null = (globalThis as { __CHART_BOURSAFRIKIA_SNAPSHOT__?: Snapshot }).__CHART_BOURSAFRIKIA_SNAPSHOT__ ?? null;

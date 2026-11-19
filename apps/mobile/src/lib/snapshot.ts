/**
 * REAL-DATA SNAPSHOT mode: a dated snapshot of the Mansa API (current quotes, indices, FX),
 * injected into the web page at build time as `window.__NYOTA_SNAPSHOT__`
 * (scripts/fetch-snapshot.mts + scripts/build-web-demo.mjs --snapshot).
 * Everything that needs price history (charts, highs/lows, technicals, consensus, period
 * movers, supports/resistances) is shown as "data unavailable": nothing is simulated.
 */
import type { IndexQuote } from '@nyota/data';
import type { MarketCode, Quote } from '@nyota/core';

export interface SnapshotQuote extends Quote { name: string }
export interface Snapshot {
  fetchedAt: string;
  source: string;
  sourceUrl: string;
  plan: string;
  markets: Partial<Record<MarketCode, { quotes: SnapshotQuote[] }>>;
  indices: IndexQuote[];
  fx: { quote: string; rate: number }[];
}

export const SNAPSHOT: Snapshot | null = (globalThis as { __NYOTA_SNAPSHOT__?: Snapshot }).__NYOTA_SNAPSHOT__ ?? null;

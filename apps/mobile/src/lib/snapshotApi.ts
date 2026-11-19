// Data provider for the real-data snapshot mode (see snapshot.ts). Only what the snapshot
// really contains is returned; the rest is empty / null so the UI shows "data unavailable".
import type { MarketCode, ScanPeriod, ScanRow } from '@nyota/core';
import { MARKETS } from '@nyota/core';
import { SNAPSHOT, type SnapshotQuote } from './snapshot';
import type { AssetSheet, AssetSummary, Dashboard } from './types';

const EMPTY_RATIOS = { netMarginPct: null, roePct: null, debtToEquity: null, per: null, pb: null, dividendYieldPct: null, payoutPct: null, revenueCagr3yPct: null, netIncomeCagr3yPct: null };

const quotes = (market?: MarketCode): SnapshotQuote[] =>
  Object.entries(SNAPSHOT?.markets ?? {}).filter(([m]) => !market || m === market).flatMap(([, v]) => v?.quotes ?? []);

const marketOf = (assetId: string) => assetId.split(':')[0] as MarketCode;

export function snapSummary(q: SnapshotQuote): AssetSummary {
  const m = marketOf(q.assetId);
  return {
    id: q.assetId, ticker: q.assetId.split(':')[1]!, name: q.name, market: m, sector: null,
    currency: MARKETS[m as 'BRVM']?.currency ?? 'XOF', last: q.last, changePct: q.changePct, volume: q.volume, value: q.value,
    status: q.provenance.status, source: q.provenance.source, asOf: q.provenance.asOf,
  };
}

export function snapDashboard(market: MarketCode): Dashboard {
  return {
    market,
    indices: (SNAPSHOT?.indices ?? []).filter((i) => i.market === market).map((i) => ({
      code: i.code, name: i.name, market, value: i.value, changePct: i.changePct, date: i.provenance.asOf, source: i.provenance.source,
    })),
    movers: quotes(market).map(snapSummary),
    sectors: [],          // Mansa returns no sector on the free plan
    opportunities: [],    // needs price history (model)
    report: null,
  };
}

/** Only the 1-day variation exists without history; levels need history. */
export function snapScan(market: MarketCode, period: ScanPeriod): { rows: ScanRow[]; sessionDate: string | null; unavailable?: 'history' } {
  if (period !== '1D') return { rows: [], sessionDate: null, unavailable: 'history' };
  const rows: ScanRow[] = quotes(market).map((q) => ({
    assetId: q.assetId, ticker: q.assetId.split(':')[1]!, name: q.name, last: q.last, lastDate: q.provenance.asOf.slice(0, 10),
    returnPct: q.changePct, support: null, supportDistPct: null, resistance: null, resistanceDistPct: null, illiquid: (q.volume ?? 0) === 0,
  }));
  return { rows, sessionDate: null, unavailable: undefined };
}

export function snapSheet(id: string): AssetSheet | null {
  const q = quotes().find((x) => x.assetId === id);
  if (!q) return null;
  const s = snapSummary(q);
  return {
    plan: 'free',
    asset: { id, ticker: s.ticker, name: q.name, market: s.market, currency: s.currency, isin: null, sectors: null },
    quote: {
      last: q.last, change_pct: q.changePct, volume: q.volume, value: q.value, market_cap: q.marketCap,
      status: q.provenance.status.kind, delay_minutes: q.provenance.status.kind === 'delayed' ? q.provenance.status.delayMinutes : null,
      as_of: q.provenance.asOf, source: q.provenance.source,
    },
    lastClose: null,
    bars: [], ranges: [], performance: [], liquidity: null, ratios: EMPTY_RATIOS,
    fundamentals: [], dividends: [], shareholders: [], executives: [], events: [], documents: [],
    peers: [],
    technical: null, news: [], analysts: null, consensus: null,
  };
}

export function snapSearch(query: string, market?: MarketCode): AssetSummary[] {
  const ql = query.trim().toLowerCase();
  return quotes(market).filter((q) => !ql || q.name.toLowerCase().includes(ql) || q.assetId.toLowerCase().includes(ql)).map(snapSummary);
}

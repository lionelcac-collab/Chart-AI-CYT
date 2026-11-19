// Data provider for the real-data snapshot mode (see snapshot.ts). Only what the snapshot
// really contains is returned; the rest is empty / null so the UI shows "data unavailable".
import type { Bar, CurrencyCode, MarketCode, ScanPeriod, ScanRow } from '@nyota/core';
import {
  LIQUIDITY_THRESHOLDS, MARKETS, computeConsensus, computePerformances, computeRanges, liquidity, scanMarket, technicalSnapshot,
} from '@nyota/core';
import { SNAPSHOT, type LatestRow, type SnapshotQuote } from './snapshot';
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

// ---------------------------------------------------------------------------------------------
// Database export (kind: 'db'): full history → same computations as the server (@nyota/core).
// ---------------------------------------------------------------------------------------------
export const IS_DB = SNAPSHOT?.kind === 'db';
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const sourceLabel = (s: string) => (s?.startsWith('official_bulletin') ? 'bulletin officiel' : s);
const barsCache = new Map<string, Bar[]>();

export function dbBars(id: string): Bar[] {
  const hit = barsCache.get(id);
  if (hit) return hit;
  const h = SNAPSHOT?.history?.[id];
  const base = Date.parse(`${SNAPSHOT?.base ?? '2015-01-01'}T00:00:00Z`);
  const bars: Bar[] = h ? h.d.map((d, i) => ({
    date: new Date(base + d * 86400_000).toISOString().slice(0, 10), open: null, high: null, low: null, close: h.c[i]!, volume: h.v[i] ?? null,
  })) : [];
  barsCache.set(id, bars);
  return bars;
}

const latestRows = (market?: MarketCode): LatestRow[] => {
  const rows = (SNAPSHOT?.latest ?? []).filter((r) => !market || r.market === market);
  const newest = rows.reduce((m, r) => (r.session_date > m ? r.session_date : m), '');
  const cutoff = newest ? new Date(Date.parse(newest) - 30 * 86400_000).toISOString().slice(0, 10) : '';
  return rows.filter((r) => r.session_date >= cutoff); // drop suspended / delisted stocks
};

export function dbSummary(r: LatestRow): AssetSummary {
  return {
    id: r.asset_id, ticker: r.ticker, name: r.name, market: r.market, sector: r.sector, currency: r.currency as CurrencyCode,
    last: num(r.close), changePct: num(r.change_pct), volume: num(r.volume), value: num(r.value),
    status: { kind: 'close', sessionDate: r.session_date }, source: sourceLabel(r.source), asOf: r.session_date,
  };
}

const consensusCache = new Map<string, ReturnType<typeof computeConsensus>>();
function dbConsensus(id: string, market: MarketCode) {
  if (!consensusCache.has(id)) {
    const thr = LIQUIDITY_THRESHOLDS[market];
    consensusCache.set(id, computeConsensus({ bars: dbBars(id), liquidityFloor: thr?.floor, liquidityCap: thr?.cap }));
  }
  return consensusCache.get(id)!;
}

export function dbDashboard(market: MarketCode): Dashboard {
  const rows = latestRows(market);
  const opportunities = rows.map((r) => {
    const c = dbConsensus(r.asset_id, market);
    return { asset_id: r.asset_id, name: r.name, score: c ? c.forecasts[3]!.score * (0.5 + 0.5 * c.confidenceValue) : 0, illiquid: c?.liquidity?.warning ?? false, confidence: c?.confidence ?? 'low' };
  }).sort((a, b) => Number(a.illiquid) - Number(b.illiquid) || b.score - a.score).slice(0, 20);
  return {
    market,
    indices: ((SNAPSHOT as unknown as { indices?: Record<string, unknown>[] })?.indices ?? []).filter((i) => i.market === market).map((i) => ({
      code: String(i.index_code), name: String(i.name), market, value: Number(i.value), changePct: num(i.change_pct), date: String(i.session_date), source: String(i.source),
    })),
    movers: rows.map(dbSummary),
    sectors: [],
    opportunities,
    report: null,
  };
}

export function dbScan(market: MarketCode, period: ScanPeriod): { rows: ScanRow[]; sessionDate: string | null } {
  const rows = scanMarket(latestRows(market).map((r) => ({ assetId: r.asset_id, ticker: r.ticker, name: r.name, bars: dbBars(r.asset_id) })), period);
  return { rows, sessionDate: rows.reduce((m, r) => (r.lastDate > m ? r.lastDate : m), '') || null };
}

export function dbSheet(id: string, premium: boolean): AssetSheet | null {
  const r = (SNAPSHOT?.latest ?? []).find((x) => x.asset_id === id);
  if (!r) return null;
  const bars = dbBars(id);
  const last = bars[bars.length - 1];
  const thr = LIQUIDITY_THRESHOLDS[r.market];
  const c = dbConsensus(id, r.market);
  return {
    plan: premium ? 'premium' : 'free',
    asset: { id, ticker: r.ticker, name: r.name, market: r.market, currency: r.currency as CurrencyCode, isin: null, sectors: null },
    quote: null,
    lastClose: last ? { price: last.close, date: last.date } : null,
    lastSource: sourceLabel(r.source),
    bars,
    ranges: computeRanges(bars),
    performance: computePerformances(bars),
    liquidity: liquidity(bars, 63, thr?.floor, thr?.cap),
    ratios: EMPTY_RATIOS,
    fundamentals: [], dividends: [], shareholders: [], executives: [], events: [], documents: [],
    peers: latestRows(r.market).filter((x) => x.asset_id !== id && x.sector && x.sector === r.sector).slice(0, 8).map((x) => ({ id: x.asset_id, ticker: x.ticker, name: x.name, market: x.market })),
    technical: technicalSnapshot(bars),
    news: [], analysts: null,
    consensus: !c ? null : premium ? c : {
      orientation: c.orientation, confidence: c.confidence, asOf: c.asOf, modelVersion: c.modelVersion, disclaimer: c.disclaimer, analysts: null, locked: true,
    },
  };
}

export function dbSearch(query: string, market?: MarketCode): AssetSummary[] {
  const ql = query.trim().toLowerCase();
  return latestRows(market).filter((r) => !ql || r.name.toLowerCase().includes(ql) || r.ticker.toLowerCase().includes(ql)).map(dbSummary);
}

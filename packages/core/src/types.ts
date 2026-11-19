/**
 * Domain types shared by the app, the edge functions and the data connectors.
 * Every market datum carries its provenance (source + timestamp + status):
 * the UI must never display a number without it.
 */

export type MarketCode =
  // MVP
  | 'BRVM' | 'BVMAC' | 'NGX'
  // Phase 2
  | 'JSE' | 'EGX' | 'CSE_MA' | 'NSE_KE' | 'GSE' | 'BVMT' | 'SEM' | 'BSE_BW'
  | 'NSX' | 'LUSE' | 'DSE' | 'USE' | 'RSE' | 'ZSE' | 'VFEX' | 'MSE' | 'SGBV' | 'BVC';

export type AssetClass = 'equity' | 'bond' | 'index' | 'fund' | 'etf' | 'fx';

export type CurrencyCode = 'XOF' | 'XAF' | 'NGN' | 'ZAR' | 'EGP' | 'MAD' | 'KES' | 'GHS'
  | 'TND' | 'MUR' | 'BWP' | 'NAD' | 'ZMW' | 'TZS' | 'UGX' | 'RWF' | 'ZWG' | 'USD' | 'MWK'
  | 'DZD' | 'CVE' | 'EUR';

/** Freshness status shown next to every price. */
export type DataStatus =
  | { kind: 'close'; sessionDate: string }          // « Clôture du JJ/MM »
  | { kind: 'delayed'; delayMinutes: number }       // « Différé ~30 min »
  | { kind: 'realtime' }                            // licensed feeds only (disabled by default)
  | { kind: 'unavailable' };                        // « Donnée indisponible »

export interface Provenance {
  source: string;        // e.g. 'mansa', 'brvm_bulletin', 'worldbank'
  fetchedAt: string;     // ISO timestamp of collection
  asOf: string;          // ISO timestamp / date the datum refers to
  status: DataStatus;
  url?: string;
}

export interface Bar {
  /** ISO date (YYYY-MM-DD) of the trading session. */
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null; // shares traded (0 = no trade that day, null = not published by the source)
  value?: number | null; // traded value in local currency
}

export interface Asset {
  id: string;
  ticker: string;
  isin?: string | null;
  name: string;
  market: MarketCode;
  country: string;       // ISO-3166 alpha-2
  sector?: string | null;
  currency: CurrencyCode;
  assetClass: AssetClass;
  listingDate?: string | null;
  sharesOutstanding?: number | null;
  freeFloatPct?: number | null;
  website?: string | null;
}

export interface Quote {
  assetId: string;
  last: number;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  value: number | null;
  marketCap: number | null;
  provenance: Provenance;
}

export interface Fundamentals {
  fiscalYear: number;
  revenue?: number | null;
  netIncome?: number | null;
  totalEquity?: number | null;
  totalDebt?: number | null;
  totalAssets?: number | null;
  operatingCashFlow?: number | null;
  eps?: number | null;
  dividendPerShare?: number | null;
  bookValuePerShare?: number | null;
  provenance: Provenance;
}

export type Recommendation = 'buy' | 'hold' | 'sell';

export interface AnalystOpinion {
  broker: string;            // SGI / broker / bank
  recommendation: Recommendation;
  targetPrice: number | null;
  publishedAt: string;       // ISO date
  sourceUrl?: string | null;
}

/** Result type that forbids silent fabrication: either a value or "unavailable". */
export type Maybe<T> = { ok: true; value: T } | { ok: false; reason: string };
export const some = <T>(value: T): Maybe<T> => ({ ok: true, value });
export const none = <T = never>(reason: string): Maybe<T> => ({ ok: false, reason });

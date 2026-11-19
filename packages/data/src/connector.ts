import type { Asset, Bar, MarketCode, Provenance, Quote } from '@nyota/core';

/**
 * Common interface for every market-data source. Connectors are interchangeable:
 * the ingestion job asks the registry for a primary and a fallback per market.
 * A connector must NEVER fabricate values: unknown fields are `null`, and a
 * failed call throws a ConnectorError (the registry then tries the fallback).
 */
export interface ConnectorCapabilities {
  markets: MarketCode[];
  quotes: boolean;
  history: boolean;
  indices: boolean;
  forex: boolean;
  dividends: boolean;
  bonds: boolean;
  ipos: boolean;
  realtime: boolean;
}

export interface IndexQuote {
  code: string;            // e.g. BRVM-C, BRVM-30, NGXASI
  name: string;
  market: MarketCode;
  value: number;
  changePct: number | null;
  provenance: Provenance;
}

export interface FxRate {
  base: 'USD';
  quote: string;           // currency code
  rate: number;            // units of quote per 1 USD
  provenance: Provenance;
}

export interface DividendEvent {
  ticker: string;
  market: MarketCode;
  amount: number;
  currency: string;
  exDate: string | null;
  paymentDate: string | null;
  provenance: Provenance;
}

export interface MarketDataConnector {
  readonly id: string;
  readonly capabilities: ConnectorCapabilities;
  /** True when credentials/config are present; disabled connectors are skipped. */
  isEnabled(): boolean;
  listAssets(market: MarketCode): Promise<Asset[]>;
  getQuotes(market: MarketCode): Promise<Quote[]>;
  getHistory(market: MarketCode, ticker: string, from: string, to: string): Promise<Bar[]>;
  getIndices?(market?: MarketCode): Promise<IndexQuote[]>;
  getForex?(): Promise<FxRate[]>;
  getDividends?(market: MarketCode): Promise<DividendEvent[]>;
}

export class ConnectorError extends Error {
  constructor(public connector: string, message: string, public status?: number, public retryable = false) {
    super(`[${connector}] ${message}`);
  }
}

export type FetchLike = (input: string, init?: { headers?: Record<string, string>; method?: string; body?: string }) => Promise<{
  ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string>; arrayBuffer?(): Promise<ArrayBuffer>;
}>;

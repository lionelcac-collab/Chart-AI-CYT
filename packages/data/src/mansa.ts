/**
 * Mansa Markets API connector — verified against the live API on 2026-11-19.
 *
 *   Base URL  https://mansaapi.com   (NOT www.: its redirect strips the Authorization header)
 *   Auth      X-API-Key: <key>       (also accepted: Authorization: Bearer <key>, ?api_key=)
 *   GET /api/v1/markets/exchanges                                   all plans
 *   GET /api/v1/markets/exchanges/{exchange}/stocks                 all plans (price, change, change_pct, volume)
 *   GET /api/v1/markets/exchanges/{exchange}/stocks/{ticker}        all plans (+ market_cap, shares, sector: often null)
 *   GET /api/v1/markets/exchanges/{exchange}/stocks/{ticker}/history  PRO plan or higher (403 TIER_REQUIRED otherwise)
 *   GET /api/v1/markets/indices                                     all plans (field market_id = exchange id)
 *   GET /api/v1/markets/forex                                       all plans (source open.er-api.com)
 * Exchange ids: BRVM = "ivory-coast", BVMAC = "bvmac", NGX = "nigeria".
 * Responses: { success, data, meta: { data_freshness: "30_minutes", updated_at }, pagination }.
 *
 * Terms: attribution "Data: Mansa Markets" with a link wherever data is shown; display in a
 * commercial app / redistribution must be confirmed in writing (pricing page lists
 * "Redistribution-lite" only on the Business plan).
 */
import type { Asset, Bar, CurrencyCode, MarketCode, Quote } from '@nyota/core';
import { MARKETS, localClock } from '@nyota/core';
import { ConnectorError, type ConnectorCapabilities, type FetchLike, type FxRate, type IndexQuote, type MarketDataConnector } from './connector';
import { RateLimiter, TtlCache } from './cache';

export interface MansaConfig {
  apiKey?: string;
  baseUrl?: string;                 // default https://mansaapi.com
  authHeader?: string;              // default 'X-API-Key' — 'Authorization' ⇒ Bearer
  paths?: Partial<{
    stocks: string; indices: string; forex: string; exchanges: string;
    history: string;                // placeholders {exchange} {ticker}
    dividends: string;
  }>;
  /** Exchange codes as Mansa names them, if different from ours. */
  exchangeCodes?: Partial<Record<MarketCode, string>>;
  requestsPerMinute?: number;       // respect plan quota (default 30)
  cacheTtlSec?: number;             // default 900
  /** Data delay advertised by the plan: 0 = end-of-day only. */
  delayMinutes?: number;
  fetch?: FetchLike;
}

const DEFAULT_PATHS = {
  stocks: '/api/v1/markets/exchanges/{exchange}/stocks',
  indices: '/api/v1/markets/indices',
  forex: '/api/v1/markets/forex',
  exchanges: '/api/v1/markets/exchanges',
  history: '/api/v1/markets/exchanges/{exchange}/stocks/{ticker}/history',
  dividends: '/api/v1/markets/exchanges/{exchange}/dividends', // Starter plan+ (not verified)
};

/** Mansa exchange ids for our market codes (from GET /api/v1/markets/exchanges). */
export const MANSA_EXCHANGE_IDS: Partial<Record<MarketCode, string>> = {
  BRVM: 'ivory-coast', BVMAC: 'bvmac', NGX: 'nigeria', JSE: 'south-africa', EGX: 'egypt', CSE_MA: 'morocco',
  NSE_KE: 'kenya', GSE: 'ghana', SEM: 'mauritius', BSE_BW: 'botswana', NSX: 'namibia', LUSE: 'zambia', DSE: 'tanzania',
  USE: 'uganda', RSE: 'rwanda', ZSE: 'zimbabwe', VFEX: 'vfex', MSE: 'malawi', SGBV: 'algeria', BVC: 'cape-verde',
};

type Row = Record<string, unknown>;

/** Reads the first present field among candidate names (API field names to verify). */
export function pick<T = unknown>(row: Row, ...keys: string[]): T | null {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return null;
}
export function num(row: Row, ...keys: string[]): number | null {
  const v = pick(row, ...keys);
  if (v === null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s,]/g, '').replace('%', ''));
  return Number.isFinite(n) ? n : null;
}
/** Unwraps `{data: [...]}`, `{results: [...]}`, `{stocks: [...]}` or a bare array. */
export function rows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (payload && typeof payload === 'object') {
    for (const k of ['data', 'results', 'stocks', 'items', 'indices', 'rates', 'history']) {
      const v = (payload as Row)[k];
      if (Array.isArray(v)) return v as Row[];
      if (v && typeof v === 'object') { const inner = rows(v); if (inner.length) return inner; }
    }
  }
  return [];
}

export class MansaConnector implements MarketDataConnector {
  readonly id = 'mansa';
  readonly capabilities: ConnectorCapabilities = {
    markets: ['BRVM', 'BVMAC', 'NGX', 'JSE', 'EGX', 'CSE_MA', 'NSE_KE', 'GSE', 'BVMT', 'SEM', 'BSE_BW', 'NSX', 'LUSE', 'DSE', 'USE', 'RSE', 'ZSE', 'MSE'],
    quotes: true, history: true, indices: true, forex: true, dividends: true, bonds: false, ipos: false, realtime: false,
  };
  private cfg: Required<Omit<MansaConfig, 'apiKey' | 'fetch' | 'paths' | 'exchangeCodes'>> & MansaConfig;
  private paths: typeof DEFAULT_PATHS;
  private cache: TtlCache<unknown>;
  private limiter: RateLimiter;

  constructor(config: MansaConfig) {
    // Options explicitly set to undefined (e.g. an unset env var) must not erase the defaults.
    const defined = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v)))) as MansaConfig;
    this.cfg = { baseUrl: 'https://mansaapi.com', authHeader: 'X-API-Key', requestsPerMinute: 30, cacheTtlSec: 900, delayMinutes: 0, ...defined };
    this.paths = { ...DEFAULT_PATHS, ...defined.paths };
    this.cache = new TtlCache(this.cfg.cacheTtlSec * 1000);
    this.limiter = new RateLimiter(this.cfg.requestsPerMinute);
  }

  isEnabled() { return Boolean(this.cfg.apiKey); }

  private exch(m: MarketCode) { return this.cfg.exchangeCodes?.[m] ?? MANSA_EXCHANGE_IDS[m] ?? m.toLowerCase(); }
  private path(tpl: string, m: MarketCode, ticker = '') {
    return tpl.replace('{exchange}', encodeURIComponent(this.exch(m))).replace('{ticker}', encodeURIComponent(ticker));
  }

  private async get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    if (!this.cfg.apiKey) throw new ConnectorError(this.id, 'MANSA_API_KEY manquante');
    const qs = new URLSearchParams(params).toString();
    const url = `${this.cfg.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const cached = this.cache.get(url);
    if (cached !== undefined) return cached;
    await this.limiter.acquire();
    const f = this.cfg.fetch ?? (globalThis.fetch as unknown as FetchLike);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.cfg.authHeader.toLowerCase() === 'authorization') headers.Authorization = `Bearer ${this.cfg.apiKey}`;
    else headers[this.cfg.authHeader] = this.cfg.apiKey;
    const res = await f(url, { headers });
    if (!res.ok) throw new ConnectorError(this.id, `HTTP ${res.status} sur ${path}`, res.status, res.status === 429 || res.status >= 500);
    const body = await res.json();
    this.cache.set(url, body);
    return body;
  }

  /**
   * Mansa returns a scrape timestamp, not a session date. The session is derived from
   * the exchange's local hours: after the close ⇒ that day's close; during the session ⇒
   * delayed (meta.data_freshness = 30 min); before the open ⇒ previous business day's close.
   */
  sessionStatus(market: MarketCode, scrapedAt: string | null) {
    const at = scrapedAt ? new Date(scrapedAt) : new Date();
    const info = MARKETS[market as keyof typeof MARKETS];
    if (!info || Number.isNaN(at.getTime())) return { asOf: (scrapedAt ?? at.toISOString()), status: { kind: 'close' as const, sessionDate: at.toISOString().slice(0, 10) } };
    const { hhmm, date } = localClock(info.timezone, at);
    if (hhmm >= info.close) return { asOf: date, status: { kind: 'close' as const, sessionDate: date } };
    if (hhmm >= info.open) return { asOf: at.toISOString(), status: { kind: 'delayed' as const, delayMinutes: this.cfg.delayMinutes || 30 } };
    const d = new Date(`${date}T12:00:00Z`);
    do d.setUTCDate(d.getUTCDate() - 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    const prev = d.toISOString().slice(0, 10);
    return { asOf: prev, status: { kind: 'close' as const, sessionDate: prev } };
  }

  private provenance(market: MarketCode | null, scrapedAt: string | null, source = 'mansa') {
    const s = market ? this.sessionStatus(market, scrapedAt) : { asOf: scrapedAt ?? new Date().toISOString(), status: { kind: 'close' as const, sessionDate: (scrapedAt ?? new Date().toISOString()).slice(0, 10) } };
    return { source, fetchedAt: new Date().toISOString(), asOf: s.asOf, status: s.status, url: 'https://mansamarkets.com' };
  }

  async listAssets(market: MarketCode): Promise<Asset[]> {
    const data = rows(await this.get(this.path(this.paths.stocks, market), { limit: '500' }));
    const info = MARKETS[market as 'BRVM'];
    return data.map((r) => {
      const ticker = String(pick(r, 'ticker', 'symbol', 'code') ?? '').trim();
      return {
        id: `${market}:${ticker}`,
        ticker,
        isin: pick<string>(r, 'isin'),
        name: String(pick(r, 'name', 'company', 'company_name') ?? ticker),
        market,
        country: String(pick(r, 'country', 'country_code') ?? info?.countries[0] ?? ''),
        sector: pick<string>(r, 'sector', 'industry'),
        currency: (pick<string>(r, 'currency') ?? info?.currency ?? 'USD') as CurrencyCode,
        assetClass: 'equity' as const,
        sharesOutstanding: num(r, 'shares_outstanding', 'sharesOutstanding'),
      };
    }).filter((a) => a.ticker);
  }

  async getQuotes(market: MarketCode): Promise<Quote[]> {
    const data = rows(await this.get(this.path(this.paths.stocks, market), { limit: '500' }));
    return data.flatMap((r) => {
      const ticker = String(pick(r, 'ticker', 'symbol', 'code') ?? '').trim();
      const last = num(r, 'price', 'last', 'close', 'last_price', 'current_price');
      if (!ticker || last === null || last <= 0) return []; // never invent a price
      let change = num(r, 'change');
      let prev = num(r, 'previous_close', 'prev_close', 'previousClose') ?? (change !== null ? last - change : null);
      let changePct = num(r, 'change_pct', 'change_percent', 'changePercent', 'percent_change');
      const computed = prev ? ((last - prev) / prev) * 100 : null;
      if (changePct === null) changePct = computed;
      else if (computed !== null && Math.abs(changePct - computed) > 0.05) {
        // Source contradicts itself (seen live: change −5 900 with change_pct 0): show neither.
        change = null; changePct = null; prev = null;
      }
      return [{
        assetId: `${market}:${ticker}`,
        last,
        previousClose: prev,
        change,
        changePct,
        volume: num(r, 'volume'),
        value: num(r, 'value', 'turnover', 'traded_value'),
        marketCap: num(r, 'market_cap', 'marketCap', 'capitalisation'),
        provenance: this.provenance(market, pick<string>(r, 'scraped_at', 'last_updated', 'updated_at', 'date')),
      }];
    });
  }

  async getHistory(market: MarketCode, ticker: string, from: string, to: string): Promise<Bar[]> {
    const data = rows(await this.get(this.path(this.paths.history, market, ticker), { from, to }));
    return data.flatMap((r) => {
      const date = String(pick(r, 'date', 'day', 'timestamp') ?? '').slice(0, 10);
      const close = num(r, 'close', 'price', 'last');
      if (!date || close === null) return [];
      return [{ date, open: num(r, 'open'), high: num(r, 'high'), low: num(r, 'low'), close, volume: num(r, 'volume') ?? 0, value: num(r, 'value', 'turnover') }];
    }).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getIndices(market?: MarketCode): Promise<IndexQuote[]> {
    const data = rows(await this.get(this.paths.indices));
    const toCode = new Map(Object.entries(MANSA_EXCHANGE_IDS).map(([k, v]) => [v, k as MarketCode]));
    return data.flatMap((r) => {
      const m = toCode.get(String(pick(r, 'market_id', 'exchange') ?? ''));
      const value = num(r, 'index_value', 'value', 'level');
      const name = String(pick(r, 'index_name', 'name', 'code') ?? '');
      if (!m || value === null || !name || (market && m !== market)) return [];
      return [{ code: name, name, market: m, value, changePct: num(r, 'index_change_pct', 'change_pct'), provenance: this.provenance(m, pick<string>(r, 'scraped_at', 'as_of')) }];
    });
  }

  async getForex(): Promise<FxRate[]> {
    const data = rows(await this.get(this.paths.forex));
    return data.flatMap((r) => {
      const quote = String(pick(r, 'quote', 'currency') ?? '');
      const rate = num(r, 'rate');
      if (pick(r, 'base') !== 'USD' || !quote || rate === null || rate <= 0) return [];
      return [{ base: 'USD' as const, quote, rate, provenance: this.provenance(null, pick<string>(r, 'as_of'), `mansa:${pick<string>(r, 'source') ?? 'fx'}`) }];
    });
  }
}

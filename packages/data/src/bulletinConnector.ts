/**
 * Official-bulletin connector: uses the exchange's own daily bulletin (PDF) as a
 * price source. Primary source for BVMAC (no commercial API covers it), and a
 * verification / history source for BRVM and NGX.
 *
 * Locating the bulletin of a given session, two modes (configure one):
 *  - `urlTemplate`: direct URL with placeholders {YYYY} {MM} {DD} {YYYYMMDD} {YYYY-MM-DD}
 *  - `indexUrl` + `linkPattern`: download a listing page (e.g. the exchange's
 *    "bulletins" page) and pick the first link matching `linkPattern`, a regex
 *    source that may contain the same placeholders. Relative links are resolved.
 *
 * The PDF → text step is injected (`extractText`) so the connector runs in Deno
 * (unpdf), Node (tests) or anywhere else.
 */
import type { Asset, Bar, MarketCode, Quote } from '@chart-boursafrikia/core';
import { MARKETS, localClock } from '@chart-boursafrikia/core';
import { parseBulletinText, PROFILES, type BulletinProfile, type BulletinRow } from './bulletin';
import { bulletinDate, parseBrvmBoc, parseBvmacBoc, parseNgxDailyList, type OfficialRow } from './officialBulletins';

/** Real-format readers per market (used unless a generic `profile` is configured). */
const OFFICIAL_PARSERS: Partial<Record<MarketCode, (text: string) => OfficialRow[]>> = { BRVM: parseBrvmBoc, BVMAC: parseBvmacBoc, NGX: parseNgxDailyList };
const toBulletinRow = (r: OfficialRow): BulletinRow => ({ ticker: r.ticker, name: r.name, previousClose: r.previousClose, open: r.open, high: null, low: null, close: r.close, changePct: r.changePct, volume: r.volume, value: r.value });
import { ConnectorError, type ConnectorCapabilities, type FetchLike, type MarketDataConnector } from './connector';

export interface BulletinSourceConfig {
  /** One template, or several alternatives separated by "|" (tried in order, e.g. BRVM file-name variants). */
  urlTemplate?: string;
  indexUrl?: string;
  linkPattern?: string;
  profile?: BulletinProfile;
}

export interface BulletinConnectorConfig {
  sources: Partial<Record<MarketCode, BulletinSourceConfig>>;
  extractText: (pdf: Uint8Array) => Promise<string>;
  fetch?: FetchLike;
  /** Pause between bulletin downloads during history backfill (be polite to the exchange site). */
  backfillDelayMs?: number;
}

export interface BulletinSession {
  market: MarketCode;
  date: string;
  url: string;
  rows: BulletinRow[];
  /** Layout text of the whole document (for extra extractions: calendar, dividends, notices). */
  text?: string;
}

const fill = (tpl: string, date: string) => {
  const [y, m, d] = date.split('-') as [string, string, string];
  return tpl.replaceAll('{YYYY-MM-DD}', date).replaceAll('{YYYYMMDD}', `${y}${m}${d}`)
    .replaceAll('{YYYY}', y).replaceAll('{MM}', m).replaceAll('{DD}', d);
};

/** Business days (Mon–Fri) between two ISO dates, inclusive, ascending. */
export function businessDays(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export class BulletinConnector implements MarketDataConnector {
  readonly id = 'official_bulletin';
  readonly capabilities: ConnectorCapabilities;

  constructor(private cfg: BulletinConnectorConfig) {
    this.capabilities = {
      markets: Object.keys(cfg.sources) as MarketCode[],
      quotes: true, history: true, indices: false, forex: false, dividends: false, bonds: false, ipos: false, realtime: false,
    };
  }

  isEnabled() {
    return Object.values(this.cfg.sources).some((s) => s && (s.urlTemplate || (s.indexUrl && s.linkPattern)));
  }

  private get f(): FetchLike { return this.cfg.fetch ?? (globalThis.fetch as unknown as FetchLike); }

  private source(market: MarketCode): BulletinSourceConfig & { parse: (text: string) => BulletinRow[] } {
    const s = this.cfg.sources[market];
    if (!s || !(s.urlTemplate || (s.indexUrl && s.linkPattern))) throw new ConnectorError(this.id, `bulletin non configuré pour ${market}`);
    const official = OFFICIAL_PARSERS[market];
    if (!s.profile && official) return { ...s, parse: (t) => official(t).map(toBulletinRow) };
    const profile = s.profile ?? PROFILES[market as keyof typeof PROFILES];
    if (!profile) throw new ConnectorError(this.id, `aucun lecteur de bulletin pour ${market}`);
    return { ...s, parse: (t) => parseBulletinText(t, profile) };
  }

  /** Resolves the bulletin URL of a session, or null when it is not (yet) published. */
  async locate(market: MarketCode, date: string): Promise<string | null> {
    return (await this.candidates(market, date))[0] ?? null;
  }

  /** Candidate URLs of a session's bulletin (template alternatives, or the link found on the index page). */
  async candidates(market: MarketCode, date: string): Promise<string[]> {
    const s = this.source(market);
    if (s.urlTemplate) return s.urlTemplate.split('|').map((t) => fill(t.trim(), date));
    const res = await this.f(s.indexUrl!);
    if (!res.ok) throw new ConnectorError(this.id, `page des bulletins ${market} : HTTP ${res.status}`, res.status, res.status >= 500);
    const html = await res.text();
    const re = new RegExp(fill(s.linkPattern!, date), 'i');
    for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
      const href = m[1]!;
      if (re.test(href)) return [new URL(href.replace('https://https://', 'https://'), s.indexUrl).toString()];
    }
    return [];
  }

  /** Downloads and parses one session's bulletin. Returns null if not published (no data is invented). */
  async getSession(market: MarketCode, date: string): Promise<BulletinSession | null> {
    const s = this.source(market);
    for (const url of await this.candidates(market, date)) {
      const res = await this.f(url);
      if (res.status === 404) continue;
      if (!res.ok || !res.arrayBuffer) throw new ConnectorError(this.id, `bulletin ${market} ${date} : HTTP ${res.status}`, res.status, res.status >= 500);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') continue; // "not found" pages served as HTML
      const text = await this.cfg.extractText(bytes);
      const docDate = bulletinDate(market, text);
      if (docDate && docDate !== date) continue; // misfiled document: not this session
      const rows = s.parse(text);
      if (rows.length === 0) throw new ConnectorError(this.id, `bulletin ${market} ${date} : aucune ligne reconnue (format modifié ?)`);
      return { market, date, url, rows, text };
    }
    return null;
  }

  /** Latest session: today (exchange local date), else up to 4 previous business days. */
  async latestSession(market: MarketCode, today?: string): Promise<BulletinSession> {
    const info = MARKETS[market as keyof typeof MARKETS];
    const end = today ?? localClock(info?.timezone ?? 'UTC').date;
    const start = new Date(`${end}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 7);
    const days = businessDays(start.toISOString().slice(0, 10), end).reverse().slice(0, 5);
    for (const d of days) {
      const session = await this.getSession(market, d);
      if (session) return session;
    }
    throw new ConnectorError(this.id, `aucun bulletin ${market} trouvé sur les 5 dernières séances`);
  }

  async getQuotes(market: MarketCode): Promise<Quote[]> {
    const session = await this.latestSession(market);
    return this.toQuotes(session);
  }

  toQuotes(session: BulletinSession): Quote[] {
    const fetchedAt = new Date().toISOString();
    return session.rows.map((r) => ({
      assetId: `${session.market}:${r.ticker}`,
      last: r.close,
      previousClose: r.previousClose,
      change: r.previousClose != null ? r.close - r.previousClose : null,
      changePct: r.changePct ?? (r.previousClose ? ((r.close - r.previousClose) / r.previousClose) * 100 : null),
      volume: r.volume,
      value: r.value,
      marketCap: null,
      provenance: { source: this.id, fetchedAt, asOf: session.date, status: { kind: 'close' as const, sessionDate: session.date }, url: session.url },
    }));
  }

  async listAssets(market: MarketCode): Promise<Asset[]> {
    const session = await this.latestSession(market);
    const info = MARKETS[market as keyof typeof MARKETS];
    return session.rows.map((r) => ({
      id: `${market}:${r.ticker}`, ticker: r.ticker, name: r.name ?? r.ticker, market,
      country: info?.countries[0] ?? '', currency: info?.currency ?? 'XAF', assetClass: 'equity' as const,
    }));
  }

  /**
   * History rebuilt from past bulletins (one download per business day).
   * Sessions without a published bulletin (holidays) are skipped.
   */
  async getHistory(market: MarketCode, ticker: string, from: string, to: string): Promise<Bar[]> {
    const bars: Bar[] = [];
    for (const d of businessDays(from, to)) {
      const s = await this.getSession(market, d).catch(() => null);
      const r = s?.rows.find((x) => x.ticker === ticker);
      if (r) bars.push({ date: d, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0, value: r.value });
      if (this.cfg.backfillDelayMs) await new Promise((res) => setTimeout(res, this.cfg.backfillDelayMs));
    }
    return bars;
  }
}

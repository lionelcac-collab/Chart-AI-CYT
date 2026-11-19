/**
 * Data access. Real mode: Supabase tables (RLS) + edge functions.
 * Demo mode: local fictional data (see demo.ts), clearly labelled in the UI.
 */
import type { MarketCode, ScanPeriod, ScanRow } from '@chart-boursafrikia/core';
import { DEMO_ASSETS, demoDashboard, demoNews, demoScan, demoSheet, demoSummary, demoTrackRecord } from './demo';
import { SNAPSHOT } from './snapshot';
import { IS_DB, dbDashboard, dbScan, dbSearch, dbSheet, snapDashboard, snapScan, snapSearch, snapSheet } from './snapshotApi';
import { DEMO_MODE, supabase } from './supabase';
import type { AiAnalysis, AssetSheet, AssetSummary, Dashboard, NewsItem, TrackRecordRow } from './types';

export class ApiError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); }
}

async function invoke<T>(fn: string, body?: unknown, method: 'POST' | 'GET' = 'POST', query = ''): Promise<T> {
  if (!supabase) throw new ApiError('NO_BACKEND');
  const { data, error } = await supabase.functions.invoke(`${fn}${query}`, { body: body as Record<string, unknown> | undefined, method });
  if (error) {
    // Supabase wraps non-2xx responses: read our {error} payload when present.
    const ctx = (error as { context?: Response }).context;
    const payload = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    if (ctx?.status === 401) throw new ApiError('AUTH_REQUIRED', payload?.error ?? error.message);
    throw new ApiError(payload?.error ?? 'NETWORK', payload?.error ?? error.message);
  }
  return data as T;
}

/** Row of the `market_latest` view (latest verified close per asset). */
const mapLatestRow = (r: Record<string, any>): AssetSummary => ({
  id: r.asset_id, ticker: r.ticker, name: r.name, market: r.market, sector: r.sector ?? null, currency: r.currency,
  last: r.close != null ? Number(r.close) : null, changePct: r.change_pct != null ? Number(r.change_pct) : null,
  volume: r.volume != null ? Number(r.volume) : null, value: r.value != null ? Number(r.value) : null,
  status: { kind: 'close', sessionDate: r.session_date }, source: String(r.source ?? '').startsWith('official_bulletin') ? 'bulletin officiel' : r.source,
  asOf: r.session_date,
});

/** Stocks whose last close is more than 30 days older than the market's latest session (suspended / delisted). */
const dropStale = (rows: AssetSummary[]) => {
  const latest = rows.reduce((m, r) => (r.asOf && r.asOf > m ? r.asOf : m), '');
  const cutoff = latest ? new Date(Date.parse(latest) - 30 * 86400_000).toISOString().slice(0, 10) : '';
  return rows.filter((r) => !r.asOf || r.asOf >= cutoff);
};


export type ImportCandidate = { qtySource?: 'read' | 'value_div_price' | null; assetId: string; ticker: string; name: string; market: string; currency: string; confidence: number; read: string;
  quantity: number | null; costAmount: number | null; costSource: 'total' | 'pru' | 'value_minus_pnl' | null; marketValue: number | null; pnl: number | null;
  lastPrice: number | null; avgCostPrice: number | null; readCurrency: string | null; currencyMismatch: boolean };
export type PortfolioLine = { assetId: string; ticker: string; name: string; market: string; currency: string; quantity: number | null; cost: number | null;
  priceStart: number | null; priceEnd: number | null; returnPct: number | null; valueStart: number | null; valueEnd: number | null; lastDate: string | null;
  weightPct?: number | null; contributionPts?: number | null; pnl?: number | null; pnlPct?: number | null };
export type PortfolioResult = { empty?: boolean; noData?: boolean; mode: 'value' | 'equal'; period: string; start: string; end: string; currency: string;
  series: { date: string; v: number }[];
  summary: { valueStart?: number; valueEnd?: number; change?: number; changePct: number | null; cost?: number | null; pnl?: number | null; pnlPct?: number | null; linesWithCost?: number; linesHeld?: number; indexEnd?: number };
  lines: PortfolioLine[]; fx: { note: string; ngnPerUsd: number | null; asOf: string | null } };

export const api = {
  demo: DEMO_MODE,

  async dashboard(market: MarketCode): Promise<Dashboard> {
    if (SNAPSHOT) return IS_DB ? dbDashboard(market) : snapDashboard(market);
    if (!supabase) return demoDashboard(market);
    const [idx, q, rk, rep] = await Promise.all([
      supabase.from('index_values').select('index_code, name, market, value, change_pct, session_date, source').eq('market', market).order('session_date', { ascending: false }).limit(8),
      supabase.from('market_latest').select('*').eq('market', market),
      supabase.from('rankings').select('items, session_date').eq('scope', market).eq('style', 'overall').order('session_date', { ascending: false }).limit(1).maybeSingle(),
      invoke<{ content: Dashboard['report'] }>('reports', { kind: 'close', market }).catch(() => null),
    ]);
    const seen = new Set<string>();
    const indices = (idx.data ?? []).filter((i) => !seen.has(i.index_code) && seen.add(i.index_code))
      .map((i) => ({ code: i.index_code, name: i.name, market: i.market, value: Number(i.value), changePct: i.change_pct, date: i.session_date, source: i.source }));
    const movers = dropStale((q.data ?? []).map(mapLatestRow));
    const sec = new Map<string, { s: number; n: number }>();
    movers.forEach((m) => { if (!m.sector || m.changePct == null) return; const e = sec.get(m.sector) ?? { s: 0, n: 0 }; e.s += m.changePct; e.n++; sec.set(m.sector, e); });
    return {
      market, indices, movers,
      sectors: [...sec.entries()].map(([sector, v]) => ({ sector, changePct: v.s / v.n, count: v.n })),
      opportunities: (rk.data?.items as Dashboard['opportunities']) ?? [],
      report: rep?.content ?? null,
    };
  },

  async asset(id: string, premiumHint: boolean): Promise<AssetSheet> {
    if (SNAPSHOT) {
      const s = IS_DB ? dbSheet(id, premiumHint) : snapSheet(id);
      if (!s) throw new ApiError('NOT_FOUND');
      return s;
    }
    if (!supabase) {
      const s = demoSheet(id, premiumHint);
      if (!s) throw new ApiError('NOT_FOUND');
      return s;
    }
    return invoke<AssetSheet>('asset', undefined, 'GET', `?id=${encodeURIComponent(id)}`);
  },

  async search(query: string, market?: MarketCode): Promise<AssetSummary[]> {
    const ql = query.trim().toLowerCase();
    if (SNAPSHOT) return IS_DB ? dbSearch(query, market) : snapSearch(query, market);
    if (!supabase) {
      return DEMO_ASSETS.filter((a) => (!market || a.market === market) && (!ql || a.name.toLowerCase().includes(ql) || a.ticker.toLowerCase().includes(ql))).map(demoSummary);
    }
    let req = supabase.from('market_latest').select('*').order('ticker').limit(500);
    if (market) req = req.eq('market', market);
    if (ql) req = req.or(`name.ilike.%${ql}%,ticker.ilike.%${ql}%`);
    const { data, error } = await req;
    if (error) throw new ApiError('NETWORK', error.message);
    return (data ?? []).map(mapLatestRow);
  },

  async analyze(assetId: string, lang: 'fr' | 'en'): Promise<{ content: AiAnalysis; cached: boolean }> {
    if (!supabase) throw new ApiError(SNAPSHOT ? 'NO_AI_YET' : 'DEMO_NO_AI');
    return invoke('analyze', { assetId, lang });
  },

  async chat(messages: { role: 'user' | 'assistant'; content: string }[], lang: 'fr' | 'en', context?: 'portfolio'): Promise<string> {
    if (!supabase) throw new ApiError(SNAPSHOT ? 'NO_AI_YET' : 'DEMO_NO_AI');
    const r = await invoke<{ reply: string }>('chat', { messages, lang, context });
    return r.reply;
  },

  /** Reads stock names / tickers on screenshots and matches them to listed assets (nothing is added yet). */
  async importWatchlistFromImages(images: { base64: string; mediaType: string }[], lang: 'fr' | 'en', message?: string) {
    if (!supabase) throw new ApiError('DEMO_NO_AI');
    return invoke<{ readable: boolean; matched: ImportCandidate[]; unmatched: string[]; totalValue: number | null; totalCurrency: string | null }>('watchlist-import', { images, lang, message });
  },

  async chartVision(imageBase64: string, mediaType: string, lang: 'fr' | 'en') {
    if (!supabase) throw new ApiError('DEMO_NO_AI');
    return invoke<{ content: Record<string, unknown> }>('chart-vision', { imageBase64, mediaType, lang });
  },

  /** Movers + support/resistance distances for a period (precomputed after each session). */
  async scan(market: MarketCode, period: ScanPeriod): Promise<{ rows: ScanRow[]; sessionDate: string | null; unavailable?: 'history' }> {
    if (SNAPSHOT) return IS_DB ? dbScan(market, period) : snapScan(market, period);
    if (!supabase) {
      const rows = demoScan(market, period);
      return { rows, sessionDate: rows[0]?.lastDate ?? null };
    }
    const { data, error } = await supabase.from('market_scans').select('rows, session_date').eq('market', market).eq('period', period)
      .order('session_date', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new ApiError('NETWORK', error.message);
    return { rows: (data?.rows as ScanRow[]) ?? [], sessionDate: data?.session_date ?? null };
  },

  /** Latest classified news, optionally for one market. */
  async news(market?: MarketCode, limit = 30): Promise<NewsItem[]> {
    if (SNAPSHOT) return [];
    if (!supabase) return demoNews(market).slice(0, limit);
    let q = supabase.from('news_asset_links')
      .select('asset_id, assets!inner(market), news_articles!inner(id, title, url, source, published_at, sentiment, materiality, category, summary_fr, summary_en)')
      .order('published_at', { referencedTable: 'news_articles', ascending: false }).limit(limit * 2);
    if (market) q = q.eq('assets.market', market);
    const { data, error } = await q;
    if (error) throw new ApiError('NETWORK', error.message);
    const byId = new Map<number, NewsItem>();
    for (const r of data ?? []) {
      const n = r.news_articles as unknown as NewsItem & { id: number };
      const prev = byId.get(n.id);
      if (prev) prev.asset_ids!.push(r.asset_id);
      else byId.set(n.id, { ...n, asset_ids: [r.asset_id] });
    }
    return [...byId.values()].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).slice(0, limit);
  },

  /** Back-office call (server checks the admin role and journals every action). */
  async admin<T = Record<string, any>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
    if (!supabase) throw new ApiError('NO_BACKEND');
    return invoke<T>('admin', { action, ...body });
  },

  async isAdmin(): Promise<boolean> {
    if (!supabase) return false;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return false;
    const { data } = await supabase.rpc('is_admin', { uid: u.user.id });
    return data === true;
  },

  async trackRecord(): Promise<TrackRecordRow[]> {
    if (!supabase) return SNAPSHOT ? [] : demoTrackRecord;
    const { data } = await supabase.from('public_track_record').select('*').order('scope');
    return (data ?? []) as TrackRecordRow[];
  },

  async watchlist(): Promise<string[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('watchlist_items').select('asset_id, watchlists!inner(position)').order('added_at');
    return (data ?? []).map((r) => r.asset_id);
  },

  /** Optional position details (shares held, amount invested) per watched asset. */
  async positions(): Promise<Record<string, { quantity: number | null; cost: number | null }>> {
    if (!supabase) return {};
    const { data } = await supabase.from('watchlist_items').select('asset_id, quantity, cost_amount');
    return Object.fromEntries((data ?? []).map((r) => [r.asset_id, { quantity: r.quantity == null ? null : Number(r.quantity), cost: r.cost_amount == null ? null : Number(r.cost_amount) }]));
  },

  async updatePosition(assetId: string, quantity: number | null, cost: number | null) {
    if (!supabase) return;
    const { error } = await supabase.from('watchlist_items').update({ quantity, cost_amount: cost }).eq('asset_id', assetId);
    if (error) throw new ApiError('SAVE_FAILED', error.message);
  },

  async portfolio(period: string, currency: string) {
    if (!supabase) throw new ApiError('NO_BACKEND');
    return invoke<PortfolioResult>('portfolio', { period, currency });
  },

  async toggleWatch(assetId: string, on: boolean) {
    if (!supabase) return;
    const { data: wl } = await supabase.from('watchlists').select('id').order('position').limit(1).single();
    if (!wl) throw new ApiError('NO_WATCHLIST');
    if (on) await supabase.from('watchlist_items').upsert({ watchlist_id: wl.id, asset_id: assetId });
    else await supabase.from('watchlist_items').delete().eq('watchlist_id', wl.id).eq('asset_id', assetId);
  },

  async plan(): Promise<'free' | 'premium'> {
    if (!supabase) return 'free';
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return 'free';
    const { data } = await supabase.from('profiles').select('plan, premium_until').eq('id', u.user.id).maybeSingle();
    return data?.plan === 'premium' && (!data.premium_until || new Date(data.premium_until) > new Date()) ? 'premium' : 'free';
  },
};

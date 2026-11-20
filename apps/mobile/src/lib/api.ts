/**
 * Data access. Real mode: Supabase tables (RLS) + edge functions.
 * Demo mode: local fictional data (see demo.ts), clearly labelled in the UI.
 */
import { ACTIVE_MARKETS, type CurrencyCode, type MarketCode, type ScanPeriod, type ScanRow } from '@chart-boursafrikia/core';
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


export type ForecastH = { central: number; pBull: number; pBear: number; pCentral: number; low: number; high: number; bull: number; bear: number };
export type ForecastRow = { assetId: string; asOf: string; name: string; ticker: string; market: string; currency: string; sector: { fr: string; en: string } | null; price: number;
  orientation: 'positive' | 'neutral' | 'negative'; confidence: 'low' | 'medium' | 'high'; confidenceValue: number; invalidation: number | null; illiquid: boolean; analysts: number; horizons: Record<'1M' | '3M' | '6M' | '12M', ForecastH> };
export type ForecastList = { locked: false; rows: ForecastRow[] } | { locked: true; total: number; positive: number; neutral: number; negative: number; asOf: string };
export type ForecastBacktest = { horizon: string; n: number; calls: number; hitRate: number | null; rangeCoverage: number | null; baseRateUp: number | null;
  samples: { date: string; predicted: number; realised: number; inRange: boolean; hit: boolean | null }[] };
export type ForecastReading = { headline: string; horizons: { horizon: string; reading: string }[]; drivers: string[]; risks: string[]; watch: string[]; conclusion: string };
export type AnalystRow = { assetId: string; ticker: string; name: string; market: string; currency: string; price: number | null; priceDate: string | null;
  buy: number | null; hold: number | null; sell: number | null; brokers: string | null; targetMean: number | null; targetMin: number | null; targetMax: number | null;
  referencePrice: number | null; upsidePct: number | null; publishedAt: string; source: string; sourceUrl: string | null; note: string | null; history: { date: string; targetMean: number | null; source: string }[] };
export type ModelPick = { assetId: string; ticker: string; name: string; market: string; asOf: string; orientation: 'positive' | 'neutral' | 'negative'; confidence: string; confidenceValue: number; central12: number | null; pBull12: number | null; pBear12: number | null };
export type ModelConsensus = { totals: { positive: number; neutral: number; negative: number }; asOf: string; count: number; topPositive?: ModelPick[]; topNegative?: ModelPick[] };
export type AnalystsResult = { since: string; totals: { buy: number; hold: number; sell: number }; model?: ModelConsensus } & ({ locked: false; rows: (AnalystRow & { model?: { orientation: 'positive' | 'neutral' | 'negative'; confidence: string } | null })[] } | { locked: true; covered: number });
export type BasketItem = { id: string; asset_id: string; side: 'buy' | 'sell'; quantity: number | null; limit_price: number | null; note: string | null; done: boolean; created_at: string;
  ticker: string; name: string; market: string; currency: string; last: number | null; lastDate: string | null; changePct: number | null };
export type AlertKind = 'price_above' | 'price_below' | 'change_pct' | 'near_support' | 'near_resistance' | 'events';
export type AlertRow = { id: string; asset_id: string | null; kind: AlertKind; threshold: number | null; direction: 'up' | 'down' | 'both'; scope: 'asset' | 'watchlist'; active: boolean;
  last_triggered_at: string | null; created_at: string; assets: { ticker: string; name: string; currency: string } | null };
export type AlertEvent = { id: number; alert_id: string | null; asset_id: string | null; kind: string; session_date: string; title: string; body: string; value: number | null; read_at: string | null; created_at: string };
export type CalendarEvent = { id: number; asset_id: string | null; kind: 'agm' | 'egm' | 'results' | 'dividend' | 'split' | 'rights_issue' | 'suspension' | 'other'; event_date: string;
  title_fr: string | null; title_en: string | null; details: Record<string, any> | null; source: string; source_url: string | null; assets: { ticker: string; name: string; market: string } | null };
export type CapitalOperation = { id: number; market: string | null; kind: 'ipo' | 'bond_issue' | 'rights_issue' | 'delisting' | 'regulator_visa'; issuer: string; title: string; regulator: string | null;
  visa_number: string | null; amount: number | null; currency: string | null; price: number | null; coupon_pct: number | null; subscription_start: string | null; subscription_end: string | null;
  listing_date: string | null; status: string; source: string; source_url: string | null; created_at: string };
export type VirtualTx = { id: string; asset_id: string; side: 'buy' | 'sell' | 'dividend'; quantity: number; price: number; fees: number; executed_on: string; created_at: string };
export type ImportCandidate = { qtySource?: 'read' | 'value_div_price' | null; assetId: string; ticker: string; name: string; market: string; currency: string; confidence: number; read: string;
  quantity: number | null; costAmount: number | null; costSource: 'total' | 'pru' | 'value_minus_pnl' | 'value_div_pnl_pct' | 'own_price_div_pnl_pct' | null; marketValue: number | null; pnl: number | null; pnlPct?: number | null;
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

  /** Markets dashboard for one exchange, or all of them when market is undefined. */
  async dashboard(market?: MarketCode): Promise<Dashboard> {
    if (SNAPSHOT) return IS_DB ? dbDashboard(market ?? 'BRVM') : snapDashboard(market ?? 'BRVM');
    if (!supabase) return demoDashboard(market ?? 'BRVM');
    let idxQ = supabase.from('index_values').select('index_code, name, market, value, change_pct, session_date, source').order('session_date', { ascending: false }).limit(market ? 8 : 24);
    let latQ = supabase.from('market_latest').select('*');
    if (market) { idxQ = idxQ.eq('market', market); latQ = latQ.eq('market', market); }
    const reportMarkets: MarketCode[] = market ? [market] : ([...ACTIVE_MARKETS] as MarketCode[]);
    const [idx, q, rk, repAll] = await Promise.all([
      idxQ, latQ,
      supabase.from('rankings').select('items, session_date').eq('scope', market ?? 'AFRICA').eq('style', 'overall').order('session_date', { ascending: false }).limit(1).maybeSingle(),
      invoke<{ reports: { market: string; content: Dashboard['report'] }[] }>('reports', { kind: 'close', markets: reportMarkets }).catch(() => ({ reports: [] })),
    ]);
    const reps = (repAll as { reports: { market: string; content: Dashboard['report'] }[] }).reports.map((r) => ({ content: r.content }));
    const seen = new Set<string>();
    const indices = (idx.data ?? []).filter((i) => !seen.has(i.index_code) && seen.add(i.index_code))
      .map((i) => ({ code: i.index_code, name: i.name, market: i.market, value: Number(i.value), changePct: i.change_pct, date: i.session_date, source: i.source }));
    const movers = dropStale((q.data ?? []).map(mapLatestRow));
    const sec = new Map<string, { s: number; n: number }>();
    movers.forEach((m) => { if (!m.sector || m.changePct == null) return; const e = sec.get(m.sector) ?? { s: 0, n: 0 }; e.s += m.changePct; e.n++; sec.set(m.sector, e); });
    const reports = reps.map((r, i) => (r?.content ? { ...r.content, title: market ? r.content.title : `${reportMarkets[i]} — ${r.content.title}` } : null)).filter(Boolean) as NonNullable<Dashboard['report']>[];
    return {
      market: (market ?? 'AFRICA') as MarketCode, indices, movers,
      sectors: [...sec.entries()].map(([sector, v]) => ({ sector, changePct: v.s / v.n, count: v.n })),
      opportunities: (rk.data?.items as Dashboard['opportunities']) ?? [],
      report: reports[0] ?? null,
      reports,
    } as Dashboard & { reports: NonNullable<Dashboard['report']>[] };
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
    let req = supabase.from('market_latest').select('*').order('ticker').limit(3000);
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
  async scan(market: MarketCode | undefined, period: ScanPeriod): Promise<{ rows: ScanRow[]; sessionDate: string | null; unavailable?: 'history' }> {
    if (!market) {
      // All exchanges: merge each exchange's latest scan.
      const parts = await Promise.all(([...ACTIVE_MARKETS] as MarketCode[]).map((m) => api.scan(m, period).catch(() => ({ rows: [] as ScanRow[], sessionDate: null }))));
      return { rows: parts.flatMap((x) => x.rows), sessionDate: parts.map((x) => x.sessionDate).filter(Boolean).sort().pop() ?? null };
    }
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
    // Relevant articles about the market (exchange-level) or one of its stocks, newest first.
    let q = supabase.from('news_articles')
      .select('id, title, url, source, published_at, sentiment, materiality, category, summary_fr, summary_en, markets, news_asset_links(asset_id)')
      .eq('relevant', true).order('published_at', { ascending: false }).limit(limit);
    if (market) q = q.contains('markets', [market]);
    const { data, error } = await q;
    if (error) throw new ApiError('NETWORK', error.message);
    return (data ?? []).map((n) => ({ ...(n as unknown as NewsItem), asset_ids: ((n as { news_asset_links?: { asset_id: string }[] }).news_asset_links ?? []).map((l) => l.asset_id) }));
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

  async analysts(months: number, market?: string): Promise<AnalystsResult> { return invoke<AnalystsResult>('analysts', { months, market }); },
  async forecastList(): Promise<ForecastList> { return invoke<ForecastList>('forecasts', { action: 'list' }); },
  async forecastDetail(assetId: string): Promise<{ sessions: number; backtests: ForecastBacktest[] }> { return invoke('forecasts', { action: 'detail', assetId }); },
  async forecastReading(assetId: string, lang: string): Promise<{ content: ForecastReading; cached: boolean; asOf: string }> { return invoke('forecasts', { action: 'explain', assetId, lang }); },

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
  async basket(): Promise<BasketItem[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('trade_basket').select('*').order('created_at');
    if (error) throw new ApiError('LOAD_FAILED', error.message);
    const ids = [...new Set((data ?? []).map((r) => r.asset_id))];
    const { data: px } = ids.length ? await supabase.from('market_latest').select('asset_id, ticker, name, market, currency, close, session_date, change_pct').in('asset_id', ids) : { data: [] };
    const P = new Map((px ?? []).map((p) => [p.asset_id, p]));
    return (data ?? []).map((r) => {
      const p = P.get(r.asset_id);
      return { ...r, quantity: r.quantity == null ? null : Number(r.quantity), limit_price: r.limit_price == null ? null : Number(r.limit_price),
        ticker: p?.ticker ?? r.asset_id.split(':')[1], name: p?.name ?? '', market: p?.market ?? r.asset_id.split(':')[0], currency: p?.currency ?? 'XOF',
        last: p?.close == null ? null : Number(p.close), lastDate: p?.session_date ?? null, changePct: p?.change_pct == null ? null : Number(p.change_pct) } as BasketItem;
    });
  },
  async basketSave(item: { assetId: string; side: 'buy' | 'sell'; quantity: number | null; limitPrice: number | null; note: string | null }) {
    if (!supabase) throw new ApiError('NO_BACKEND');
    const { error } = await supabase.from('trade_basket').upsert({ asset_id: item.assetId, side: item.side, quantity: item.quantity, limit_price: item.limitPrice,
      note: item.note?.trim() || null, done: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id,asset_id,side' });
    if (error) throw new ApiError(error.message.includes('BASKET_LIMIT') ? 'BASKET_LIMIT' : 'SAVE_FAILED', error.message);
  },
  async basketUpdate(id: string, patch: Partial<{ done: boolean; quantity: number | null; limit_price: number | null; note: string | null; side: 'buy' | 'sell' }>) {
    if (!supabase) return;
    const { error } = await supabase.from('trade_basket').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new ApiError('SAVE_FAILED', error.message);
  },
  async basketDelete(ids: string[]) {
    if (!supabase || !ids.length) return;
    const { error } = await supabase.from('trade_basket').delete().in('id', ids);
    if (error) throw new ApiError('SAVE_FAILED', error.message);
  },

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

  /** Latest FX rates (units per 1 USD) for display conversions. */
  /** Investor profile (suitability questionnaire). null when not filled in yet or signed out. */
  async investorProfile(): Promise<{ answers: Record<string, string | string[]>; risk_profile: string; knowledge_level: string; updated_at: string } | null> {
    if (!supabase) return null;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data } = await supabase.from('investor_profiles').select('answers, risk_profile, knowledge_level, updated_at').eq('user_id', u.user.id).maybeSingle();
    return data ?? null;
  },

  async saveInvestorProfile(answers: Record<string, string | string[]>, risk: string, knowledge: string, riskScore: number, knowledgeScore: number) {
    if (!supabase) throw new ApiError('NO_BACKEND');
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new ApiError('AUTH_REQUIRED');
    const { error } = await supabase.from('investor_profiles').upsert({ user_id: u.user.id, answers, risk_profile: risk, knowledge_level: knowledge, risk_score: riskScore, knowledge_score: knowledgeScore, updated_at: new Date().toISOString() });
    if (error) throw new ApiError('SAVE_FAILED', error.message);
  },

  /** Corporate calendar (general meetings, dividend payments) from official bulletins. */
  async calendar(): Promise<CalendarEvent[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('corporate_events').select('id, asset_id, kind, event_date, title_fr, title_en, details, source, source_url, assets(ticker, name, market)').order('event_date', { ascending: true }).limit(1000);
    return (data ?? []) as unknown as CalendarEvent[];
  },

  /** IPOs, bond issues, regulator approvals. */
  async capitalOperations(): Promise<CapitalOperation[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('capital_operations').select('*').order('listing_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }).limit(300);
    return (data ?? []) as CapitalOperation[];
  },

  /** Virtual portfolio (simulation): the user's first portfolio and its transactions. */
  async virtualPortfolio(): Promise<{ id: string; startingCash: number; currency: string; tx: VirtualTx[] } | null> {
    if (!supabase) return null;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    let { data: pf } = await supabase.from('portfolios').select('id, starting_cash, base_currency').order('created_at').limit(1).maybeSingle();
    if (!pf) {
      const ins = await supabase.from('portfolios').insert({ user_id: u.user.id }).select('id, starting_cash, base_currency').single();
      pf = ins.data;
    }
    if (!pf) return null;
    const { data: tx } = await supabase.from('portfolio_transactions').select('id, asset_id, side, quantity, price, fees, executed_on, created_at').eq('portfolio_id', pf.id).order('created_at');
    return { id: pf.id, startingCash: Number(pf.starting_cash), currency: pf.base_currency, tx: (tx ?? []).map((t) => ({ ...t, quantity: Number(t.quantity), price: Number(t.price), fees: Number(t.fees) })) as VirtualTx[] };
  },

  async virtualTrade(portfolioId: string, assetId: string, side: 'buy' | 'sell', quantity: number, price: number) {
    if (!supabase) throw new ApiError('NO_BACKEND');
    const { error } = await supabase.from('portfolio_transactions').insert({ portfolio_id: portfolioId, asset_id: assetId, side, quantity, price, executed_on: new Date().toISOString().slice(0, 10) });
    if (error) throw new ApiError('SAVE_FAILED', error.message);
  },

  async virtualReset(portfolioId: string) {
    if (!supabase) throw new ApiError('NO_BACKEND');
    const { error } = await supabase.from('portfolio_transactions').delete().eq('portfolio_id', portfolioId);
    if (error) throw new ApiError('SAVE_FAILED', error.message);
  },

  // ------------------------------------------------------------------ alerts
  async alerts(): Promise<AlertRow[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('alerts').select('id, asset_id, kind, threshold, direction, scope, active, last_triggered_at, created_at, assets(ticker, name, currency)').order('created_at', { ascending: false });
    return (data ?? []).map((a) => ({ ...a, threshold: a.threshold == null ? null : Number(a.threshold) })) as unknown as AlertRow[];
  },
  async createAlerts(rows: { asset_id: string | null; kind: AlertKind; threshold: number | null; direction?: 'up' | 'down' | 'both'; scope?: 'asset' | 'watchlist' }[]) {
    if (!supabase) throw new ApiError('NO_BACKEND');
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new ApiError('AUTH_REQUIRED');
    const { error } = await supabase.from('alerts').insert(rows.map((r) => ({ user_id: u.user!.id, scope: 'asset', direction: 'both', ...r })));
    if (error) throw new ApiError(/FREE_PLAN_ALERT_LIMIT/.test(error.message) ? 'ALERT_LIMIT' : 'SAVE_FAILED', error.message);
    await invoke('alerts-check', {}).catch(() => null); // immediate check against the latest session
  },
  async setAlertActive(id: string, active: boolean) {
    if (!supabase) return;
    const { error } = await supabase.from('alerts').update({ active }).eq('id', id);
    if (error) throw new ApiError(/FREE_PLAN_ALERT_LIMIT/.test(error.message) ? 'ALERT_LIMIT' : 'SAVE_FAILED', error.message);
  },
  async deleteAlerts(ids: string[]) {
    if (!supabase || !ids.length) return;
    await supabase.from('alerts').delete().in('id', ids);
  },
  async alertEvents(limit = 100): Promise<AlertEvent[]> {
    if (!supabase) return [];
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return [];
    const { data } = await supabase.from('alert_events').select('id, alert_id, asset_id, kind, session_date, title, body, value, read_at, created_at').order('created_at', { ascending: false }).limit(limit);
    return (data ?? []) as AlertEvent[];
  },
  async markAlertEventsRead(ids?: number[]) {
    if (!supabase) return;
    let q = supabase.from('alert_events').update({ read_at: new Date().toISOString() }).is('read_at', null);
    if (ids?.length) q = q.in('id', ids);
    await q;
  },

  async fxRates(): Promise<Partial<Record<CurrencyCode, number>>> {
    if (!supabase) return {};
    const { data } = await supabase.from('fx_rates').select('quote, rate, as_of').in('quote', ['EUR', 'XOF', 'XAF', 'NGN', 'USD']).order('as_of', { ascending: false }).limit(50);
    const out: Partial<Record<CurrencyCode, number>> = {};
    for (const r of data ?? []) if (out[r.quote as CurrencyCode] == null) out[r.quote as CurrencyCode] = Number(r.rate);
    return out;
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

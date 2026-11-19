/**
 * Data access. Real mode: Supabase tables (RLS) + edge functions.
 * Demo mode: local fictional data (see demo.ts), clearly labelled in the UI.
 */
import type { MarketCode, ScanPeriod, ScanRow } from '@nyota/core';
import { DEMO_ASSETS, demoDashboard, demoNews, demoScan, demoSheet, demoSummary, demoTrackRecord } from './demo';
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
    throw new ApiError(payload?.error ?? 'NETWORK', payload?.error ?? error.message);
  }
  return data as T;
}

const mapQuoteRow = (r: Record<string, any>): AssetSummary => ({
  id: r.asset_id, ticker: r.assets?.ticker ?? r.asset_id.split(':')[1], name: r.assets?.name ?? r.asset_id, market: r.asset_id.split(':')[0],
  sector: r.assets?.sectors?.code ?? null, currency: r.assets?.currency ?? 'XOF', last: r.last ?? null, changePct: r.change_pct ?? null,
  volume: r.volume ?? null, value: r.value ?? null,
  status: r.status === 'delayed' ? { kind: 'delayed', delayMinutes: r.delay_minutes ?? 30 } : { kind: 'close', sessionDate: String(r.as_of).slice(0, 10) },
  source: r.source,
});

export const api = {
  demo: DEMO_MODE,

  async dashboard(market: MarketCode): Promise<Dashboard> {
    if (!supabase) return demoDashboard(market);
    const [idx, q, rk, rep] = await Promise.all([
      supabase.from('index_values').select('index_code, name, market, value, change_pct, session_date, source').eq('market', market).order('session_date', { ascending: false }).limit(8),
      supabase.from('quotes_latest').select('*, assets(ticker, name, currency, sectors(code))').like('asset_id', `${market}:%`),
      supabase.from('rankings').select('items, session_date').eq('scope', market).eq('style', 'overall').order('session_date', { ascending: false }).limit(1).maybeSingle(),
      invoke<{ content: Dashboard['report'] }>('reports', { kind: 'close', market }).catch(() => null),
    ]);
    const seen = new Set<string>();
    const indices = (idx.data ?? []).filter((i) => !seen.has(i.index_code) && seen.add(i.index_code))
      .map((i) => ({ code: i.index_code, name: i.name, market: i.market, value: Number(i.value), changePct: i.change_pct, date: i.session_date, source: i.source }));
    const movers = (q.data ?? []).map(mapQuoteRow);
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
    if (!supabase) {
      const s = demoSheet(id, premiumHint);
      if (!s) throw new ApiError('NOT_FOUND');
      return s;
    }
    return invoke<AssetSheet>('asset', undefined, 'GET', `?id=${encodeURIComponent(id)}`);
  },

  async search(query: string, market?: MarketCode): Promise<AssetSummary[]> {
    const ql = query.trim().toLowerCase();
    if (!supabase) {
      return DEMO_ASSETS.filter((a) => (!market || a.market === market) && (!ql || a.name.toLowerCase().includes(ql) || a.ticker.toLowerCase().includes(ql))).map(demoSummary);
    }
    let req = supabase.from('quotes_latest').select('*, assets!inner(ticker, name, currency, isin, market, sectors(code))').limit(200);
    if (market) req = req.eq('assets.market', market);
    if (ql) req = req.or(`name.ilike.%${ql}%,ticker.ilike.%${ql}%,isin.eq.${ql.toUpperCase()}`, { referencedTable: 'assets' });
    const { data, error } = await req;
    if (error) throw new ApiError('NETWORK', error.message);
    return (data ?? []).map(mapQuoteRow);
  },

  async analyze(assetId: string, lang: 'fr' | 'en'): Promise<{ content: AiAnalysis; cached: boolean }> {
    if (!supabase) throw new ApiError('DEMO_NO_AI');
    return invoke('analyze', { assetId, lang });
  },

  async chat(messages: { role: 'user' | 'assistant'; content: string }[], lang: 'fr' | 'en'): Promise<string> {
    if (!supabase) throw new ApiError('DEMO_NO_AI');
    const r = await invoke<{ reply: string }>('chat', { messages, lang });
    return r.reply;
  },

  async chartVision(imageBase64: string, mediaType: string, lang: 'fr' | 'en') {
    if (!supabase) throw new ApiError('DEMO_NO_AI');
    return invoke<{ content: Record<string, unknown> }>('chart-vision', { imageBase64, mediaType, lang });
  },

  /** Movers + support/resistance distances for a period (precomputed after each session). */
  async scan(market: MarketCode, period: ScanPeriod): Promise<{ rows: ScanRow[]; sessionDate: string | null }> {
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

  async trackRecord(): Promise<TrackRecordRow[]> {
    if (!supabase) return demoTrackRecord;
    const { data } = await supabase.from('public_track_record').select('*').order('scope');
    return (data ?? []) as TrackRecordRow[];
  },

  async watchlist(): Promise<string[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('watchlist_items').select('asset_id, watchlists!inner(position)').order('added_at');
    return (data ?? []).map((r) => r.asset_id);
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

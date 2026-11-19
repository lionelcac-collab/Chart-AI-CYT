// Portfolio of a user's watchlist (shared by /portfolio and the assistant's get_my_portfolio tool).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { loadBars } from './sheet.ts';
import { computePortfolio, type Period } from './portfolioCompute.ts';

export type { Period };

export async function loadPortfolio(db: SupabaseClient, userId: string, period: Period, currency: string) {
  const base = ['XOF', 'XAF', 'EUR', 'USD'].includes(currency) ? currency : 'XOF';
  const { data: items } = await db.from('watchlist_items')
    .select('asset_id, quantity, cost_amount, watchlists!inner(user_id), assets!inner(ticker, name, market, currency)')
    .eq('watchlists.user_id', userId);
  const lines = (items ?? []).map((r) => {
    const a = r.assets as unknown as { ticker: string; name: string; market: string; currency: string };
    return { assetId: r.asset_id as string, ticker: a.ticker, name: a.name, market: a.market, currency: a.currency, quantity: r.quantity == null ? null : Number(r.quantity), cost: r.cost_amount == null ? null : Number(r.cost_amount) };
  });
  if (!lines.length) return { empty: true as const };

  // FX: units per USD (latest available).
  const { data: fxRows } = await db.from('fx_rates').select('quote, rate, as_of').order('as_of', { ascending: false }).limit(200);
  const fx = new Map<string, { rate: number; asOf: string }>();
  for (const r of fxRows ?? []) if (!fx.has(r.quote)) fx.set(r.quote, { rate: Number(r.rate), asOf: r.as_of });
  const per = (c: string) => (c === 'XAF' ? fx.get('XOF') ?? fx.get('XAF') : fx.get(c));
  const conv = (v: number, from: string): number | null => {
    if (from === base || (['XOF', 'XAF'].includes(from) && ['XOF', 'XAF'].includes(base))) return v; // FCFA UEMOA = FCFA CEMAC (same EUR parity)
    const a = per(from), b = per(base);
    return a && b ? (v / a.rate) * b.rate : null;
  };

  const years = period === '3Y' ? 3 : period === '1Y' || period === 'YTD' ? 2 : 1;
  const bars = await Promise.all(lines.map((l) => loadBars(db, l.assetId, years).catch(() => [])));
  const res = computePortfolio(lines, bars, period as Period, conv);
  if (!res) return { empty: true as const, noData: true };
  const { mode, start, end: last, series, summary, rows } = res;
  const ngn = fx.get('NGN');
  return {
    mode, period, start, end: last, currency: base, series, summary,
    lines: rows.map(({ costBase: _c, ...r }) => r).sort((a, b) => ((b as { contributionPts?: number | null }).contributionPts ?? -1e9) - ((a as { contributionPts?: number | null }).contributionPts ?? -1e9)),
    fx: { note: 'Conversion au dernier taux disponible, appliqué à tout l’historique.', ngnPerUsd: ngn?.rate ?? null, asOf: ngn?.asOf ?? fx.get(base)?.asOf ?? null, source: 'fx_rates' },
  };
}

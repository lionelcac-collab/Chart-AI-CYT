// POST /portfolio {period, currency} — evolution of the user's watchlist as a portfolio over a period.
// - "value" mode when at least one line has a number of shares: value = Σ shares × adjusted close × FX.
// - "equal" mode otherwise: equal-weighted index (base 100) of the listed stocks.
// Contribution of each line = its gain over the period / portfolio value at the start (in % points).
// FX: latest rate in fx_rates (FCFA XOF/XAF at parity); history converted at that same rate (stated in the response).
import { admin, currentUser, handler, json } from '../_shared/runtime.ts';
import { loadBars } from '../_shared/sheet.ts';
import { computePortfolio, type Period } from './compute.ts';


Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  const { period = '1M', currency = 'XOF' } = (await req.json().catch(() => ({}))) as { period?: Period; currency?: string };
  const base = ['XOF', 'EUR', 'USD'].includes(currency) ? currency : 'XOF';
  const db = admin();

  const { data: items } = await db.from('watchlist_items')
    .select('asset_id, quantity, cost_amount, watchlists!inner(user_id), assets!inner(ticker, name, market, currency)')
    .eq('watchlists.user_id', user.id);
  const lines = (items ?? []).map((r) => {
    const a = r.assets as unknown as { ticker: string; name: string; market: string; currency: string };
    return { assetId: r.asset_id as string, ticker: a.ticker, name: a.name, market: a.market, currency: a.currency, quantity: r.quantity == null ? null : Number(r.quantity), cost: r.cost_amount == null ? null : Number(r.cost_amount) };
  });
  if (!lines.length) return json({ empty: true });

  // FX: units per USD (latest available).
  const { data: fxRows } = await db.from('fx_rates').select('quote, rate, as_of').order('as_of', { ascending: false }).limit(200);
  const fx = new Map<string, { rate: number; asOf: string }>();
  for (const r of fxRows ?? []) if (!fx.has(r.quote)) fx.set(r.quote, { rate: Number(r.rate), asOf: r.as_of });
  const per = (c: string) => (c === 'XAF' ? fx.get('XOF') ?? fx.get('XAF') : fx.get(c));
  const conv = (v: number, from: string): number | null => {
    if (from === base || (['XOF', 'XAF'].includes(from) && base === 'XOF')) return v;
    const a = per(from), b = per(base);
    return a && b ? (v / a.rate) * b.rate : null;
  };

  const years = period === '3Y' ? 3 : period === '1Y' || period === 'YTD' ? 2 : 1;
  const bars = await Promise.all(lines.map((l) => loadBars(db, l.assetId, years).catch(() => [])));
  const res = computePortfolio(lines, bars, period as Period, conv);
  if (!res) return json({ empty: true, noData: true });
  const { mode, start, end: last, series, summary, rows } = res;
  const ngn = fx.get('NGN');
  return json({
    mode, period, start, end: last, currency: base, series, summary,
    lines: rows.map(({ costBase: _c, ...r }) => r).sort((a, b) => ((b as { contributionPts?: number | null }).contributionPts ?? -1e9) - ((a as { contributionPts?: number | null }).contributionPts ?? -1e9)),
    fx: { note: 'Conversion au dernier taux disponible, appliqué à tout l’historique.', ngnPerUsd: ngn?.rate ?? null, asOf: ngn?.asOf ?? fx.get(base)?.asOf ?? null, source: 'fx_rates' },
  });
}));

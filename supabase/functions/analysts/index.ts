// POST /analysts {months?: 3|6|12, market?} — what analysts think (Premium block of the Markets screen).
// Sources: published consensus summaries (analyst_consensus_snapshots) + individual broker notes (analyst_opinions),
// published within the period. Figures are shown as published, with source and date; nothing is estimated here
// except the upside vs the latest verified close. Free: teaser counts only.
import { admin, currentUser, handler, isPremium, json } from '../_shared/runtime.ts';

type Row = {
  assetId: string; ticker: string; name: string; market: string; currency: string; price: number | null; priceDate: string | null;
  buy: number | null; hold: number | null; sell: number | null; brokers: string | null;
  targetMean: number | null; targetMin: number | null; targetMax: number | null; referencePrice: number | null;
  upsidePct: number | null; publishedAt: string; source: string; sourceUrl: string | null; note: string | null;
  history: { date: string; targetMean: number | null; source: string }[];
};

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  const premium = await isPremium(user?.id);
  const { months = 12, market } = (await req.json().catch(() => ({}))) as { months?: number; market?: string };
  const since = new Date(Date.now() - Math.min(Math.max(Number(months) || 12, 1), 24) * 30.44 * 86400_000).toISOString().slice(0, 10);
  const db = admin();

  const [snapRes, opRes] = await Promise.all([
    db.from('analyst_consensus_snapshots').select('*').gte('published_at', since).order('published_at', { ascending: false }),
    db.from('analyst_opinions').select('asset_id, broker, recommendation, target_price, published_at, source_url').gte('published_at', since).order('published_at', { ascending: false }),
  ]);
  if (snapRes.error) throw snapRes.error;
  if (opRes.error) throw opRes.error;
  const snaps = snapRes.data ?? [];
  const ops = opRes.data ?? [];
  const ids = [...new Set([...snaps.map((s) => s.asset_id), ...ops.map((o) => o.asset_id)])].filter(Boolean) as string[];
  const { data: latest } = ids.length ? await db.from('market_latest').select('asset_id, ticker, name, market, currency, close, session_date').in('asset_id', ids) : { data: [] };
  const L = new Map((latest ?? []).map((l) => [l.asset_id, l]));

  const rows: Row[] = [];
  for (const id of ids) {
    const l = L.get(id);
    if (!l || (market && l.market !== market)) continue;
    const price = l.close == null ? null : Number(l.close);
    const mine = snaps.filter((s) => s.asset_id === id);
    // Individual notes: latest per broker in the period.
    const perBroker = new Map<string, (typeof ops)[number]>();
    for (const o of ops.filter((o) => o.asset_id === id)) if (!perBroker.has(o.broker)) perBroker.set(o.broker, o);
    const indiv = [...perBroker.values()];
    const s = mine[0];
    let r: Omit<Row, 'assetId' | 'ticker' | 'name' | 'market' | 'currency' | 'price' | 'priceDate' | 'upsidePct' | 'history'>;
    if (s && (!indiv.length || s.published_at >= indiv[0]!.published_at)) {
      r = { buy: s.n_buy, hold: s.n_hold, sell: s.n_sell, brokers: s.brokers, targetMean: s.target_mean == null ? null : Number(s.target_mean),
        targetMin: s.target_min == null ? null : Number(s.target_min), targetMax: s.target_max == null ? null : Number(s.target_max),
        referencePrice: s.reference_price == null ? null : Number(s.reference_price), publishedAt: s.published_at, source: s.source_name, sourceUrl: s.source_url, note: s.note };
    } else {
      const t = indiv.map((o) => o.target_price).filter((x) => x != null).map(Number);
      r = { buy: indiv.filter((o) => o.recommendation === 'buy').length, hold: indiv.filter((o) => o.recommendation === 'hold').length, sell: indiv.filter((o) => o.recommendation === 'sell').length,
        brokers: indiv.map((o) => o.broker).join(', '), targetMean: t.length ? t.reduce((a, b) => a + b, 0) / t.length : null,
        targetMin: t.length ? Math.min(...t) : null, targetMax: t.length ? Math.max(...t) : null, referencePrice: null,
        publishedAt: indiv[0]!.published_at, source: 'Notes de courtiers', sourceUrl: indiv[0]!.source_url, note: null };
    }
    rows.push({
      assetId: id, ticker: l.ticker, name: l.name, market: l.market, currency: l.currency, price, priceDate: l.session_date, ...r,
      upsidePct: r.targetMean != null && price ? (r.targetMean / price - 1) * 100 : null,
      history: [...mine.map((x) => ({ date: x.published_at, targetMean: x.target_mean == null ? null : Number(x.target_mean), source: x.source_name })),
        ...indiv.map((o) => ({ date: o.published_at, targetMean: o.target_price == null ? null : Number(o.target_price), source: o.broker }))]
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  }
  const totals = rows.reduce((t, r) => ({ buy: t.buy + (r.buy ?? 0), hold: t.hold + (r.hold ?? 0), sell: t.sell + (r.sell ?? 0) }), { buy: 0, hold: 0, sell: 0 });
  if (!premium) return json({ locked: true, covered: rows.length, totals, since });
  return json({ locked: false, since, totals, rows: rows.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) });
}));

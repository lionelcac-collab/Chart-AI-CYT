// Builds the complete "fiche actif" from the database + pure computations of @nyota/core.
// Used by the `asset` endpoint, the AI analysis, the chat tools and the post-close job.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  analystConsensus, computeConsensus, computePerformances, computeRanges, computeRatios, liquidity,
  median, technicalSnapshot, LIQUIDITY_THRESHOLDS, type AnalystOpinion, type Bar, type Fundamentals,
} from './core/index.ts';

export async function loadBars(db: SupabaseClient, assetId: string, years = 3): Promise<Bar[]> {
  const from = new Date();
  from.setUTCFullYear(from.getUTCFullYear() - years);
  from.setUTCDate(from.getUTCDate() - 10);
  const { data, error } = await db.from('price_bars')
    .select('session_date, open, high, low, close, volume, value')
    .eq('asset_id', assetId).gte('session_date', from.toISOString().slice(0, 10))
    .order('session_date', { ascending: true }).limit(2000);
  if (error) throw error;
  return (data ?? []).map((r) => ({ date: r.session_date, open: r.open, high: r.high, low: r.low, close: Number(r.close), volume: Number(r.volume), value: r.value }));
}

export async function buildSheet(db: SupabaseClient, assetId: string) {
  const { data: asset } = await db.from('assets').select('*, sectors(code, name_fr, name_en)').eq('id', assetId).maybeSingle();
  if (!asset) return null;
  const [bars, fundRes, divRes, opRes, newsRes, quoteRes, holdersRes, execRes, eventsRes, peersRes] = await Promise.all([
    loadBars(db, assetId),
    db.from('fundamentals').select('*').eq('asset_id', assetId).eq('period', 'FY').eq('review_status', 'approved').order('fiscal_year'),
    db.from('dividends').select('*').eq('asset_id', assetId).order('ex_date', { ascending: false }).limit(15),
    db.from('analyst_opinions').select('*').eq('asset_id', assetId).order('published_at', { ascending: false }).limit(50),
    db.from('news_asset_links').select('news_articles(id, title, url, source, published_at, sentiment, materiality, summary_fr, summary_en)').eq('asset_id', assetId).limit(30),
    db.from('quotes_latest').select('*').eq('asset_id', assetId).maybeSingle(),
    db.from('asset_shareholders').select('holder, pct, as_of, source').eq('asset_id', assetId),
    db.from('asset_executives').select('person, role, since, source').eq('asset_id', assetId),
    db.from('corporate_events').select('*').eq('asset_id', assetId).gte('event_date', new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10)).order('event_date'),
    db.from('assets').select('id, ticker, name, market').eq('sector_id', asset.sector_id).neq('id', assetId).eq('is_active', true).limit(30),
  ]);
  const { data: documents } = await db.from('source_documents').select('kind, title, url, published_at').eq('asset_id', assetId).order('published_at', { ascending: false }).limit(20);

  const last = bars[bars.length - 1] ?? null;
  const price = last?.close ?? null;
  const fundamentals: Fundamentals[] = (fundRes.data ?? []).map((f) => ({
    fiscalYear: f.fiscal_year, revenue: f.revenue, netIncome: f.net_income, totalEquity: f.total_equity, totalDebt: f.total_debt,
    totalAssets: f.total_assets, operatingCashFlow: f.operating_cash_flow, eps: f.eps, dividendPerShare: f.dividend_per_share,
    bookValuePerShare: f.book_value_per_share,
    provenance: { source: f.source, fetchedAt: f.fetched_at, asOf: `${f.fiscal_year}-12-31`, status: { kind: 'close', sessionDate: `${f.fiscal_year}-12-31` } },
  }));
  const ratios = computeRatios(fundamentals, price);

  // Peers: latest consensus snapshots hold their PER / P/B / yield.
  const peerIds = (peersRes.data ?? []).map((p) => p.id);
  const { data: peerSnaps } = peerIds.length
    ? await db.from('consensus_results').select('asset_id, inputs, as_of').in('asset_id', peerIds).order('as_of', { ascending: false }).limit(200)
    : { data: [] as { asset_id: string; inputs: Record<string, number | null> }[] };
  const seen = new Set<string>();
  const peerRatios = (peerSnaps ?? []).filter((s) => !seen.has(s.asset_id) && seen.add(s.asset_id)).map((s) => s.inputs?.ratios as Record<string, number | null> | undefined).filter(Boolean) as Record<string, number | null>[];
  const med = (k: string) => median(peerRatios.map((r) => r[k]).filter((x): x is number => typeof x === 'number' && x > 0));

  const opinions: AnalystOpinion[] = (opRes.data ?? []).map((o) => ({ broker: o.broker, recommendation: o.recommendation, targetPrice: o.target_price, publishedAt: o.published_at, sourceUrl: o.source_url }));
  const analysts = price ? analystConsensus(opinions, price, last!.date) : null;

  const news = (newsRes.data ?? []).map((n) => n.news_articles as unknown as { published_at: string; sentiment: number | null }).filter(Boolean);
  const recent = news.filter((n) => n.sentiment != null && Date.now() - new Date(n.published_at).getTime() < 30 * 86400_000);
  const wts = recent.map((n) => Math.exp(-(Date.now() - new Date(n.published_at).getTime()) / (10 * 86400_000)));
  const wsum = wts.reduce((s, x) => s + x, 0);
  const sentiment = recent.length ? { score: recent.reduce((s, n, i) => s + (n.sentiment as number) * wts[i]!, 0) / wsum, articles: recent.length } : null;

  const { data: macroRows } = await db.from('macro_series').select('indicator, period, value, source').eq('country', asset.country).order('period', { ascending: false }).limit(30);
  const latestMacro = (ind: string) => macroRows?.find((m) => m.indicator === ind)?.value ?? null;
  const policy = (macroRows ?? []).filter((m) => m.indicator === 'policy_rate');
  const policyChange = policy.length >= 2 ? Number(policy[0]!.value) - Number(policy.find((p) => new Date(p.period) <= new Date(Date.now() - 365 * 86400_000))?.value ?? policy[policy.length - 1]!.value) : null;

  const divs = divRes.data ?? [];
  const yearNow = new Date().getUTCFullYear();
  const yearsPaid = new Set(divs.filter((d) => d.fiscal_year && d.fiscal_year >= yearNow - 5).map((d) => d.fiscal_year)).size;
  const thr = LIQUIDITY_THRESHOLDS[asset.market];

  const consensusInputs = {
    valuation: { per: ratios.per, perPeersMedian: med('per'), pb: ratios.pb, pbPeersMedian: med('pb'), dividendYieldPct: ratios.dividendYieldPct, yieldPeersMedianPct: med('dividendYieldPct') },
    quality: { roePct: ratios.roePct, netMarginPct: ratios.netMarginPct, debtToEquity: ratios.debtToEquity, netIncomeCagr3yPct: ratios.netIncomeCagr3yPct,
      profitableYears5: fundamentals.length ? fundamentals.slice(-5).filter((f) => (f.netIncome ?? 0) > 0).length : null, isBank: asset.sectors?.code === 'banks' },
    dividend: { dividendYieldPct: ratios.dividendYieldPct, yearsPaidOutOf5: divs.length ? yearsPaid : null, payoutPct: ratios.payoutPct },
    sentiment,
    macro: { gdpGrowthPct: latestMacro('gdp_growth'), inflationPct: latestMacro('inflation'), policyRateChange12mPts: policyChange },
    analysts,
    liquidityFloor: thr?.floor, liquidityCap: thr?.cap,
  };
  const consensus = computeConsensus({ bars, ...consensusInputs });

  return {
    asset,
    quote: quoteRes.data,
    lastClose: last ? { price: last.close, date: last.date } : null,
    bars,
    ranges: computeRanges(bars),
    performance: computePerformances(bars),
    liquidity: liquidity(bars, 63, thr?.floor, thr?.cap),
    fundamentals,
    ratios,
    dividends: divs,
    shareholders: holdersRes.data ?? [],
    executives: execRes.data ?? [],
    events: eventsRes.data ?? [],
    peers: peersRes.data ?? [],
    documents: documents ?? [],
    technical: technicalSnapshot(bars),
    news: (newsRes.data ?? []).map((n) => n.news_articles).filter(Boolean),
    analysts,
    consensus,
    consensusInputs: { ...consensusInputs, ratios },
    sources: [...new Set([quoteRes.data?.source, ...fundamentals.map((f) => f.provenance.source)].filter(Boolean))],
  };
}

export type Sheet = NonNullable<Awaited<ReturnType<typeof buildSheet>>>;

/** Free plan: consensus reduced to orientation + confidence + disclaimer (no scenarios / probabilities). */
export function maskForFree(sheet: Sheet) {
  const c = sheet.consensus;
  return {
    ...sheet,
    consensus: c ? {
      orientation: c.orientation, confidence: c.confidence, asOf: c.asOf, modelVersion: c.modelVersion, disclaimer: c.disclaimer,
      analysts: c.analysts ? { count: c.analysts.count } : null, locked: true,
    } : null,
    consensusInputs: undefined,
  };
}

/** Compact JSON given to Claude: only what is needed, every figure dated. */
export function sheetForPrompt(s: Sheet, lang: 'fr' | 'en') {
  return {
    language: lang,
    asset: { id: s.asset.id, name: s.asset.name, ticker: s.asset.ticker, market: s.asset.market, sector: s.asset.sectors?.name_fr, currency: s.asset.currency },
    lastClose: s.lastClose && { ...s.lastClose, source: s.quote?.source ?? 'price_bars' },
    ranges: s.ranges, performance: s.performance, liquidity: s.liquidity,
    technical: s.technical,
    ratios: s.ratios, fundamentalsYears: s.fundamentals.map((f) => ({ year: f.fiscalYear, revenue: f.revenue, netIncome: f.netIncome, source: f.provenance.source })),
    dividends: s.dividends.slice(0, 5).map((d) => ({ amount: d.amount, exDate: d.ex_date, source: d.source })),
    analysts: s.analysts && { count: s.analysts.count, targetMean: s.analysts.targetMean, distribution: s.analysts.distribution, latestAt: s.analysts.latestAt },
    consensus: s.consensus && {
      orientation: s.consensus.orientation, confidence: s.consensus.confidence, invalidationLevel: s.consensus.invalidationLevel,
      forecasts: s.consensus.forecasts, topFactors: s.consensus.topFactors, modelVersion: s.consensus.modelVersion,
    },
    recentNews: s.news.slice(0, 8),
  };
}

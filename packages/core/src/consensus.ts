/**
 * Consensus model — "Consensus Nyota".
 *
 * Part A: analyst consensus (public research notes from SGI / brokers / banks).
 * Part B: in-house quantitative model. Seven factor scores in [-1, 1] are
 * combined with horizon-dependent weights into a composite score S, mapped to
 * an expected log-return, then to a log-normal distribution that yields the
 * bear / central / bull scenarios, their probabilities and an 80 % range.
 *
 * The full formulas are documented in docs/CONSENSUS_MODEL.md. All functions
 * are pure and deterministic so they can be backtested.
 */
import type { AnalystOpinion, Bar, Recommendation } from './types';
import { annualisedVolatility } from './ranges';
import { rsi, sma, supportResistance } from './indicators';
import { liquidity as computeLiquidity, type LiquidityStat } from './liquidity';
import { clamp, median, normCdf, normPdf } from './stats';

// ---------------------------------------------------------------------------
// Part A — analyst consensus
// ---------------------------------------------------------------------------

export interface AnalystConsensus {
  count: number;
  /** Only opinions published within `maxAgeDays` are counted. */
  targetMean: number | null;
  targetMin: number | null;
  targetMax: number | null;
  distribution: Record<Recommendation, number>;
  impliedUpsidePct: number | null;
  latestAt: string | null;
  opinions: AnalystOpinion[];
}

export function analystConsensus(ops: AnalystOpinion[], price: number, asOf: string, maxAgeDays = 365): AnalystConsensus {
  const cutoff = new Date(asOf + 'T00:00:00Z').getTime() - maxAgeDays * 86400_000;
  // keep the most recent opinion per broker
  const latest = new Map<string, AnalystOpinion>();
  for (const o of ops) {
    if (new Date(o.publishedAt).getTime() < cutoff) continue;
    const prev = latest.get(o.broker);
    if (!prev || prev.publishedAt < o.publishedAt) latest.set(o.broker, o);
  }
  const kept = [...latest.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const targets = kept.map((o) => o.targetPrice).filter((t): t is number => t != null && t > 0);
  const mean = targets.length ? targets.reduce((s, x) => s + x, 0) / targets.length : null;
  const distribution: Record<Recommendation, number> = { buy: 0, hold: 0, sell: 0 };
  kept.forEach((o) => distribution[o.recommendation]++);
  return {
    count: kept.length,
    targetMean: mean,
    targetMin: targets.length ? Math.min(...targets) : null,
    targetMax: targets.length ? Math.max(...targets) : null,
    distribution,
    impliedUpsidePct: mean != null && price > 0 ? (mean / price - 1) * 100 : null,
    latestAt: kept[0]?.publishedAt ?? null,
    opinions: kept,
  };
}

// ---------------------------------------------------------------------------
// Part B — factor inputs
// ---------------------------------------------------------------------------

export type FactorKey = 'trend' | 'valuation' | 'quality' | 'dividend' | 'sentiment' | 'macro' | 'analysts';

export interface ValuationInputs {
  per?: number | null; perPeersMedian?: number | null; perOwnMedian5y?: number | null;
  pb?: number | null; pbPeersMedian?: number | null;
  dividendYieldPct?: number | null; yieldPeersMedianPct?: number | null;
}
export interface QualityInputs {
  roePct?: number | null; netMarginPct?: number | null; debtToEquity?: number | null;
  netIncomeCagr3yPct?: number | null; profitableYears5?: number | null; // 0..5
  isBank?: boolean;
}
export interface DividendInputs {
  dividendYieldPct?: number | null; yearsPaidOutOf5?: number | null; payoutPct?: number | null;
}
export interface MacroInputs {
  gdpGrowthPct?: number | null; inflationPct?: number | null;
  /** Change in policy rate over the last 12 months, in percentage points. */
  policyRateChange12mPts?: number | null;
}

export interface ConsensusInputs {
  bars: Bar[];                       // ascending, at least the last ~3 years ideally
  valuation?: ValuationInputs;
  quality?: QualityInputs;
  dividend?: DividendInputs;
  /** Recency-weighted mean of news sentiment scores in [-1, 1] over 30 days. */
  sentiment?: { score: number; articles: number } | null;
  macro?: MacroInputs;
  analysts?: AnalystConsensus | null;
  /** Market liquidity thresholds (local currency / day). */
  liquidityFloor?: number;
  liquidityCap?: number;
}

export interface FactorScore { key: FactorKey; score: number | null; detail: Record<string, number | null> }

const safeLnRatio = (a?: number | null, b?: number | null) =>
  a != null && b != null && a > 0 && b > 0 ? Math.log(a / b) : null;

const meanDefined = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

/** Value of the close `k` sessions before the last, or null. */
const closeAgo = (c: number[], k: number) => (c.length > k ? c[c.length - 1 - k]! : null);

/**
 * Trend & momentum.
 *   m6  = r(6M)  / (σ·√0.5)          risk-adjusted 6-month return
 *   m12 = r(12M→1M) / σ               12-1 momentum (skips last month: reversal)
 *   mom = ( clamp(m6/2) + clamp(m12/2) ) / 2
 *   ma  = ½·sign(P − SMA200) + ½·sign(SMA50 − SMA200)
 *   T   = 0.6·mom + 0.4·ma − 0.2·[RSI>75] + 0.2·[RSI<25]
 */
export function trendFactor(bars: Bar[]): FactorScore {
  const c = bars.map((b) => b.close);
  const n = c.length;
  const sigma = (annualisedVolatility(bars.slice(-252)) ?? 0) / 100;
  if (n < 30 || sigma <= 0) return { key: 'trend', score: null, detail: {} };
  const p = c[n - 1]!;
  const p126 = closeAgo(c, 126), p252 = closeAgo(c, 252), p21 = closeAgo(c, 21);
  const m6 = p126 ? Math.log(p / p126) / (sigma * Math.sqrt(0.5)) : null;
  const m12 = p252 && p21 ? Math.log(p21 / p252) / sigma : null;
  const mom = meanDefined([m6 != null ? clamp(m6 / 2) : null, m12 != null ? clamp(m12 / 2) : null]);
  const s50 = sma(c, 50)[n - 1] ?? null, s200 = sma(c, 200)[n - 1] ?? null;
  let ma: number | null = null;
  if (s200 != null && s50 != null) ma = 0.5 * Math.sign(p - s200) + 0.5 * Math.sign(s50 - s200);
  else if (s50 != null) ma = Math.sign(p - s50);
  const r = rsi(c)[n - 1] ?? null;
  const rsiAdj = r == null ? 0 : r > 75 ? -0.2 : r < 25 ? 0.2 : 0;
  const parts = [mom != null ? 0.6 * mom : null, ma != null ? 0.4 * ma : null];
  const wsum = (mom != null ? 0.6 : 0) + (ma != null ? 0.4 : 0);
  if (wsum === 0) return { key: 'trend', score: null, detail: {} };
  const base = parts.reduce<number>((s, x) => s + (x ?? 0), 0) / wsum;
  return { key: 'trend', score: clamp(base + rsiAdj), detail: { m6, m12, ma, rsi: r, sigma } };
}

/**
 * Relative valuation (cheaper than peers / own history ⇒ positive).
 *   vPER  = clamp( ln(PER_peers / PER) / ln 2 )   (½ weight each vs peers and vs own 5y median)
 *   vPB   = clamp( ln(PB_peers / PB) / ln 2 )
 *   vYld  = clamp( (yield − yield_peers) / max(yield_peers, 1) )
 *   V     = mean(available)
 */
export function valuationFactor(v?: ValuationInputs): FactorScore {
  if (!v) return { key: 'valuation', score: null, detail: {} };
  const ln2 = Math.log(2);
  const perPeers = safeLnRatio(v.perPeersMedian, v.per);
  const perOwn = safeLnRatio(v.perOwnMedian5y, v.per);
  const vPer = meanDefined([perPeers, perOwn]);
  const vPb = safeLnRatio(v.pbPeersMedian, v.pb);
  const vY = v.dividendYieldPct != null && v.yieldPeersMedianPct != null
    ? clamp((v.dividendYieldPct - v.yieldPeersMedianPct) / Math.max(v.yieldPeersMedianPct, 1))
    : null;
  const score = meanDefined([vPer != null ? clamp(vPer / ln2) : null, vPb != null ? clamp(vPb / ln2) : null, vY]);
  return { key: 'valuation', score, detail: { vPer, vPb, vY } };
}

/**
 * Quality.
 *   qROE    = clamp((ROE − 12) / 12)
 *   qMargin = clamp((margin − 8) / 12)        (skipped for banks)
 *   qDebt   = clamp((1 − D/E) / 1.5)          (skipped for banks)
 *   qGrowth = clamp(NI CAGR 3y / 15)
 *   qStab   = (profitable years out of 5 − 3) / 2
 */
export function qualityFactor(q?: QualityInputs): FactorScore {
  if (!q) return { key: 'quality', score: null, detail: {} };
  const qRoe = q.roePct != null ? clamp((q.roePct - 12) / 12) : null;
  const qMargin = !q.isBank && q.netMarginPct != null ? clamp((q.netMarginPct - 8) / 12) : null;
  const qDebt = !q.isBank && q.debtToEquity != null ? clamp((1 - q.debtToEquity) / 1.5) : null;
  const qGrowth = q.netIncomeCagr3yPct != null ? clamp(q.netIncomeCagr3yPct / 15) : null;
  const qStab = q.profitableYears5 != null ? clamp((q.profitableYears5 - 3) / 2) : null;
  return { key: 'quality', score: meanDefined([qRoe, qMargin, qDebt, qGrowth, qStab]), detail: { qRoe, qMargin, qDebt, qGrowth, qStab } };
}

/**
 * Dividend.
 *   dY   = clamp((yield − 4) / 4)
 *   dReg = (years paid of 5 − 2.5) / 2.5
 *   dPay = payout > 100 % ⇒ −0.5 ; payout < 80 % ⇒ +0.2 ; else 0
 */
export function dividendFactor(d?: DividendInputs): FactorScore {
  if (!d) return { key: 'dividend', score: null, detail: {} };
  const dY = d.dividendYieldPct != null ? clamp((d.dividendYieldPct - 4) / 4) : null;
  const dReg = d.yearsPaidOutOf5 != null ? clamp((d.yearsPaidOutOf5 - 2.5) / 2.5) : null;
  const dPay = d.payoutPct != null ? (d.payoutPct > 100 ? -0.5 : d.payoutPct < 80 ? 0.2 : 0) : null;
  const base = meanDefined([dY, dReg]);
  if (base == null) return { key: 'dividend', score: null, detail: {} };
  return { key: 'dividend', score: clamp(base + (dPay ?? 0)), detail: { dY, dReg, dPay } };
}

/** Sentiment: shrunk towards 0 when few articles: S · n/(n+5). */
export function sentimentFactor(s?: { score: number; articles: number } | null): FactorScore {
  if (!s || s.articles === 0) return { key: 'sentiment', score: null, detail: {} };
  return { key: 'sentiment', score: clamp(s.score * (s.articles / (s.articles + 5))), detail: { raw: s.score, articles: s.articles } };
}

/**
 * Macro (country of listing).
 *   mG = clamp((GDP growth − 3) / 3)
 *   mI = clamp((5 − inflation) / 5)
 *   mR = clamp(−Δpolicy rate 12m / 2)
 */
export function macroFactor(m?: MacroInputs): FactorScore {
  if (!m) return { key: 'macro', score: null, detail: {} };
  const mG = m.gdpGrowthPct != null ? clamp((m.gdpGrowthPct - 3) / 3) : null;
  const mI = m.inflationPct != null ? clamp((5 - m.inflationPct) / 5) : null;
  const mR = m.policyRateChange12mPts != null ? clamp(-m.policyRateChange12mPts / 2) : null;
  return { key: 'macro', score: meanDefined([mG, mI, mR]), detail: { mG, mI, mR } };
}

/** Analysts: implied upside mapped to [-1,1] (±30 % ⇒ ±1), shrunk by n/(n+2). */
export function analystsFactor(a?: AnalystConsensus | null): FactorScore {
  if (!a || a.count === 0 || a.impliedUpsidePct == null) return { key: 'analysts', score: null, detail: {} };
  return { key: 'analysts', score: clamp(a.impliedUpsidePct / 30) * (a.count / (a.count + 2)), detail: { upside: a.impliedUpsidePct, count: a.count } };
}

// ---------------------------------------------------------------------------
// Horizons, weights, distribution
// ---------------------------------------------------------------------------

export type Horizon = '1M' | '3M' | '6M' | '12M';
export const HORIZONS: Horizon[] = ['1M', '3M', '6M', '12M'];
export const HORIZON_YEARS: Record<Horizon, number> = { '1M': 1 / 12, '3M': 0.25, '6M': 0.5, '12M': 1 };
export const HORIZON_SESSIONS: Record<Horizon, number> = { '1M': 21, '3M': 63, '6M': 126, '12M': 252 };

/** Short horizons lean on momentum & news, long horizons on value, quality & yield. */
export const WEIGHTS: Record<Horizon, Record<FactorKey, number>> = {
  '1M':  { trend: 0.40, sentiment: 0.20, valuation: 0.08, quality: 0.05, dividend: 0.07, macro: 0.05, analysts: 0.15 },
  '3M':  { trend: 0.30, sentiment: 0.15, valuation: 0.15, quality: 0.10, dividend: 0.08, macro: 0.07, analysts: 0.15 },
  '6M':  { trend: 0.22, sentiment: 0.08, valuation: 0.22, quality: 0.15, dividend: 0.10, macro: 0.08, analysts: 0.15 },
  '12M': { trend: 0.15, sentiment: 0.05, valuation: 0.25, quality: 0.20, dividend: 0.12, macro: 0.08, analysts: 0.15 },
};

export interface ModelParams {
  /**
   * Skill coefficient: expected log-return = alpha · S · σ · √h.
   * 0.2 ≈ an information coefficient of 0.1 for S ∈ [-1,1] (S ≈ z/2).
   * Calibrated by the backtest; never above 0.4.
   */
  alpha: number;
  /** Floor on annualised volatility (illiquid stocks often show artificially low σ). */
  minSigma: number;
}
export const DEFAULT_PARAMS: ModelParams = { alpha: 0.2, minSigma: 0.12 };

export interface Scenario {
  /** Probability in [0, 1]. */
  probability: number;
  /** Representative price (conditional median of the scenario region). */
  price: number;
  returnPct: number;
}

export interface HorizonForecast {
  horizon: Horizon;
  score: number;              // composite S ∈ [-1, 1]
  expectedReturnPct: number;  // central (median) return
  rangeLow: number;           // 10th percentile price
  rangeHigh: number;          // 90th percentile price
  bear: Scenario;
  central: Scenario;
  bull: Scenario;
}

export type Confidence = 'low' | 'medium' | 'high';
export type Orientation = 'positive' | 'neutral' | 'negative';

export interface FactorContribution { key: FactorKey; score: number; weight: number; contribution: number }

export interface ConsensusResult {
  asOf: string;
  price: number;
  orientation: Orientation;
  confidence: Confidence;
  confidenceValue: number;     // 0..1
  invalidationLevel: number | null;
  forecasts: HorizonForecast[];
  factors: FactorScore[];
  topFactors: FactorContribution[];  // for 12M, sorted by |contribution|
  liquidity: LiquidityStat;
  sigma: number;               // annualised, after floor & illiquidity adjustment
  dataCoverage: number;        // share of 12M factor weight with data
  analysts: AnalystConsensus | null;
  modelVersion: string;
  disclaimer: { fr: string; en: string };
}

export const MODEL_VERSION = 'nyota-consensus-1.0.0';
export const DISCLAIMER = {
  fr: 'Estimations statistiques, pas une garantie ni un conseil en investissement.',
  en: 'Statistical estimates, not a guarantee nor investment advice.',
};

export function compositeScore(factors: FactorScore[], horizon: Horizon): { score: number; coverage: number; contributions: FactorContribution[] } {
  const w = WEIGHTS[horizon];
  let num = 0, den = 0, total = 0;
  const contributions: FactorContribution[] = [];
  for (const f of factors) {
    const wi = w[f.key];
    total += wi;
    if (f.score == null) continue;
    num += wi * f.score;
    den += wi;
    contributions.push({ key: f.key, score: f.score, weight: wi, contribution: wi * f.score });
  }
  const score = den > 0 ? num / den : 0;
  contributions.forEach((c) => { c.contribution = den > 0 ? c.contribution / den : 0; });
  return { score, coverage: total > 0 ? den / total : 0, contributions };
}

/** Conditional median-ish representative of a truncated normal region (uses the conditional mean). */
function truncatedMean(mu: number, s: number, a: number | null, b: number | null): number {
  const alpha = a == null ? -Infinity : (a - mu) / s;
  const beta = b == null ? Infinity : (b - mu) / s;
  const Z = normCdf(beta) - normCdf(alpha);
  if (Z < 1e-9) return a ?? b ?? mu;
  const pdfA = Number.isFinite(alpha) ? normPdf(alpha) : 0;
  const pdfB = Number.isFinite(beta) ? normPdf(beta) : 0;
  return mu + s * (pdfA - pdfB) / Z;
}

/**
 * Distribution for one horizon. Log-return X ~ N(μ, s²) with
 *   s = σ·√h,  μ = alpha·S·s  (+ analyst blend at 6M/12M, see docs).
 * Scenarios split X at ±k where k = 0.5·s:
 *   bear: X < −k     central: −k ≤ X ≤ k     bull: X > k
 */
export function horizonForecast(price: number, S: number, sigma: number, horizon: Horizon, params: ModelParams, analysts?: AnalystConsensus | null): HorizonForecast {
  const h = HORIZON_YEARS[horizon];
  const s = sigma * Math.sqrt(h);
  let mu = params.alpha * S * s;
  // Blend with analyst targets (usually 12-month targets) for 6M/12M
  if (analysts && analysts.count > 0 && analysts.targetMean && (horizon === '6M' || horizon === '12M')) {
    const beta = Math.min(0.5, 0.1 * analysts.count) * (horizon === '6M' ? 0.5 : 1);
    const muA = Math.log(analysts.targetMean / price) * h; // pro-rata of a 12M target
    mu = (1 - beta) * mu + beta * clamp(muA, -2 * s, 2 * s);
  }
  const k = 0.5 * s;
  const pBear = normCdf((-k - mu) / s);
  const pBull = 1 - normCdf((k - mu) / s);
  const pCentral = Math.max(0, 1 - pBear - pBull);
  const toScenario = (p: number, x: number): Scenario => ({ probability: p, price: price * Math.exp(x), returnPct: (Math.exp(x) - 1) * 100 });
  const z90 = 1.2815516;
  return {
    horizon,
    score: S,
    expectedReturnPct: (Math.exp(mu) - 1) * 100,
    rangeLow: price * Math.exp(mu - z90 * s),
    rangeHigh: price * Math.exp(mu + z90 * s),
    bear: toScenario(pBear, truncatedMean(mu, s, null, -k)),
    central: toScenario(pCentral, truncatedMean(mu, s, -k, k)),
    bull: toScenario(pBull, truncatedMean(mu, s, k, null)),
  };
}

/**
 * Confidence ∈ [0,1] = coverage · liquidityMult · historyMult · agreement
 *   liquidityMult: high 1 · medium 0.85 · low 0.6 · very_low 0.4
 *   historyMult:   ≥ 504 sessions 1 · ≥ 252 0.85 · else 0.6
 *   agreement:     1 − 0.5 · (share of weight whose factor sign opposes S)
 * Label: ≥ 0.6 high · ≥ 0.35 medium · else low. Capped at medium without fundamentals.
 */
export function confidenceOf(coverage: number, liq: LiquidityStat, sessions: number, contribs: FactorContribution[], S: number, hasFundamentals: boolean): { value: number; label: Confidence } {
  const liqMult = { high: 1, medium: 0.85, low: 0.6, very_low: 0.4 }[liq.level];
  const histMult = sessions >= 504 ? 1 : sessions >= 252 ? 0.85 : 0.6;
  const wTot = contribs.reduce((s, c) => s + c.weight, 0);
  const opposing = contribs.filter((c) => Math.sign(c.score) !== 0 && Math.sign(c.score) !== Math.sign(S)).reduce((s, c) => s + c.weight, 0);
  const agreement = wTot > 0 ? 1 - 0.5 * (opposing / wTot) : 0.5;
  const value = clamp(coverage * liqMult * histMult * agreement, 0, 1);
  let label: Confidence = value >= 0.6 ? 'high' : value >= 0.35 ? 'medium' : 'low';
  if (!hasFundamentals && label === 'high') label = 'medium';
  return { value, label };
}

export function computeConsensus(inp: ConsensusInputs, params: ModelParams = DEFAULT_PARAMS): ConsensusResult | null {
  const bars = inp.bars;
  const last = bars[bars.length - 1];
  if (!last || bars.length < 30) return null; // not enough data: UI shows "donnée insuffisante"
  const price = last.close;

  const liq = computeLiquidity(bars, 63, inp.liquidityFloor, inp.liquidityCap);
  const rawSigma = (annualisedVolatility(bars.slice(-252)) ?? 0) / 100;
  // Illiquid stocks: observed σ underestimates true risk (stale prices) ⇒ inflate.
  const illiqMult = { high: 1, medium: 1.1, low: 1.25, very_low: 1.5 }[liq.level];
  const sigma = Math.max(rawSigma, params.minSigma) * illiqMult;

  const factors: FactorScore[] = [
    trendFactor(bars),
    valuationFactor(inp.valuation),
    qualityFactor(inp.quality),
    dividendFactor(inp.dividend),
    sentimentFactor(inp.sentiment),
    macroFactor(inp.macro),
    analystsFactor(inp.analysts),
  ];

  const forecasts = HORIZONS.map((h) => {
    const { score } = compositeScore(factors, h);
    return horizonForecast(price, score, sigma, h, params, inp.analysts);
  });
  const c12 = compositeScore(factors, '12M');
  const S = c12.score;
  const hasFundamentals = factors.some((f) => (f.key === 'valuation' || f.key === 'quality') && f.score != null);
  const conf = confidenceOf(c12.coverage, liq, bars.length, c12.contributions, S, hasFundamentals);
  const orientation: Orientation = S > 0.15 ? 'positive' : S < -0.15 ? 'negative' : 'neutral';

  // Invalidation: nearest S/R level against the thesis within 2·s(3M), else P·exp(∓1.645·s(3M)).
  const s3 = sigma * Math.sqrt(0.25);
  const levels = supportResistance(bars.slice(-252));
  let invalidationLevel: number | null = null;
  if (orientation === 'positive') {
    const sup = levels.filter((l) => l.kind === 'support').map((l) => l.price).filter((p) => p >= price * Math.exp(-2 * s3));
    invalidationLevel = sup.length ? Math.max(...sup) : price * Math.exp(-1.645 * s3);
  } else if (orientation === 'negative') {
    const res = levels.filter((l) => l.kind === 'resistance').map((l) => l.price).filter((p) => p <= price * Math.exp(2 * s3));
    invalidationLevel = res.length ? Math.min(...res) : price * Math.exp(1.645 * s3);
  }

  return {
    asOf: last.date,
    price,
    orientation,
    confidence: conf.label,
    confidenceValue: conf.value,
    invalidationLevel,
    forecasts,
    factors,
    topFactors: [...c12.contributions].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 5),
    liquidity: liq,
    sigma,
    dataCoverage: c12.coverage,
    analysts: inp.analysts ?? null,
    modelVersion: MODEL_VERSION,
    disclaimer: DISCLAIMER,
  };
}

/** Plain-language explanation of a factor contribution (no imperative wording). */
export function explainFactor(c: FactorContribution, lang: 'fr' | 'en'): string {
  const pos = c.score > 0.1, neg = c.score < -0.1;
  const T: Record<FactorKey, { fr: [string, string, string]; en: [string, string, string] }> = {
    trend: {
      fr: ['La tendance et la dynamique des cours sont favorables.', 'La tendance des cours est défavorable.', 'La tendance des cours est sans direction claire.'],
      en: ['Price trend and momentum are supportive.', 'Price trend is unfavourable.', 'Price trend shows no clear direction.'],
    },
    valuation: {
      fr: ['Le titre paraît peu cher face à ses pairs et à son historique.', 'Le titre paraît cher face à ses pairs et à son historique.', 'La valorisation est proche de celle des pairs.'],
      en: ['The stock looks inexpensive versus peers and its own history.', 'The stock looks expensive versus peers and its own history.', 'Valuation is in line with peers.'],
    },
    quality: {
      fr: ['Les fondamentaux (rentabilité, endettement, régularité) sont solides.', 'Les fondamentaux montrent des faiblesses.', 'La qualité des fondamentaux est moyenne.'],
      en: ['Fundamentals (profitability, leverage, consistency) are solid.', 'Fundamentals show weaknesses.', 'Fundamental quality is average.'],
    },
    dividend: {
      fr: ['Le dividende est attractif et régulier.', 'Le dividende est faible, irrégulier ou peu soutenable.', 'Le dividende est dans la moyenne.'],
      en: ['The dividend is attractive and regular.', 'The dividend is low, irregular or hard to sustain.', 'The dividend is average.'],
    },
    sentiment: {
      fr: ['Les actualités récentes sont plutôt positives.', 'Les actualités récentes sont plutôt négatives.', 'Les actualités récentes sont neutres.'],
      en: ['Recent news flow is mostly positive.', 'Recent news flow is mostly negative.', 'Recent news flow is neutral.'],
    },
    macro: {
      fr: ['Le contexte macroéconomique du pays est porteur.', 'Le contexte macroéconomique du pays pèse.', 'Le contexte macroéconomique est neutre.'],
      en: ['The country’s macro backdrop is supportive.', 'The country’s macro backdrop is a headwind.', 'The macro backdrop is neutral.'],
    },
    analysts: {
      fr: ['Les objectifs des analystes sont au-dessus du cours actuel.', 'Les objectifs des analystes sont sous le cours actuel.', 'Les objectifs des analystes sont proches du cours.'],
      en: ['Analyst targets are above the current price.', 'Analyst targets are below the current price.', 'Analyst targets are close to the current price.'],
    },
  };
  const t = T[c.key][lang];
  return pos ? t[0] : neg ? t[1] : t[2];
}

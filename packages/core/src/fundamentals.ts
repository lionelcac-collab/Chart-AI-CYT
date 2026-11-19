import type { Fundamentals } from './types';

export interface Ratios {
  netMarginPct: number | null;
  roePct: number | null;
  debtToEquity: number | null;
  per: number | null;
  pb: number | null;
  dividendYieldPct: number | null;
  payoutPct: number | null;
  revenueCagr3yPct: number | null;
  netIncomeCagr3yPct: number | null;
}

const div = (a?: number | null, b?: number | null) =>
  a != null && b != null && b !== 0 && Number.isFinite(a / b) ? a / b : null;

export function cagr(first?: number | null, last?: number | null, years?: number): number | null {
  if (first == null || last == null || !years || first <= 0 || last <= 0) return null;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
}

/** `history` sorted ascending by fiscal year; the last element is the latest year. */
export function computeRatios(history: Fundamentals[], price: number | null): Ratios {
  const f = history[history.length - 1];
  const f3 = history.length >= 4 ? history[history.length - 4] : undefined;
  const pct = (x: number | null) => (x == null ? null : x * 100);
  const per = price != null && f?.eps && f.eps > 0 ? price / f.eps : null;
  return {
    netMarginPct: pct(div(f?.netIncome, f?.revenue)),
    roePct: pct(div(f?.netIncome, f?.totalEquity)),
    debtToEquity: div(f?.totalDebt, f?.totalEquity),
    per,
    pb: price != null ? div(price, f?.bookValuePerShare) : null,
    dividendYieldPct: price != null ? pct(div(f?.dividendPerShare, price)) : null,
    payoutPct: pct(div(f?.dividendPerShare, f?.eps)),
    revenueCagr3yPct: cagr(f3?.revenue, f?.revenue, 3),
    netIncomeCagr3yPct: cagr(f3?.netIncome, f?.netIncome, 3),
  };
}

export interface ConsistencyIssue { field: string; message: string }

/**
 * Sanity checks applied to AI-extracted financial statements before they are
 * published. Any issue sends the extraction to the admin review queue.
 */
export function checkFundamentalsConsistency(f: Fundamentals, prev?: Fundamentals): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  if (f.revenue != null && f.revenue < 0) issues.push({ field: 'revenue', message: 'Chiffre d’affaires négatif' });
  if (f.revenue != null && f.netIncome != null && Math.abs(f.netIncome) > Math.abs(f.revenue) * 1.5 && f.revenue > 0) {
    issues.push({ field: 'netIncome', message: 'Résultat net > 150 % du CA : vérifier les unités' });
  }
  if (f.totalAssets != null && f.totalEquity != null && f.totalEquity > f.totalAssets) {
    issues.push({ field: 'totalEquity', message: 'Capitaux propres > total actif' });
  }
  if (prev) {
    for (const k of ['revenue', 'netIncome', 'totalAssets'] as const) {
      const a = prev[k], b = f[k];
      if (a != null && b != null && a !== 0 && Math.abs(b / a) > 50) {
        issues.push({ field: k, message: `Variation x${Math.round(Math.abs(b / a))} vs N-1 : erreur d’unité probable (milliers/millions)` });
      }
    }
  }
  if (f.dividendPerShare != null && f.eps != null && f.eps > 0 && f.dividendPerShare > f.eps * 3) {
    issues.push({ field: 'dividendPerShare', message: 'Dividende > 3x BPA' });
  }
  return issues;
}

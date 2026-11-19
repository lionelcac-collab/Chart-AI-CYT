import type { Bar, MarketCode, Quote } from '@chart-boursafrikia/core';

export type AnomalyKind = 'price_jump' | 'non_positive' | 'source_divergence' | 'stale' | 'volume_spike' | 'ohlc_inconsistent';

export interface Anomaly {
  assetId: string;
  kind: AnomalyKind;
  severity: 'warn' | 'block';
  message: string;
  details?: Record<string, number | string | null>;
}

/**
 * Daily price-variation limits. BRVM: ±7.5 % per session (rulebook);
 * BVMAC and NGX: limits to be confirmed per rulebook — conservative defaults.
 * A move beyond the limit is either a corporate action (split, dividend
 * detachment) or a data error ⇒ blocked until checked against the bulletin.
 */
export const DAILY_LIMIT_PCT: Partial<Record<MarketCode, number>> = { BRVM: 7.5, BVMAC: 10, NGX: 10 };

export function validateQuote(q: Quote, market: MarketCode, opts: { maxAgeDays?: number; today?: string } = {}): Anomaly[] {
  const out: Anomaly[] = [];
  if (!(q.last > 0)) out.push({ assetId: q.assetId, kind: 'non_positive', severity: 'block', message: 'Cours nul ou négatif' });
  const limit = DAILY_LIMIT_PCT[market];
  if (limit && q.previousClose && q.previousClose > 0) {
    const pct = ((q.last - q.previousClose) / q.previousClose) * 100;
    if (Math.abs(pct) > limit + 0.05) {
      out.push({ assetId: q.assetId, kind: 'price_jump', severity: 'block', message: `Variation ${pct.toFixed(2)} % au-delà de la limite ±${limit} %`, details: { pct, limit } });
    }
  }
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const maxAge = opts.maxAgeDays ?? 5;
  const age = (Date.parse(today) - Date.parse(q.provenance.asOf.slice(0, 10))) / 86400_000;
  if (Number.isFinite(age) && age > maxAge) {
    out.push({ assetId: q.assetId, kind: 'stale', severity: 'warn', message: `Dernière cotation il y a ${Math.round(age)} jours` });
  }
  return out;
}

export function validateBar(assetId: string, b: Bar): Anomaly[] {
  const out: Anomaly[] = [];
  if (b.high != null && b.low != null && (b.high < b.low || b.close > b.high * 1.0001 || b.close < b.low * 0.9999)) {
    out.push({ assetId, kind: 'ohlc_inconsistent', severity: 'warn', message: `OHLC incohérent le ${b.date}` });
  }
  if (!(b.close > 0)) out.push({ assetId, kind: 'non_positive', severity: 'block', message: `Clôture invalide le ${b.date}` });
  return out;
}

/** Cross-check primary vs bulletin (or fallback) closes: divergence > tolerance ⇒ block + admin alert. */
export function crossCheck(primary: Quote[], reference: { assetId: string; close: number }[], tolerancePct = 0.5): Anomaly[] {
  const ref = new Map(reference.map((r) => [r.assetId, r.close]));
  const out: Anomaly[] = [];
  for (const q of primary) {
    const r = ref.get(q.assetId);
    if (r === undefined || r <= 0) continue;
    const diff = ((q.last - r) / r) * 100;
    if (Math.abs(diff) > tolerancePct) {
      out.push({ assetId: q.assetId, kind: 'source_divergence', severity: 'block', message: `Écart ${diff.toFixed(2)} % entre ${q.provenance.source} et la référence`, details: { primary: q.last, reference: r } });
    }
  }
  return out;
}

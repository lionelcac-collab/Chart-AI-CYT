import type { Bar } from './types';

export interface LiquidityStat {
  /** Average daily volume (shares) over the window, including zero days. */
  avgVolume: number;
  /** Average daily traded value (local currency), null if values unknown. */
  avgValue: number | null;
  /** Sessions in the window with zero volume. */
  zeroVolumeSessions: number;
  sessions: number;
  /** 0–100. Combines trading frequency (60 %) and traded value depth (40 %). */
  score: number;
  level: 'high' | 'medium' | 'low' | 'very_low';
  /** True → UI must show an illiquidity warning. */
  warning: boolean;
}

/**
 * Liquidity score.
 *   frequency = 1 - zeroDays / sessions
 *   depth     = clamp(log10(avgValue / valueFloor) / log10(valueCap / valueFloor), 0, 1)
 *   score     = 100 · (0.6 · frequency + 0.4 · depth)
 * `valueFloor`/`valueCap` are expressed in local currency and should be set per
 * market (defaults suit FCFA: 1 M → 500 M FCFA per day).
 */
export function liquidity(bars: Bar[], window = 63, valueFloor = 1e6, valueCap = 5e8): LiquidityStat | null {
  const w = bars.slice(-window);
  const sessions = w.length;
  if (sessions === 0) {
    return { avgVolume: 0, avgValue: null, zeroVolumeSessions: 0, sessions: 0, score: 0, level: 'very_low', warning: true };
  }
  // Volume not published by the source (e.g. NGX official list): liquidity is unknown, not zero.
  const known = w.filter((b) => b.volume != null);
  if (known.length < sessions / 2) return null;
  const zero = known.filter((b) => !b.volume).length;
  const avgVolume = known.reduce((s, b) => s + (b.volume || 0), 0) / known.length;
  const values = known.map((b) => (b.value != null ? b.value : (b.volume ?? 0) * b.close));
  const avgValue = values.reduce((s, v) => s + v, 0) / known.length;
  const frequency = 1 - zero / known.length;
  const depth = avgValue > 0
    ? Math.min(1, Math.max(0, Math.log10(avgValue / valueFloor) / Math.log10(valueCap / valueFloor)))
    : 0;
  const score = Math.round(100 * (0.6 * frequency + 0.4 * depth));
  const level = score >= 70 ? 'high' : score >= 45 ? 'medium' : score >= 25 ? 'low' : 'very_low';
  return { avgVolume, avgValue, zeroVolumeSessions: zero, sessions: known.length, score, level, warning: level === 'low' || level === 'very_low' };
}

/** Per-market liquidity thresholds (local currency per day). */
export const LIQUIDITY_THRESHOLDS: Record<string, { floor: number; cap: number }> = {
  BRVM: { floor: 1e6, cap: 5e8 },      // FCFA
  BVMAC: { floor: 1e5, cap: 1e8 },     // FCFA, much thinner market
  NGX: { floor: 1e6, cap: 2e9 },       // NGN
};

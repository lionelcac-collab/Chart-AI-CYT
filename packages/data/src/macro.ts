/**
 * Macro sources.
 * - World Bank Indicators API v2 (public, no key): https://api.worldbank.org/v2
 * - IMF DataMapper API (public, no key): https://www.imf.org/external/datamapper/api/v1
 * - BCEAO / BEAC policy rates: published as press releases → stored manually or
 *   extracted by the AI pipeline into `macro_series` (source = 'bceao' | 'beac').
 */
import type { FetchLike } from './connector';

export interface MacroPoint { country: string; indicator: string; year: number; value: number; source: string; fetchedAt: string }

export const WB_INDICATORS = {
  gdpGrowth: 'NY.GDP.MKTP.KD.ZG',
  inflation: 'FP.CPI.TOTL.ZG',
  gdpUsd: 'NY.GDP.MKTP.CD',
} as const;

export async function worldBankSeries(country: string, indicator: string, fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike, years = 10): Promise<MacroPoint[]> {
  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=${years}&mrv=${years}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`World Bank HTTP ${res.status}`);
  const body = (await res.json()) as [unknown, { date: string; value: number | null }[] | null];
  const fetchedAt = new Date().toISOString();
  return (body?.[1] ?? [])
    .filter((p) => p.value !== null)
    .map((p) => ({ country, indicator, year: Number(p.date), value: p.value as number, source: 'worldbank', fetchedAt }))
    .sort((a, b) => a.year - b.year);
}

/** IMF WEO via DataMapper: e.g. indicator 'NGDP_RPCH' (real GDP growth), 'PCPIPCH' (inflation). ISO-3 country codes. */
export async function imfSeries(iso3: string, indicator: string, fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike): Promise<MacroPoint[]> {
  const res = await fetchImpl(`https://www.imf.org/external/datamapper/api/v1/${indicator}/${iso3}`);
  if (!res.ok) throw new Error(`IMF HTTP ${res.status}`);
  const body = (await res.json()) as { values?: Record<string, Record<string, Record<string, number>>> };
  const series = body.values?.[indicator]?.[iso3] ?? {};
  const fetchedAt = new Date().toISOString();
  return Object.entries(series).map(([y, v]) => ({ country: iso3, indicator, year: Number(y), value: v, source: 'imf', fetchedAt }))
    .sort((a, b) => a.year - b.year);
}

import { convert, formatMoney, type CurrencyCode, type DataStatus } from '@nyota/core';
import type { Lang } from '../settings';

const nf = (lang: Lang, digits = 2) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtNum(v: number | null | undefined, lang: Lang, digits = 2, unavailable = '—'): string {
  return v == null || !Number.isFinite(v) ? unavailable : nf(lang, digits).format(v);
}

export function fmtPct(v: number | null | undefined, lang: Lang, digits = 2, signed = true): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = nf(lang, digits).format(v);
  return `${signed && v > 0 ? '+' : ''}${s} %`.replace(' %', lang === 'fr' ? ' %' : '%');
}

export function fmtCompact(v: number | null | undefined, lang: Lang): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

export function fmtDate(iso: string | null | undefined, lang: Lang, withYear = true): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: '2-digit', ...(withYear ? { year: 'numeric' } : {}) });
}

/** Price in local currency, optionally converted (XOF/XAF ↔ EUR via the fixed parity; others need FX rates). */
export function fmtPrice(v: number | null | undefined, currency: CurrencyCode, lang: Lang, display: 'local' | CurrencyCode = 'local', usdRates?: Partial<Record<CurrencyCode, number>>): string {
  if (v == null) return lang === 'fr' ? 'Donnée indisponible' : 'Data unavailable';
  if (display !== 'local' && display !== currency) {
    const c = convert(v, currency, display, usdRates);
    if (c != null) return formatMoney(c, display, lang);
  }
  return formatMoney(v, currency, lang);
}

export function statusLabel(s: DataStatus | null | undefined, lang: Lang): string {
  if (!s || s.kind === 'unavailable') return lang === 'fr' ? 'Donnée indisponible' : 'Data unavailable';
  if (s.kind === 'close') return `${lang === 'fr' ? 'Clôture du' : 'Close of'} ${fmtDate(s.sessionDate, lang, false)}`;
  if (s.kind === 'delayed') return lang === 'fr' ? `Différé ~${s.delayMinutes} min` : `Delayed ~${s.delayMinutes} min`;
  return lang === 'fr' ? 'Temps réel' : 'Real time';
}

/**
 * Label for a datum timestamped by its source. A full timestamp (source scrape time) is shown as is,
 * "Relevé du JJ/MM à HH:MM UTC", rather than guessing whether it is a close or a delayed price.
 */
export function asOfLabel(asOf: string | null | undefined, status: DataStatus | null | undefined, lang: Lang): string {
  if (asOf && asOf.includes('T')) {
    const d = new Date(asOf);
    if (!Number.isNaN(d.getTime())) {
      const hm = d.toISOString().slice(11, 16);
      return lang === 'fr' ? `Relevé du ${fmtDate(asOf, lang, false)} à ${hm} UTC` : `Captured ${fmtDate(asOf, lang, false)} at ${hm} UTC`;
    }
  }
  return statusLabel(status, lang);
}

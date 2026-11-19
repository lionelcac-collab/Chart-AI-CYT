import type { CurrencyCode } from './types';

/** Fixed CFA franc parity (BCEAO / BEAC): 1 EUR = 655.957 XOF = 655.957 XAF. */
export const CFA_PER_EUR = 655.957;

export const FIXED_EUR_PEGS: Partial<Record<CurrencyCode, number>> = {
  XOF: CFA_PER_EUR,
  XAF: CFA_PER_EUR,
  EUR: 1,
};

/**
 * Converts an amount between currencies.
 * - XOF/XAF <-> EUR uses the legal fixed parity (no market data needed).
 * - Anything else requires a dated FX rate table (units of currency per 1 USD),
 *   e.g. from the Mansa forex endpoint. Returns null when a rate is missing:
 *   callers must then display "donnée indisponible" rather than a guess.
 */
export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  usdRates?: Partial<Record<CurrencyCode, number>>,
): number | null {
  if (from === to) return amount;
  const pegFrom = FIXED_EUR_PEGS[from];
  const pegTo = FIXED_EUR_PEGS[to];
  if (pegFrom !== undefined && pegTo !== undefined) {
    return (amount / pegFrom) * pegTo;
  }
  // Route through USD. For pegged currencies derive the USD rate from EUR/USD.
  const perUsd = (c: CurrencyCode): number | undefined => {
    if (c === 'USD') return 1;
    const direct = usdRates?.[c];
    if (direct !== undefined) return direct;
    const peg = FIXED_EUR_PEGS[c];
    const eurPerUsd = usdRates?.EUR;
    if (peg !== undefined && eurPerUsd !== undefined) return peg * eurPerUsd;
    return undefined;
  };
  const rf = perUsd(from);
  const rt = perUsd(to);
  if (rf === undefined || rt === undefined || rf === 0) return null;
  return (amount / rf) * rt;
}

export function formatMoney(amount: number | null | undefined, currency: CurrencyCode, locale: 'fr' | 'en' = 'fr'): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return locale === 'fr' ? 'Donnée indisponible' : 'Data unavailable';
  }
  const noDecimals = currency === 'XOF' || currency === 'XAF';
  const formatted = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: noDecimals ? 0 : 2,
    maximumFractionDigits: noDecimals ? 0 : 2,
  }).format(amount);
  const label = currency === 'XOF' || currency === 'XAF' ? 'FCFA' : currency;
  return `${formatted} ${label}`;
}

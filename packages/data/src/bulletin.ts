/**
 * Official daily bulletins (BOC BRVM, BVMAC bulletin, NGX daily price list).
 *
 * The edge function downloads the PDF from the exchange's public site after the
 * session, extracts the text (pdf text layer; Claude Haiku document input as
 * fallback for scanned PDFs) and passes it here. Parsing is rule-based so it is
 * deterministic and auditable; the AI is only a fallback and its output goes
 * through the same validation.
 *
 * Layouts change: each market has a profile (regex + column order). Profiles
 * must be checked against a few real bulletins before go-live — the defaults
 * below match the typical "TICKER  Name  Prev  Open  High  Low  Close  Var%  Volume  Value" row.
 */
import type { MarketCode } from '@chart-boursafrikia/core';

export interface BulletinRow {
  ticker: string;
  name: string | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  changePct: number | null;
  volume: number | null;
  value: number | null;
}

export interface BulletinProfile {
  market: MarketCode;
  /** Columns after ticker+name, in order. */
  columns: (keyof Omit<BulletinRow, 'ticker' | 'name'>)[];
  tickerPattern: RegExp;     // must match the first token
  /** French bulletins use spaces as thousand separators and commas as decimal marks. */
  decimalComma: boolean;
}

export const PROFILES: Record<'BRVM' | 'BVMAC' | 'NGX', BulletinProfile> = {
  BRVM: { market: 'BRVM', columns: ['previousClose', 'open', 'high', 'low', 'close', 'changePct', 'volume', 'value'], tickerPattern: /^[A-Z]{3,6}$/, decimalComma: true },
  BVMAC: { market: 'BVMAC', columns: ['previousClose', 'close', 'changePct', 'volume', 'value'], tickerPattern: /^[A-Z]{3,8}$/, decimalComma: true },
  NGX: { market: 'NGX', columns: ['previousClose', 'open', 'high', 'low', 'close', 'changePct', 'volume', 'value'], tickerPattern: /^[A-Z0-9]{2,12}$/, decimalComma: false },
};

/** Parses one numeric token; "-" or "—" ⇒ null. */
export function parseNumber(tok: string, decimalComma: boolean): number | null {
  const t = tok.trim().replace(/%$/, '');
  if (t === '' || t === '-' || t === '—' || t === 'N/A') return null;
  let s = t.replace(/ | /g, '');
  s = decimalComma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Splits a text line into tokens. French bulletins write "12 500" (space as
 * thousands separator): numbers are re-joined when a token of exactly 3 digits
 * follows a numeric token. Names (non-numeric tokens) are kept together.
 */
export function tokenize(line: string, decimalComma: boolean): string[] {
  const raw = line.trim().split(/\s{1,}/);
  const out: string[] = [];
  const isNum = (s: string) => /^[+-]?[\d.,]+%?$/.test(s) || s === '-';
  for (const tok of raw) {
    const prev = out[out.length - 1];
    if (decimalComma && prev && /^\d{3}(,\d+)?%?$/.test(tok) && /^[+-]?\d{1,3}( \d{3})*$/.test(prev)) {
      out[out.length - 1] = `${prev} ${tok}`;
    } else out.push(tok);
  }
  return out.map((t) => (isNum(t.replace(/ /g, '')) ? t.replace(/ /g, '') : t));
}

export function parseBulletinText(text: string, profile: BulletinProfile): BulletinRow[] {
  const rows: BulletinRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const toks = tokenize(line, profile.decimalComma);
    if (toks.length < profile.columns.length + 1) continue;
    const ticker = toks[0]!;
    if (!profile.tickerPattern.test(ticker)) continue;
    const nums = toks.slice(-profile.columns.length);
    const name = toks.slice(1, toks.length - profile.columns.length).join(' ') || null;
    const values = nums.map((t) => parseNumber(t, profile.decimalComma));
    const row: Partial<BulletinRow> = { ticker, name };
    profile.columns.forEach((c, i) => { (row as Record<string, number | null>)[c] = values[i] ?? null; });
    if (row.close == null || !(row.close > 0)) continue;
    rows.push(row as BulletinRow);
  }
  return rows;
}

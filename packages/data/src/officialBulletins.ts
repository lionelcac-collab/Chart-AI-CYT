/**
 * Readers for the official daily bulletins, tuned on real PDFs (text extracted with
 * `pdftotext -layout` or unpdf), checked on 2022–2026 files.
 *
 *  BRVM  "Bulletin Officiel de la Cote"   https://www.brvm.org/sites/default/files/boc_YYYYMMDD[_2|_1|_2_0].pdf
 *        columns: prev close · open · close · change % · volume · value · reference · YTD % · last dividend…
 *  BVMAC "Bulletin Officiel de la Cote"   listed on https://www.bvm-ac.org/bulletin-officiel-de-la-cote-boc/
 *        rows anchored on the ISIN; open/close follow the quotation status (NC, PEq…)
 *  NGX   "Daily Official List – Equities" https://doclib.ngxgroup.com/DownloadsContent/Daily%20Official%20List%20-%20Equities%20for%20DD-MM-YYYY.pdf
 *        close = "Current Market Price" column (read by column position); no reliable volume
 *
 * Every function returns only what the document states; missing values are null.
 */

export interface OfficialRow {
  ticker: string;
  name: string | null;
  isin?: string | null;
  previousClose: number | null;
  open: number | null;
  close: number;
  changePct: number | null;
  volume: number | null;
  value: number | null;
}

/** "12 500" / "12 500,50" / "-0,84 %" → number (French formatting). */
export function frNum(s: string | undefined | null): number | null {
  if (s == null) return null;
  const t = s.replace(/[\s  %]/g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '—') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const FR = String.raw`\d{1,3}(?: \d{3})*(?:,\d+)?`;
const PCT = String.raw`-?\d{1,3}(?: \d{3})*,\d+ ?%`;

/** BRVM equities. Line: [sector] TICKER  NAME  prev  open  close  var%  volume  value  reference … */
export function parseBrvmBoc(text: string): OfficialRow[] {
  const re = new RegExp(String.raw`^\s*(?:[A-Z]{2,4}\s+)?([A-Z]{4,6})\s{2,}(\S.*?)\s{2,}(${FR})\s+(${FR})\s+(${FR})\s+(${PCT})\s+(${FR})\s+(${FR})`);
  const out: OfficialRow[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (/TOTAL|COMPARTIMENT|INDICE|BRVM/.test(line.slice(0, 40))) continue;
    const m = line.match(re);
    if (!m) continue;
    const [, ticker, name, prev, open, close, pct, vol, val] = m;
    // Bond lines have a dot in the code (SNTS.O2) and are excluded by the ticker pattern.
    const c = frNum(close);
    if (!ticker || c == null || c <= 0 || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push({ ticker, name: name!.trim().replace(/''/g, "'").replace(/\s+/g, ' '), previousClose: frNum(prev), open: frNum(open), close: c, changePct: frNum(pct), volume: frNum(vol), value: frNum(val) });
  }
  return out;
}

/**
 * Splits space-separated digit groups ("206","720","206","720",…) into `n` prices, each within ±50 % of
 * `ref`. Groups after the first of a number must have exactly 3 digits. Returns null when no split fits.
 */
export function splitPrices(groups: string[], n: number, ref: number): number[] | null {
  const ok = (v: number) => v >= ref * 0.5 && v <= ref * 1.5;
  const rec = (i: number, left: number): number[] | null => {
    if (left === 0) return i === groups.length ? [] : null;
    for (let len = 1; len <= 4 && i + len <= groups.length; len++) {
      const part = groups.slice(i, i + len);
      if (part.slice(1).some((g) => !/^\d{3}(,\d+)?$/.test(g))) break;
      const v = frNum(part.join(' '));
      if (v == null || !ok(v)) continue;
      const rest = rec(i + len, left - 1);
      if (rest) return [v, ...rest];
    }
    return null;
  };
  return rec(0, n);
}

/** Canonical BVMAC tickers by ISIN (aligned with Mansa's codes). */
export const BVMAC_TICKERS: Record<string, string> = {
  CM0000010009: 'SEMC', CM0000010017: 'SAFACAM', CM0000010025: 'SOCAPALM', CM0000010041: 'REGIONALE',
  GQ0000010050: 'BANGE', GA0000010066: 'SCGRE', GA0000010074: 'BGFIHC', GA0000010033: 'SIAT',
};

/**
 * BVMAC equities. Anchor: ISIN (may be split by the PDF text layer, e.g. "CM 000001 0025"), then
 * last price + its date, …, traded volume, value, number of trades, status (NC, PEq…), open, close.
 * Equity ISINs have a "1" as 6th digit (CM0000010025); bonds have a "2" (CM0000020305) and are skipped.
 */
export function parseBvmacBoc(text: string): OfficialRow[] {
  const re = new RegExp(
    String.raw`\b([A-Z]{2})\s?((?:\d\s?){9}\d)\s+(.*?)\s+(${FR})\s+(\d{2}/\d{2}/\d{4})\s+.*?(${FR})\s{2,}(${FR})\s{2,}(\d+)\s+([A-Za-z]{1,4})\s+(${FR})\s+(${FR})\s+(${FR})\s+(${FR})\s+(${PCT}|-?\d+,\d+%)`,
  );
  const out: OfficialRow[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const digits = m[2]!.replace(/\s/g, '');
    if (digits[5] !== '1') continue; // bonds
    const isin = `${m[1]}${digits}`;
    const label = m[3]!.trim();
    const ticker = BVMAC_TICKERS[isin] ?? label.split(/\s{2,}/).pop()!.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
    const prev = frNum(m[4]);
    let open = frNum(m[10]);
    let close = frNum(m[11]);
    // "206 720 206 720 206 720 206 720" (open, close, upper, lower limits separated by single spaces) is
    // ambiguous: re-split the digit groups into 4 prices consistent with the previous price.
    const tail = `${m[10]} ${m[11]} ${m[12]} ${m[13]}`.split(/\s+/);
    if (prev && (close == null || close < prev * 0.5 || close > prev * 1.5)) {
      const fixed = splitPrices(tail, 4, prev);
      if (fixed) { open = fixed[0]!; close = fixed[1]!; }
    }
    if (close == null || close <= 0 || (prev && (close < prev * 0.5 || close > prev * 1.5))) continue;
    seen.add(ticker);
    out.push({
      ticker, isin, name: ticker,
      previousClose: prev, open, close,
      changePct: prev ? Math.round(((close - prev) / prev) * 1e6) / 1e4 : null,
      volume: frNum(m[6]), value: frNum(m[7]),
    });
  }
  if (out.length) return out;
  // 2022 layout: "SHORT NAME  ISIN  close of the day  [change]" — closing price only.
  const old = new RegExp(String.raw`\b([A-Z]{2})((?:\d){10})\s{2,}(${FR})(?:\s|$)`);
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(old);
    if (!m || m[2]![5] !== '1') continue;
    const isin = `${m[1]}${m[2]}`;
    const ticker = BVMAC_TICKERS[isin];
    const close = frNum(m[3]);
    if (!ticker || seen.has(ticker) || close == null || close <= 0) continue;
    seen.add(ticker);
    out.push({ ticker, isin, name: ticker, previousClose: null, open: null, close, changePct: null, volume: null, value: null });
  }
  return out;
}

/** NGX equities: close read in the "Current Market Price" column, located from each page's header. */
export function parseNgxDailyList(text: string): OfficialRow[] {
  const num = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
  const out = new Map<string, OfficialRow>();
  for (const page of text.split('\f')) {
    const lines = page.split(/\r?\n/);
    const header = lines.find((l) => l.includes('Market Price') && l.includes('Official'));
    if (!header) continue;
    const col = header.indexOf('Market Price');
    for (const line of lines) {
      const m = line.match(/^\s{1,6}([A-Z][A-Z0-9]{1,14})\s+(\S.*)$/);
      if (!m) continue;
      for (const t of line.matchAll(num)) {
        const s = t.index!, e = s + t[0].length;
        if (e >= col - 2 && s <= col + 14) {
          const close = Number(t[0].replace(/,/g, ''));
          if (close > 0 && !out.has(m[1]!)) {
            const name = m[2]!.split(/\s{2,}/)[0]!.trim();
            out.set(m[1]!, { ticker: m[1]!, name, previousClose: null, open: null, close, changePct: null, volume: null, value: null });
          }
          break;
        }
      }
    }
  }
  return [...out.values()];
}

/** Candidate URLs of a session's bulletin (BRVM file names vary: _2, none, _1, _2_0). */
export function brvmBocUrls(date: string): string[] {
  const d = date.replaceAll('-', '');
  return ['_2', '', '_1', '_2_0', '_3'].map((s) => `https://www.brvm.org/sites/default/files/boc_${d}${s}.pdf`);
}
export function ngxDailyListUrl(date: string): string {
  const [y, m, d] = date.split('-');
  return `https://doclib.ngxgroup.com/DownloadsContent/Daily%20Official%20List%20-%20Equities%20for%20${d}-${m}-${y}.pdf`;
}
/** BVMAC links are listed on one page; pick the one for the session date (several naming schemes since 2019). */
export function bvmacBocUrlFromIndex(indexHtml: string, date: string): string | null {
  const [y, m, d] = date.split('-');
  const pats = [`BOC-${y}${m}${d}`, `BOC-BVMAC-${d}-${m}-${y}`, `BOC-BVMAC-${d}-${m}-${y!.slice(2)}`, `BOC-${d}-${m}-${y}`, `BOC_${y}${m}${d}`];
  const links = [...indexHtml.matchAll(/href="([^"]+\.pdf)"/gi)].map((x) => x[1]!.replace('https://https://', 'https://'));
  for (const p of pats) {
    const hit = links.find((l) => l.toUpperCase().includes(p.toUpperCase()));
    if (hit) return hit;
  }
  // Other names seen in the archive: BOC-automatise-20221207.pdf, BOC-20231004-1.pdf, BOC-20240614_compressed.pdf…
  const generic = new RegExp(`/BOC[^/]*?(?:${y}${m}${d}|${d}-${m}-${y})[^/]*\\.pdf$`, 'i');
  return links.find((l) => generic.test(l)) ?? null;
}

const FR_MONTHS: Record<string, string> = {
  janvier: '01', fevrier: '02', février: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07',
  aout: '08', août: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12', décembre: '12',
};

/**
 * Session date printed in the bulletin itself (ISO), or null. Archives are sometimes misfiled
 * (e.g. NGX "…for 13-02-2026.pdf" contains the list "For 13/04/2026"): always trust this date.
 */
export function bulletinDate(market: string, text: string): string | null {
  const head = text.slice(0, 6000);
  if (market === 'NGX') {
    const m = head.match(/For\s+(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }
  const fr = head.match(/(?:lundi|mardi|mercredi|jeudi|vendredi|S[EÉ]ANCE\s+DU)\s+(\d{1,2})(?:er)?\s+([A-Za-zéûÉÛ]+)\s+(\d{4})/i);
  if (fr) {
    const mm = FR_MONTHS[fr[2]!.toLowerCase()];
    if (mm) return `${fr[3]}-${mm}-${fr[1]!.padStart(2, '0')}`;
  }
  const num = head.match(/(?:COTE|SEANCE|SÉANCE)[^\n]{0,40}?DU\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  return num ? `${num[3]}-${num[2]}-${num[1]}` : null;
}

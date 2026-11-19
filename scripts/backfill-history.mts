// Rebuilds daily price history from the exchanges' OFFICIAL bulletins (BRVM, BVMAC, NGX).
//   npx tsx scripts/backfill-history.mts --from 2022-11-18 --to 2026-11-18 --out data/history
// Needs `pdftotext` (poppler-utils). Resumable: sessions already in <out>/<MARKET>.csv are skipped.
// Polite: one request at a time per site, with a pause between requests. PDFs are not kept.
// Output per market: CSV (date,ticker,name,isin,prev_close,open,close,change_pct,volume,value,source_url)
// and <MARKET>.log.csv (date,status,detail) for absent / unreadable sessions.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { businessDays } from '../packages/data/src/bulletinConnector.ts';
import {
  brvmBocUrls, bulletinDate, bvmacBocUrlFromIndex, ngxDailyListUrl, parseBrvmBoc, parseBvmacBoc, parseNgxDailyList, type OfficialRow,
} from '../packages/data/src/officialBulletins.ts';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1]! : d; };
const FROM = arg('from', '2022-11-18');
const TO = arg('to', '2026-11-18');
const OUT = arg('out', 'data/history');
const MARKETS = arg('markets', 'BRVM,BVMAC,NGX').split(',');
const PAUSE_MS = Number(arg('pause', '1000'));
mkdirSync(OUT, { recursive: true });
// Private temp dir per process (several backfills may share the same output folder).
const TMP = mkdtempSync(join(tmpdir(), 'chart-boursafrikia-backfill-'));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'ChartBoursafrikIAHistoryBackfill/1.0 (official bulletins, polite crawl)' };

async function fetchPdf(url: string): Promise<Uint8Array | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      return buf.length > 4 && String.fromCharCode(...buf.slice(0, 4)) === '%PDF' ? buf : null; // 404 pages served as HTML
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(3000 * (attempt + 1));
    }
  }
  return null;
}

function pdfText(buf: Uint8Array, name: string): string {
  const pdf = join(TMP, `${name}.pdf`);
  writeFileSync(pdf, buf);
  try { return execFileSync('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8'); }
  finally { rmSync(pdf, { force: true }); }
}

const csvEscape = (v: unknown) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
const HEADER = 'date,ticker,name,isin,prev_close,open,close,change_pct,volume,value,source_url\n';

function doneDates(market: string): Set<string> {
  const s = new Set<string>();
  for (const f of [`${market}.csv`, `${market}.log.csv`]) {
    const p = join(OUT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n').slice(1)) if (line) s.add(line.slice(0, 10));
  }
  return s;
}

function write(market: string, date: string, rows: OfficialRow[], url: string) {
  const p = join(OUT, `${market}.csv`);
  if (!existsSync(p)) writeFileSync(p, HEADER);
  appendFileSync(p, rows.map((r) => [date, r.ticker, r.name, r.isin ?? '', r.previousClose, r.open, r.close, r.changePct, r.volume, r.value, url].map(csvEscape).join(',')).join('\n') + '\n');
}
function log(market: string, date: string, status: string, detail = '') {
  const p = join(OUT, `${market}.log.csv`);
  if (!existsSync(p)) writeFileSync(p, 'date,status,detail\n');
  appendFileSync(p, `${date},${status},${csvEscape(detail)}\n`);
}

async function runMarket(market: string) {
  const done = doneDates(market);
  const days = businessDays(FROM, TO).filter((d) => !done.has(d));
  let bvmacIndex = '';
  if (market === 'BVMAC') {
    const r = await fetch('https://www.bvm-ac.org/bulletin-officiel-de-la-cote-boc/', { headers: UA });
    bvmacIndex = await r.text();
  }
  let ok = 0, absent = 0, failed = 0;
  for (const date of days) {
    try {
      let buf: Uint8Array | null = null, url = '';
      if (market === 'BRVM') {
        for (const u of brvmBocUrls(date)) { buf = await fetchPdf(u); await sleep(PAUSE_MS); if (buf) { url = u; break; } }
      } else if (market === 'NGX') {
        url = ngxDailyListUrl(date); buf = await fetchPdf(url); await sleep(PAUSE_MS);
      } else {
        const u = bvmacBocUrlFromIndex(bvmacIndex, date);
        if (u) { url = u; buf = await fetchPdf(u); await sleep(PAUSE_MS); }
      }
      if (!buf) {
        // Recent sessions may simply not be published yet: leave them unmarked so a later run retries.
        if ((Date.now() - Date.parse(`${date}T00:00:00Z`)) / 86400_000 > 4) log(market, date, 'absent');
        absent++; continue;
      }
      const text = pdfText(buf, `${market}_${date}`);
      const rows = market === 'BRVM' ? parseBrvmBoc(text) : market === 'NGX' ? parseNgxDailyList(text) : parseBvmacBoc(text);
      if (!rows.length) { log(market, date, 'unreadable', url); failed++; continue; }
      // Trust the date printed in the document: archives are sometimes misfiled.
      const docDate = bulletinDate(market, text);
      if (docDate && docDate !== date) {
        log(market, date, 'misfiled', `${url} contains ${docDate}`);
        if (docDate >= FROM && docDate <= TO && !done.has(docDate)) { write(market, docDate, rows, url); done.add(docDate); }
        continue;
      }
      if (!docDate) log(market, date, 'undated', url); // kept, but flagged for review
      write(market, date, rows, url); done.add(date); ok++;
    } catch (e) {
      log(market, date, 'error', (e as Error).message); failed++;
    }
    if ((ok + absent + failed) % 50 === 0) console.log(`${market}: ${ok} ok, ${absent} absent, ${failed} failed / ${days.length}`);
  }
  console.log(`${market} DONE: ${ok} sessions, ${absent} absent, ${failed} failed`);
}

await Promise.all(MARKETS.map(runMarket)); // markets in parallel, sequential within a site
rmSync(TMP, { recursive: true, force: true });

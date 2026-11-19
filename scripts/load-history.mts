// Loads the rebuilt history (data/history/*.csv) into Supabase `assets` + `price_bars`,
// after detecting corporate actions (splits, bonus shares) so that the history can be adjusted.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/load-history.mts [--dir data/history] [--dry-run]
//
// Corporate actions: the BRVM/BVMAC bulletins print a previous close that is already adjusted on the day
// of a split. When close(t-1) / prev_close(t) differs by more than 20 %, factor f = prev_close(t) / close(t-1)
// is applied to every earlier bar (price_bars.adjusted_factor: adjusted price = close × factor).
// NGX lists carry no previous close: jumps beyond ±10.5 % are only reported for manual review.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1]! : d; };
const DIR = arg('dir', 'data/history');
const DRY = process.argv.includes('--dry-run');
const CURRENCY: Record<string, string> = { BRVM: 'XOF', BVMAC: 'XAF', NGX: 'NGN' };

interface Row { date: string; ticker: string; name: string; isin: string; prev: number | null; open: number | null; close: number; pct: number | null; volume: number | null; value: number | null; url: string }

function parseCsv(text: string): Row[] {
  const lines = text.trim().split('\n').slice(1);
  return lines.map((l) => {
    const f: string[] = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i]!;
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { f.push(cur); cur = ''; } else cur += c;
    }
    f.push(cur);
    const n = (s: string | undefined) => (s === undefined || s === '' ? null : Number(s));
    return { date: f[0]!, ticker: f[1]!, name: f[2]!, isin: f[3]!, prev: n(f[4]), open: n(f[5]), close: Number(f[6]), pct: n(f[7]), volume: n(f[8]), value: n(f[9]), url: f[10]! };
  });
}

export interface CorporateAction { market: string; ticker: string; date: string; factor: number | null; before: number; after: number; note: string }

export function detectActions(market: string, rows: Row[]): { actions: CorporateAction[]; factors: Map<string, number> } {
  const byTicker = new Map<string, Row[]>();
  for (const r of rows) (byTicker.get(r.ticker) ?? byTicker.set(r.ticker, []).get(r.ticker)!).push(r);
  const actions: CorporateAction[] = [];
  const factors = new Map<string, number>(); // key `${ticker}|${date}` → cumulative factor
  for (const [ticker, list] of byTicker) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const events: { idx: number; f: number }[] = [];
    for (let i = 1; i < list.length; i++) {
      const y = list[i - 1]!, t = list[i]!;
      if (t.prev != null && y.close > 0) {
        const f = t.prev / y.close;
        if (Math.abs(f - 1) > 0.2) { events.push({ idx: i, f }); actions.push({ market, ticker, date: t.date, factor: f, before: y.close, after: t.prev, note: 'prev_close ajusté par la bourse' }); }
      } else if (y.close > 0 && Math.abs(t.close / y.close - 1) > 0.105) {
        actions.push({ market, ticker, date: t.date, factor: null, before: y.close, after: t.close, note: 'saut > 10,5 % à vérifier' });
      }
    }
    // cumulative factor for each bar = product of factors of all LATER events
    let cum = 1, e = events.length - 1;
    for (let i = list.length - 1; i >= 0; i--) {
      while (e >= 0 && events[e]!.idx > i) { cum *= events[e]!.f; e--; }
      factors.set(`${ticker}|${list[i]!.date}`, Math.round(cum * 1e8) / 1e8);
    }
  }
  return { actions, factors };
}

async function main() {
  const db = DRY ? null : createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  if (!DRY && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  const report: CorporateAction[] = [];
  for (const market of ['BRVM', 'BVMAC', 'NGX']) {
    const p = join(DIR, `${market}.csv`);
    if (!existsSync(p)) continue;
    const rows = parseCsv(readFileSync(p, 'utf8'));
    const { actions, factors } = detectActions(market, rows);
    report.push(...actions);
    const tickers = new Map<string, Row>();
    for (const r of rows) tickers.set(r.ticker, r); // latest name wins (rows are chronological per file)
    console.log(`${market}: ${rows.length} bars, ${tickers.size} stocks, ${actions.length} corporate-action candidates`);
    if (!db) continue;
    const assets = [...tickers.values()].map((r) => ({ id: `${market}:${r.ticker}`, market, ticker: r.ticker, name: r.name || r.ticker, isin: r.isin || null, currency: CURRENCY[market] }));
    for (let i = 0; i < assets.length; i += 500) {
      const { error } = await db.from('assets').upsert(assets.slice(i, i + 500), { onConflict: 'id', ignoreDuplicates: false });
      if (error) throw error;
    }
    const bars = rows.map((r) => ({
      asset_id: `${market}:${r.ticker}`, session_date: r.date, open: r.open, high: null, low: null, close: r.close,
      volume: r.volume ?? 0, value: r.value, source: `official_bulletin:${market}`, verified: true,
      adjusted_factor: factors.get(`${r.ticker}|${r.date}`) ?? 1,
    }));
    for (let i = 0; i < bars.length; i += 1000) {
      const { error } = await db.from('price_bars').upsert(bars.slice(i, i + 1000), { onConflict: 'asset_id,session_date' });
      if (error) throw error;
      process.stdout.write(`\r  ${market}: ${Math.min(i + 1000, bars.length)}/${bars.length}`);
    }
    process.stdout.write('\n');
  }
  writeFileSync(join(DIR, 'corporate-actions.csv'), 'market,ticker,date,factor,before,after,note\n' + report.map((a) => [a.market, a.ticker, a.date, a.factor ?? '', a.before, a.after, `"${a.note}"`].join(',')).join('\n') + '\n');
  console.log(`corporate actions report: ${join(DIR, 'corporate-actions.csv')} (${report.length} lines)`);
}

if (process.argv[1]?.endsWith('load-history.mts')) await main();

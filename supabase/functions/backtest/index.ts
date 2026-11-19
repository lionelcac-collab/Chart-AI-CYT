// Job (weekly): walk-forward backtest of the consensus model, pooled per market and Africa-wide.
// Results are public (view public_track_record) for transparency.
import { admin, handler, json, requireService } from '../_shared/runtime.ts';
import { HORIZONS, MODEL_VERSION, backtest, poolBacktests, type BacktestResult } from '../_shared/core/index.ts';
import { loadBars } from '../_shared/sheet.ts';

Deno.serve(handler(async (req) => {
  requireService(req);
  const db = admin();
  const { data: assets } = await db.from('assets').select('id, market').eq('is_active', true).eq('asset_class', 'equity');
  const byScope: Record<string, Record<string, BacktestResult[]>> = {};
  let start = '9999', end = '0000';
  for (const a of assets ?? []) {
    const bars = await loadBars(db, a.id, 10);
    if (bars.length < 400) continue;
    start = bars[0]!.date < start ? bars[0]!.date : start;
    end = bars[bars.length - 1]!.date > end ? bars[bars.length - 1]!.date : end;
    for (const h of HORIZONS) {
      const r = backtest(bars, { horizon: h });
      for (const scope of ['ALL', a.market]) ((byScope[scope] ??= {})[h] ??= []).push(r);
    }
  }
  const rows = Object.entries(byScope).flatMap(([scope, hs]) => Object.entries(hs).map(([horizon, results]) => {
    const p = poolBacktests(results);
    return { model_version: MODEL_VERSION, scope, horizon, samples: p.samples, calls: p.calls, hits: p.hits, hit_rate: p.hitRate, range_coverage: p.rangeCoverage, base_rate_up: p.baseRateUp, period_start: start, period_end: end };
  }));
  if (rows.length) await db.from('consensus_backtests').insert(rows);
  return json({ rows: rows.length });
}));

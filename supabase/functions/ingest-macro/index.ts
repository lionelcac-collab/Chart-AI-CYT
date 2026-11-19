// Job (weekly): World Bank + IMF macro series for the MVP countries.
import { admin, handler, json, requireService } from '../_shared/runtime.ts';
import { MARKETS, MVP_MARKETS } from '../_shared/core/index.ts';
import { WB_INDICATORS, worldBankSeries } from '../_shared/data/index.ts';

Deno.serve(handler(async (req) => {
  requireService(req);
  const db = admin();
  const countries = [...new Set(MVP_MARKETS.flatMap((m) => MARKETS[m].countries))];
  let written = 0;
  for (const c of countries) {
    for (const [name, code] of [['gdp_growth', WB_INDICATORS.gdpGrowth], ['inflation', WB_INDICATORS.inflation]] as const) {
      const pts = await worldBankSeries(c, code).catch(() => []);
      if (!pts.length) continue;
      await db.from('macro_series').upsert(pts.map((p) => ({ country: c, indicator: name, period: `${p.year}-12-31`, value: p.value, source: 'worldbank' })), { onConflict: 'country,indicator,period,source' });
      written += pts.length;
    }
  }
  // BCEAO / BEAC / CBN policy rates: entered by admin or AI-extracted from press releases (indicator 'policy_rate').
  return json({ written });
}));

// POST /portfolio {period, currency} — evolution of the user's watchlist as a portfolio over a period.
// - "value" mode when at least one line has a number of shares: value = Σ shares × adjusted close × FX.
// - "equal" mode otherwise: equal-weighted index (base 100) of the listed stocks.
// Contribution of each line = its gain over the period / portfolio value at the start (in % points).
// FX: latest rate in fx_rates (FCFA XOF/XAF at parity); history converted at that same rate (stated in the response).
import { admin, currentUser, handler, json } from '../_shared/runtime.ts';
import { loadPortfolio, type Period } from '../_shared/portfolio.ts';

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  const { period = '1M', currency = 'XOF' } = (await req.json().catch(() => ({}))) as { period?: Period; currency?: string };
  return json(await loadPortfolio(admin(), user.id, period, currency));
}));

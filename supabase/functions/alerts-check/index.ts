// POST /alerts-check — evaluates the signed-in user's alerts against the latest session right away
// (called after an alert is created, so a condition already met shows up immediately).
import { evaluateAlerts } from '../_shared/alerts.ts';
import { admin, currentUser, handler, json } from '../_shared/runtime.ts';

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  return json(await evaluateAlerts(admin(), { userId: user.id }));
}));

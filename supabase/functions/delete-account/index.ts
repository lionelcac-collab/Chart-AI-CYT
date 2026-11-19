// POST /delete-account — in-app account deletion (App Store guideline 5.1.1(v), Google Play policy).
// Cascades remove profile, watchlists, portfolio, alerts, tokens (FK on delete cascade).
import { admin, audit, currentUser, handler, json } from '../_shared/runtime.ts';

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  const { error } = await admin().auth.admin.deleteUser(user.id);
  if (error) throw error;
  await audit(user.id, 'delete_account', 'auth.users', user.id, {});
  return json({ ok: true });
}));

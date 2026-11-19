// RevenueCat → Supabase. Configure in RevenueCat: webhook URL + Authorization header = REVENUECAT_WEBHOOK_AUTH.
// app_user_id MUST be the Supabase user id (Purchases.logIn(user.id) in the app).
import { admin, env, handler, json } from '../_shared/runtime.ts';
import { setPremium } from '../_shared/premium.ts';

Deno.serve(handler(async (req) => {
  if (req.headers.get('Authorization') !== env('REVENUECAT_WEBHOOK_AUTH')) return json({ error: 'forbidden' }, 403);
  const payload = await req.json();
  const e = payload.event ?? {};
  const { error: dup } = await admin().from('payment_events').insert({ provider: 'revenuecat', event_id: String(e.id), payload });
  if (dup) return json({ duplicate: true });
  const userId: string = e.app_user_id;
  if (!/^[0-9a-f-]{36}$/i.test(userId ?? '')) return json({ ignored: 'anonymous user' });
  const until = e.expiration_at_ms ? new Date(Number(e.expiration_at_ms)) : null;
  const status = ({
    INITIAL_PURCHASE: e.period_type === 'TRIAL' ? 'trialing' : 'active', RENEWAL: 'active', UNCANCELLATION: 'active', PRODUCT_CHANGE: 'active',
    CANCELLATION: 'active' /* stays active until expiration */, BILLING_ISSUE: 'grace', EXPIRATION: 'expired', SUBSCRIPTION_PAUSED: 'expired',
  } as Record<string, string>)[e.type] ?? null;
  if (!status) return json({ ignored: e.type });
  await setPremium(userId, status === 'expired' ? new Date(0) : until, 'revenuecat', e.original_transaction_id ?? e.transaction_id ?? e.id, e.product_id, status, e);
  return json({ ok: true });
}));

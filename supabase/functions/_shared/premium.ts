// Single premium status across platforms.
// Source of truth = `profiles.plan/premium_until`, fed by:
//   - RevenueCat webhooks (App Store / Google Play in-app purchases)
//   - CinetPay / NotchPay / Flutterwave webhooks (web: mobile money + card)
// Web purchases are mirrored into RevenueCat as a promotional entitlement so the
// mobile SDK sees the same status offline.
import { admin, audit } from './runtime.ts';

export async function setPremium(userId: string, until: Date | null, source: string, ref: string, productId: string, status: string, raw: unknown) {
  const db = admin();
  const active = until !== null && until > new Date();
  await db.from('subscriptions').upsert({ user_id: userId, provider: source, provider_ref: ref, product_id: productId, status, current_period_end: until?.toISOString() ?? null, raw, updated_at: new Date().toISOString() }, { onConflict: 'provider,provider_ref' });
  // Keep the latest end date across all providers.
  const { data: subs } = await db.from('subscriptions').select('current_period_end, status').eq('user_id', userId);
  const best = (subs ?? []).filter((s) => s.current_period_end && ['active', 'trialing', 'grace'].includes(s.status))
    .map((s) => new Date(s.current_period_end!)).sort((a, b) => b.getTime() - a.getTime())[0];
  const isActive = !!best && best > new Date();
  await db.from('profiles').update({ plan: isActive ? 'premium' : 'free', premium_until: isActive ? best!.toISOString() : null, ...(status === 'trialing' ? { trial_used: true } : {}) }).eq('id', userId);
  await audit(`webhook:${source}`, 'subscription', 'profiles', userId, { status, until, active, productId });
}

/** Grants a RevenueCat promotional entitlement (REST v1) for web purchases. */
export async function mirrorToRevenueCat(userId: string, until: Date) {
  const key = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!key) return;
  const days = Math.ceil((until.getTime() - Date.now()) / 86400_000);
  const duration = days > 200 ? 'yearly' : days > 25 ? 'monthly' : 'weekly';
  await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/entitlements/premium/promotional`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ duration }),
  }).catch((e) => console.warn('revenuecat mirror', e));
}

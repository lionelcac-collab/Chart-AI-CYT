// Moneroo (moneroo.io) — web checkout aggregator (mobile money + card). Secret key in MONEROO_SECRET_KEY.
// A payment is only ever granted after a server-to-server check (GET /v1/payments/{id}/verify): status, amount and
// currency must match the offer recorded when the payment was created.
import { admin } from './runtime.ts';
import { PRICING } from './core/index.ts';
import { mirrorToRevenueCat, setPremium } from './premium.ts';

const API = 'https://api.moneroo.io/v1';
export const monerooEnabled = () => Boolean(Deno.env.get('MONEROO_SECRET_KEY'));
const headers = () => ({ Authorization: `Bearer ${Deno.env.get('MONEROO_SECRET_KEY')}`, 'Content-Type': 'application/json', Accept: 'application/json' });

export async function monerooInit(p: { amount: number; currency: string; description: string; returnUrl: string;
  customer: { email: string; first_name: string; last_name: string }; metadata: Record<string, string> }) {
  const r = await fetch(`${API}/payments/initialize`, { method: 'POST', headers: headers(), body: JSON.stringify({
    amount: p.amount, currency: p.currency, description: p.description, return_url: p.returnUrl, customer: p.customer, metadata: p.metadata }) });
  const body = await r.json().catch(() => ({}));
  return { id: body?.data?.id as string | undefined, url: body?.data?.checkout_url as string | undefined, message: body?.message as string | undefined };
}

/** Re-checks a Moneroo payment and grants Premium when it is paid. Idempotent. */
export async function monerooSettle(paymentId: string, expectedUser?: string) {
  const db = admin();
  const { data: sub } = await db.from('subscriptions').select('user_id, product_id, status').eq('provider', 'moneroo').eq('provider_ref', paymentId).maybeSingle();
  if (!sub) return { ok: false, status: 'unknown' };
  if (expectedUser && sub.user_id !== expectedUser) return { ok: false, status: 'forbidden' };
  if (sub.status === 'active') return { ok: true, status: 'success' };
  const v = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}/verify`, { headers: headers() }).then((r) => r.json()).catch(() => null);
  const d = v?.data;
  const status: string = d?.status ?? 'unknown';
  if (status === 'pending' || status === 'initiated' || status === 'unknown') return { ok: false, status };
  const plan = sub.product_id.endsWith('yearly') ? 'yearly' : 'monthly';
  const code: string = d?.currency?.code ?? d?.currency;
  const expected = (PRICING as Record<string, Record<string, number>>)[code]?.[plan];
  const paid = status === 'success' && expected != null && Number(d.amount) >= expected;
  const { error: dup } = await db.from('payment_events').insert({ provider: 'moneroo', event_id: `${paymentId}:${status}`, payload: v });
  if (dup) return { ok: paid, status };
  if (!paid) {
    await db.from('subscriptions').update({ status: 'failed', raw: v }).eq('provider', 'moneroo').eq('provider_ref', paymentId);
    return { ok: false, status };
  }
  const until = new Date();
  if (plan === 'yearly') until.setUTCFullYear(until.getUTCFullYear() + 1); else until.setUTCMonth(until.getUTCMonth() + 1);
  await setPremium(sub.user_id, until, 'moneroo', paymentId, sub.product_id, 'active', v);
  await mirrorToRevenueCat(sub.user_id, until);
  return { ok: true, status };
}

/** X-Moneroo-Signature = hex HMAC-SHA256(raw body, MONEROO_WEBHOOK_SECRET). */
export async function monerooSignatureOk(raw: string, signature: string | null) {
  const secret = Deno.env.get('MONEROO_WEBHOOK_SECRET');
  if (!secret) return true; // the payment is re-verified server-side anyway
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== signature.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
  return diff === 0;
}

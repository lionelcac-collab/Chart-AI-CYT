// Payment notifications (CinetPay, Moneroo). The payload is never trusted: the transaction is re-checked server-to-server.
import { admin, env, handler, json } from '../_shared/runtime.ts';
import { mirrorToRevenueCat, setPremium } from '../_shared/premium.ts';
import { monerooSettle, monerooSignatureOk } from '../_shared/moneroo.ts';

Deno.serve(handler(async (req) => {
  const sig = req.headers.get('x-moneroo-signature');
  if (sig !== null || req.headers.get('user-agent')?.toLowerCase().includes('moneroo')) {
    const raw = await req.text();
    if (!(await monerooSignatureOk(raw, sig))) return json({ error: 'signature invalide' }, 401);
    const evt = JSON.parse(raw || '{}') as { event?: string; data?: { id?: string } };
    if (!evt.data?.id || !String(evt.event ?? '').startsWith('payment.')) return json({ ignored: true });
    return json(await monerooSettle(evt.data.id));
  }
  const form = await req.formData().catch(() => null);
  const transactionId = form?.get('cpm_trans_id')?.toString() ?? (await req.json().catch(() => ({}))).transaction_id;
  if (!transactionId) return json({ error: 'transaction manquante' }, 400);
  const check = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: env('CINETPAY_API_KEY'), site_id: env('CINETPAY_SITE_ID'), transaction_id: transactionId }),
  }).then((r) => r.json());
  const db = admin();
  const { error: dup } = await db.from('payment_events').insert({ provider: 'cinetpay', event_id: `${transactionId}:${check?.data?.status}`, payload: check });
  if (dup) return json({ duplicate: true });
  const { data: sub } = await db.from('subscriptions').select('user_id, product_id').eq('provider', 'cinetpay').eq('provider_ref', transactionId).maybeSingle();
  if (!sub) return json({ error: 'transaction inconnue' }, 404);
  if (check?.data?.status !== 'ACCEPTED') {
    await db.from('subscriptions').update({ status: 'failed', raw: check }).eq('provider', 'cinetpay').eq('provider_ref', transactionId);
    return json({ ok: true, status: check?.data?.status });
  }
  const until = new Date();
  if (sub.product_id.endsWith('yearly')) until.setUTCFullYear(until.getUTCFullYear() + 1); else until.setUTCMonth(until.getUTCMonth() + 1);
  await setPremium(sub.user_id, until, 'cinetpay', transactionId, sub.product_id, 'active', check);
  await mirrorToRevenueCat(sub.user_id, until);
  return json({ ok: true });
}));

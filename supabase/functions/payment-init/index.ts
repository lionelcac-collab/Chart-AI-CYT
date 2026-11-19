// POST /payment-init {plan: 'monthly'|'yearly', currency: 'XOF'|'XAF'|...} — web checkout (mobile money + card) via CinetPay.
// NotchPay / Flutterwave can be added behind the same contract (provider field).
// CinetPay endpoint & fields to confirm with the merchant account documentation.
import { admin, currentUser, env, handler, json } from '../_shared/runtime.ts';
import { PRICING } from '../_shared/core/index.ts';

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  const { plan, currency = 'XOF' } = await req.json();
  const price = (PRICING as Record<string, { monthly: number; yearly: number }>)[currency]?.[plan as 'monthly'];
  if (!price) return json({ error: 'offre invalide' }, 400);
  const transactionId = `cbia_${plan}_${crypto.randomUUID()}`;
  await admin().from('subscriptions').insert({ user_id: user.id, provider: 'cinetpay', provider_ref: transactionId, product_id: `chart_boursafrikia_premium_${plan}`, status: 'pending' });
  const res = await fetch('https://api-checkout.cinetpay.com/v2/payment', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: env('CINETPAY_API_KEY'), site_id: env('CINETPAY_SITE_ID'), transaction_id: transactionId,
      amount: price, currency, description: `Chart-BoursafrikIA Premium ${plan}`, channels: 'ALL',
      notify_url: `${env('SUPABASE_URL')}/functions/v1/payment-webhook`, return_url: env('WEB_APP_URL') + '/premium/success',
      customer_id: user.id, customer_email: user.email ?? undefined, metadata: user.id,
    }),
  });
  const body = await res.json();
  if (!body?.data?.payment_url) return json({ error: 'PAYMENT_INIT_FAILED', detail: body?.message }, 502);
  return json({ paymentUrl: body.data.payment_url, transactionId });
}));

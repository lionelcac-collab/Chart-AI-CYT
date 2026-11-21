// POST /payment-init — web checkout (mobile money + card).
//   {plan: 'monthly'|'yearly', currency}  → creates the payment, returns {paymentUrl}. Moneroo when MONEROO_SECRET_KEY is set, else CinetPay.
//   {action: 'verify', paymentId}         → after the redirect back from Moneroo: re-checks the payment and grants Premium.
import { admin, currentUser, env, handler, json } from '../_shared/runtime.ts';
import { PRICING } from '../_shared/core/index.ts';
import { monerooEnabled, monerooInit, monerooSettle } from '../_shared/moneroo.ts';

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  const body = await req.json().catch(() => ({}));
  if (body.action === 'verify') {
    if (!body.paymentId) return json({ error: 'paymentId requis' }, 400);
    return json(await monerooSettle(String(body.paymentId), user.id));
  }
  const { plan, currency = 'XOF' } = body as { plan?: string; currency?: string };
  const price = (PRICING as Record<string, { monthly: number; yearly: number }>)[currency]?.[plan as 'monthly'];
  if (!price) return json({ error: 'offre invalide' }, 400);
  const db = admin();
  const appUrl = Deno.env.get('WEB_APP_URL') ?? 'https://chart-boursafrikia.com';
  const productId = `chart_boursafrikia_premium_${plan}`;

  if (monerooEnabled()) {
    // Moneroo takes whole amounts. EUR/USD prices (4.99…) are only accepted with sandbox keys (test gateway = USD), rounded up.
    const sandbox = (Deno.env.get('MONEROO_SECRET_KEY') ?? '').includes('sandbox');
    if (!Number.isInteger(price) && !sandbox) return json({ error: 'CURRENCY_UNAVAILABLE' }, 400);
    const { data: prof } = await db.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const parts = String(prof?.display_name || user.email?.split('@')[0] || 'Client').trim().split(/\s+/);
    const r = await monerooInit({
      amount: Math.ceil(price), currency, description: `Chart-BoursafrikIA Premium ${plan === 'yearly' ? 'annuel' : 'mensuel'}`,
      returnUrl: `${appUrl}/premium`,
      customer: { email: user.email ?? '', first_name: parts[0]!, last_name: parts.slice(1).join(' ') || parts[0]! },
      metadata: { user_id: user.id, plan: String(plan) },
    });
    if (!r.id || !r.url) return json({ error: 'PAYMENT_INIT_FAILED', detail: r.message }, 502);
    await db.from('subscriptions').insert({ user_id: user.id, provider: 'moneroo', provider_ref: r.id, product_id: productId, status: 'pending' });
    return json({ paymentUrl: r.url, transactionId: r.id, provider: 'moneroo' });
  }

  const transactionId = `cbia_${plan}_${crypto.randomUUID()}`;
  await db.from('subscriptions').insert({ user_id: user.id, provider: 'cinetpay', provider_ref: transactionId, product_id: productId, status: 'pending' });
  const res = await fetch('https://api-checkout.cinetpay.com/v2/payment', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apikey: env('CINETPAY_API_KEY'), site_id: env('CINETPAY_SITE_ID'), transaction_id: transactionId,
      amount: price, currency, description: `Chart-BoursafrikIA Premium ${plan}`, channels: 'ALL',
      notify_url: `${env('SUPABASE_URL')}/functions/v1/payment-webhook`, return_url: `${appUrl}/premium`,
      customer_id: user.id, customer_email: user.email ?? undefined, metadata: user.id,
    }),
  });
  const out = await res.json();
  if (!out?.data?.payment_url) return json({ error: 'PAYMENT_INIT_FAILED', detail: out?.message }, 502);
  return json({ paymentUrl: out.data.payment_url, transactionId, provider: 'cinetpay' });
}));

// Supabase Auth « Send Email Hook »: sends sign-up / sign-in / recovery / e-mail-change codes through the Brevo API
// (same channel as the alert e-mails), using the French templates in templates.json. Called by Supabase Auth only:
// every request is checked against SEND_EMAIL_HOOK_SECRET (Standard Webhooks signature).
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import templates from './templates.json' with { type: 'json' };
import { sendEmail } from '../_shared/email.ts';

type Payload = {
  user: { email: string; new_email?: string };
  email_data: { token: string; token_new?: string; email_action_type: string };
};
const T = templates as Record<string, string>;
const KIND: Record<string, string> = { signup: 'confirmation', magiclink: 'magic_link', recovery: 'recovery', email_change: 'email_change', invite: 'confirmation', reauthentication: 'magic_link' };
const render = (kind: string, token: string) => ({
  subject: T[`mailer_subjects_${kind}`]!, html: T[`mailer_templates_${kind}_content`]!.replaceAll('{{ .Token }}', token),
});
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  const secret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');
  if (!secret) return fail(500, 'hook secret manquant');
  const raw = await req.text();
  let p: Payload;
  try { p = new Webhook(secret).verify(raw, Object.fromEntries(req.headers)) as Payload; } catch { return fail(401, 'signature invalide'); }
  const kind = KIND[p.email_data.email_action_type] ?? 'magic_link';
  const jobs: [string, string][] = [];
  if (p.email_data.email_action_type === 'email_change' && p.user.new_email) {
    if (p.email_data.token_new) jobs.push([p.user.new_email, p.email_data.token_new]);
    if (p.email_data.token) jobs.push([p.user.email, p.email_data.token]);
  } else jobs.push([p.user.email, p.email_data.token]);
  for (const [to, token] of jobs) {
    const m = render(kind, token);
    const r = await sendEmail({ email: to }, m.subject, m.html, ['auth', p.email_data.email_action_type]);
    if (!r.sent) return fail(502, `envoi impossible : ${r.reason}`);
  }
  return new Response('{}', { headers: { 'content-type': 'application/json' } });
});

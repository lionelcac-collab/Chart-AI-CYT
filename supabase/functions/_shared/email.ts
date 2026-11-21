// Transactional e-mails through Brevo (API key in the BREVO_API_KEY secret). No key: nothing is sent.
export const EMAIL_FROM = { email: Deno.env.get('EMAIL_FROM') ?? 'noreply@chart-boursafrikia.com', name: 'Chart-BoursafrikIA' };
const APP_URL = Deno.env.get('WEB_APP_URL') ?? 'https://chart-boursafrikia.com';

export function emailEnabled() { return Boolean(Deno.env.get('BREVO_API_KEY')); }

export async function sendEmail(to: { email: string; name?: string }, subject: string, html: string, tags: string[] = []) {
  const key = Deno.env.get('BREVO_API_KEY');
  if (!key) return { sent: false, reason: 'BREVO_API_KEY manquant' };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: EMAIL_FROM, to: [to], subject, htmlContent: html, tags, replyTo: { email: Deno.env.get('EMAIL_REPLY_TO') ?? 'hello@otheon-tech.com' } }),
  });
  return { sent: r.ok, reason: r.ok ? null : `HTTP ${r.status} ${(await r.text()).slice(0, 160)}` };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Alert digest e-mail (French), branded like the auth e-mails. */
export function alertDigestHtml(items: { title: string; body: string; asset_id: string | null }[]) {
  const rows = items.map((i) => `<tr><td style="padding:12px 0;border-bottom:1px solid #E3EAEC">
    <div style="font-weight:700;font-size:15px">${esc(i.title)}</div><div style="font-size:13px;color:#56656A;margin-top:4px">${esc(i.body)}</div>
    ${i.asset_id ? `<a href="${APP_URL}/asset/${encodeURIComponent(i.asset_id)}" style="font-size:13px;color:#0B6E73">Voir le titre →</a>` : ''}</td></tr>`).join('');
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F2F6F7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#10181B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F6F7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="background:#161B1E;padding:20px 24px"><span style="color:#6EECF2;font-weight:800;font-size:18px">Chart-BoursafrikIA</span><br><span style="color:#B5C6C9;font-size:12px">Vos alertes de la séance</span></td></tr>
<tr><td style="padding:20px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<p style="margin:20px 0 0"><a href="${APP_URL}/alertes" style="display:inline-block;background:#0B6E73;color:#fff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:8px">Gérer mes alertes</a></p></td></tr>
<tr><td style="padding:16px 24px;background:#F7FAFA;font-size:11px;color:#8A979B">Vous recevez cet e-mail car vous avez créé des alertes sur Chart-BoursafrikIA. Désactivez les e-mails d’alerte depuis l’écran « Mes alertes ». Informations de marché, pas un conseil en investissement.</td></tr>
</table></td></tr></table></body></html>`;
}

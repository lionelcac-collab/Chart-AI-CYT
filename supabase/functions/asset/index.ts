// GET /asset?id=BRVM:SNTS — full asset sheet (consensus masked for free users).
import { admin, currentUser, handler, isPremium, json } from '../_shared/runtime.ts';
import { buildSheet, maskForFree } from '../_shared/sheet.ts';

Deno.serve(handler(async (req) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'id requis' }, 400);
  const user = await currentUser(req);
  const premium = await isPremium(user?.id);
  // Shared 15-minute cache of the computed sheet (same for every user; plan masking is applied after).
  const db = admin();
  const key = `sheet|${id}`;
  const { data: hit } = await db.from('api_cache').select('payload').eq('key', key).gt('expires_at', new Date().toISOString()).maybeSingle();
  let sheet = hit?.payload as Awaited<ReturnType<typeof buildSheet>> | undefined;
  if (!sheet) {
    sheet = await buildSheet(db, id);
    if (sheet) await db.from('api_cache').upsert({ key, payload: sheet, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }, { onConflict: 'key' });
  }
  if (!sheet) return json({ error: 'actif introuvable' }, 404);
  // Free plan: closing price only (delayed intraday quote hidden).
  const quote = premium || sheet.quote?.status === 'close' ? sheet.quote : null;
  const body = premium ? { ...sheet, quote } : { ...maskForFree(sheet), quote };
  return json({ ...body, plan: premium ? 'premium' : 'free' });
}));

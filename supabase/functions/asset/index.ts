// GET /asset?id=BRVM:SNTS — full asset sheet (consensus masked for free users).
import { admin, currentUser, handler, isPremium, json } from '../_shared/runtime.ts';
import { buildSheet, maskForFree } from '../_shared/sheet.ts';

Deno.serve(handler(async (req) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'id requis' }, 400);
  const user = await currentUser(req);
  const premium = await isPremium(user?.id);
  const sheet = await buildSheet(admin(), id);
  if (!sheet) return json({ error: 'actif introuvable' }, 404);
  // Free plan: closing price only (delayed intraday quote hidden).
  const quote = premium || sheet.quote?.status === 'close' ? sheet.quote : null;
  const body = premium ? { ...sheet, quote } : { ...maskForFree(sheet), quote };
  return json({ ...body, plan: premium ? 'premium' : 'free' });
}));

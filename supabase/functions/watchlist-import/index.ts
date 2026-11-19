// POST /watchlist-import {images:[{base64, mediaType}], lang} — reads stock names / tickers on screenshots
// (broker app, portfolio, newspaper, list…) with Claude vision, then matches them against our listed assets.
// Returns candidates for the user to confirm; nothing is added server-side.
import { MODELS, generateJson } from '../_shared/ai.ts';
import { admin, asUser, audit, currentUser, handler, isPremium, json } from '../_shared/runtime.ts';
import { ENTITLEMENTS } from '../_shared/core/index.ts';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGES = 4;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['readable', 'items'],
  properties: {
    readable: { type: 'boolean' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ticker', 'name', 'exchange', 'isin'],
      properties: { ticker: { type: ['string', 'null'] }, name: { type: ['string', 'null'] }, exchange: { type: ['string', 'null'] }, isin: { type: ['string', 'null'] } } } },
  },
};

type Item = { ticker: string | null; name: string | null; exchange: string | null; isin: string | null };
type Asset = { id: string; ticker: string; name: string; market: string; isin: string | null };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['SA', 'PLC', 'CI', 'SN', 'BF', 'BN', 'TG', 'ML', 'NG', 'NC', 'LTD', 'LIMITED', 'GROUP', 'HOLDING', 'HOLDINGS', 'THE', 'DE', 'DU', 'LA', 'LE', 'ET', 'AND', 'OF', 'D']);
const tokens = (s: string) => norm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
const MARKET_HINT: Record<string, string> = { BRVM: 'BRVM', ABIDJAN: 'BRVM', UEMOA: 'BRVM', XOF: 'BRVM', BVMAC: 'BVMAC', DOUALA: 'BVMAC', LIBREVILLE: 'BVMAC', CEMAC: 'BVMAC', XAF: 'BVMAC', NGX: 'NGX', NSE: 'NGX', LAGOS: 'NGX', NGN: 'NGX', NIGERIA: 'NGX' };

function match(it: Item, assets: Asset[]): { asset: Asset; score: number } | null {
  const hint = it.exchange ? Object.entries(MARKET_HINT).find(([k]) => norm(it.exchange!).includes(k))?.[1] : undefined;
  const pool = hint ? assets.filter((a) => a.market === hint) : assets;
  if (it.isin) { const a = assets.find((x) => x.isin && x.isin === it.isin!.toUpperCase().replace(/\s/g, '')); if (a) return { asset: a, score: 1 }; }
  if (it.ticker) {
    const t = norm(it.ticker).replace(/ (BRVM|NGX|BVMAC|LG|NL|CI)$/, '').replace(/ /g, '');
    const hits = pool.filter((a) => norm(a.ticker).replace(/ /g, '') === t);
    if (hits.length === 1) return { asset: hits[0]!, score: 0.95 };
    if (hits.length > 1 && it.name) { const best = hits.map((a) => ({ asset: a, score: 0.9 * overlap(it.name!, a.name) })).sort((a, b) => b.score - a.score)[0]; if (best && best.score > 0.3) return best; }
    if (hits.length > 1) return { asset: hits[0]!, score: 0.6 };
  }
  if (it.name) {
    const best = pool.map((a) => ({ asset: a, score: overlap(it.name!, a.name) })).sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= 0.5) return { asset: best.asset, score: Math.min(0.9, best.score) };
  }
  return null;
}
function overlap(a: string, b: string) {
  const ta = tokens(a), tb = new Set(tokens(b));
  if (!ta.length || !tb.size) return 0;
  const common = ta.filter((w) => tb.has(w) || [...tb].some((x) => x.length > 3 && w.length > 3 && (x.startsWith(w) || w.startsWith(x)))).length;
  // Symmetric score: a longer exact name (TOTAL SENEGAL) beats a shorter partial one (TOTAL).
  return (common / ta.length + common / tb.size) / 2;
}

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  const { images, lang = 'fr' } = (await req.json()) as { images: { base64: string; mediaType: string }[]; lang: 'fr' | 'en' };
  if (!Array.isArray(images) || !images.length) return json({ error: 'image manquante' }, 400);
  if (images.length > MAX_IMAGES) return json({ error: `4 images maximum` }, 400);
  for (const im of images) {
    if (!ALLOWED.includes(im.mediaType) || typeof im.base64 !== 'string') return json({ error: 'image invalide' }, 400);
    if (im.base64.length > 7_000_000) return json({ error: 'IMAGE_TOO_LARGE' }, 413);
  }
  if (!(await isPremium(user.id))) {
    const { data: allowed } = await asUser(req).rpc('consume_ai_quota', { p_kind: 'watchlist_import', p_limit: ENTITLEMENTS.free.aiAnalysesPerDay });
    if (!allowed) return json({ error: 'QUOTA_EXCEEDED' }, 402);
  }

  const r = await generateJson<{ readable: boolean; items: Item[] }>({
    model: MODELS.deep, effort: 'low', maxTokens: 4000, schema: SCHEMA,
    content: [
      ...images.map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.mediaType as 'image/png', data: im.base64 } })),
      { type: 'text' as const, text:
        'Ces images sont des captures d’écran (application de courtier, portefeuille, liste de cotations, article, tableau…). ' +
        'Relève chaque action ou titre coté qui y apparaît : ticker (tel qu’écrit), nom complet de la société (avec le pays s’il est écrit), ISIN si visible, ' +
        'et la bourse (BRVM, BVMAC ou NGX) si elle est écrite OU déductible du contexte immédiat (ville : Abidjan → BRVM, Douala/Libreville → BVMAC, Lagos → NGX ; devise : FCFA/XOF → BRVM, XAF → BVMAC, naira/NGN → NGX), sinon null. ' +
        'Ne relève que ce qui est réellement lisible sur l’image : n’invente aucun titre, ne complète pas une liste. Ignore les indices, devises, cryptomonnaies et matières premières. ' +
        'Une seule entrée par titre, même s’il apparaît plusieurs fois. Si aucune liste de titres n’est lisible, readable=false et items vide.' },
    ],
  });

  const { data: assets } = await admin().from('assets').select('id, ticker, name, market, isin').eq('is_active', true);
  const seen = new Set<string>();
  const matched: { assetId: string; ticker: string; name: string; market: string; confidence: number; read: string }[] = [];
  const unmatched: string[] = [];
  for (const it of r.data.items ?? []) {
    const m = match(it, (assets ?? []) as Asset[]);
    const read = [it.ticker, it.name].filter(Boolean).join(' · ');
    if (!m) { if (read) unmatched.push(read); continue; }
    if (seen.has(m.asset.id)) continue;
    seen.add(m.asset.id);
    matched.push({ assetId: m.asset.id, ticker: m.asset.ticker, name: m.asset.name, market: m.asset.market, confidence: Math.round(m.score * 100) / 100, read });
  }
  await audit(user.id, 'watchlist_import', 'ai', null, { model: r.model, usage: r.usage, images: images.length, read: r.data.items?.length ?? 0, matched: matched.length });
  return json({ readable: r.data.readable, matched, unmatched, lang });
}));

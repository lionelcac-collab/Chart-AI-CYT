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
    portfolio_total_value: { type: ['number', 'null'] },
    portfolio_currency: { type: ['string', 'null'] },
    items: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['ticker', 'name', 'exchange', 'isin', 'quantity', 'avg_cost_price', 'total_cost', 'market_value', 'unrealized_pnl', 'last_price', 'currency'],
      properties: {
        ticker: { type: ['string', 'null'] }, name: { type: ['string', 'null'] }, exchange: { type: ['string', 'null'] }, isin: { type: ['string', 'null'] },
        quantity: { type: ['number', 'null'] }, avg_cost_price: { type: ['number', 'null'] }, total_cost: { type: ['number', 'null'] },
        market_value: { type: ['number', 'null'] }, unrealized_pnl: { type: ['number', 'null'] }, last_price: { type: ['number', 'null'] }, currency: { type: ['string', 'null'] },
      } } },
  },
};

type Item = { ticker: string | null; name: string | null; exchange: string | null; isin: string | null; quantity: number | null; avg_cost_price: number | null; total_cost: number | null; market_value: number | null; unrealized_pnl: number | null; last_price: number | null; currency: string | null };
const CUR: Record<string, string> = { FCFA: 'XOF', CFA: 'XOF', XOF: 'XOF', XAF: 'XAF', NGN: 'NGN', NAIRA: 'NGN', '₦': 'NGN', N: 'NGN' };
type Asset = { id: string; ticker: string; name: string; market: string; isin: string | null; currency: string };

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
  const { images, lang = 'fr', message } = (await req.json()) as { images: { base64: string; mediaType: string }[]; lang: 'fr' | 'en'; message?: string };
  const note = typeof message === 'string' ? message.trim().slice(0, 600) : '';
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

  const r = await generateJson<{ readable: boolean; portfolio_total_value: number | null; portfolio_currency: string | null; items: Item[] }>({
    model: MODELS.deep, effort: 'low', maxTokens: 4000, schema: SCHEMA,
    content: [
      ...images.map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.mediaType as 'image/png', data: im.base64 } })),
      { type: 'text' as const, text:
        'Ces images sont des captures d’écran (application de courtier, portefeuille, liste de cotations, article, tableau…). ' +
        'Relève chaque action ou titre coté qui y apparaît : ticker (tel qu’écrit), nom complet de la société (avec le pays s’il est écrit), ISIN si visible, ' +
        'et la bourse (BRVM, BVMAC ou NGX) si elle est écrite OU déductible du contexte immédiat (ville : Abidjan → BRVM, Douala/Libreville → BVMAC, Lagos → NGX ; devise : FCFA/XOF → BRVM, XAF → BVMAC, naira/NGN → NGX), sinon null. ' +
        'Ne relève que ce qui est réellement lisible sur l’image : n’invente aucun titre, ne complète pas une liste. Ignore les indices, devises, cryptomonnaies et matières premières. ' +
        'Pour chaque titre, relève aussi quand ils sont lisibles : quantity = nombre de titres/actions détenus ; avg_cost_price = prix de revient unitaire (PRU, prix moyen d’achat) ; ' +
        'total_cost = montant total investi (coût d’acquisition) ; market_value = valorisation de la ligne ; unrealized_pnl = plus/moins-value latente en montant (négative si perte) ; last_price = dernier cours affiché ; ' +
        'currency = devise des montants de la ligne (FCFA/XOF, XAF, NGN…). Recopie les nombres exactement (sans séparateurs de milliers, point décimal). Ne calcule rien toi-même, mets null si absent. ' +
        'portfolio_total_value = valorisation totale du portefeuille si elle est affichée. ' +
        'Une seule entrée par titre, même s’il apparaît plusieurs fois (additionne les quantités seulement s’il s’agit clairement de lignes distinctes du même titre). Si aucune liste de titres n’est lisible, readable=false et items vide.' +
        (note ? `\n\nMessage de l’utilisateur (à respecter pour l’interprétation des images, sans jamais inventer de donnée) : « ${note.replace(/[«»]/g, '"')} »` : '') },
    ],
  });

  const { data: assets } = await admin().from('assets').select('id, ticker, name, market, isin, currency').eq('is_active', true);
  const seen = new Set<string>();
  type Out = { assetId: string; ticker: string; name: string; market: string; currency: string; confidence: number; read: string;
    quantity: number | null; costAmount: number | null; costSource: string | null; marketValue: number | null; pnl: number | null; lastPrice: number | null; avgCostPrice: number | null; readCurrency: string | null; currencyMismatch: boolean };
  const matched: Out[] = [];
  const unmatched: string[] = [];
  for (const it of r.data.items ?? []) {
    const m = match(it, (assets ?? []) as Asset[]);
    const read = [it.ticker, it.name].filter(Boolean).join(' · ');
    if (!m) { if (read) unmatched.push(read); continue; }
    if (seen.has(m.asset.id)) continue;
    seen.add(m.asset.id);
    const pos = (x: number | null | undefined) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
    const qty = pos(it.quantity);
    const readCur = it.currency ? (CUR[it.currency.toUpperCase().replace(/[^A-Z₦]/g, '')] ?? it.currency.toUpperCase()) : null;
    const assetCur = m.asset.currency === 'XAF' ? 'XAF' : m.asset.currency;
    const mismatch = readCur != null && !(readCur === assetCur || (['XOF', 'XAF'].includes(readCur) && ['XOF', 'XAF'].includes(assetCur)));
    // Amount invested: explicit total cost, else quantity × average cost, else market value − unrealised gain.
    let cost: number | null = null, costSource: string | null = null;
    if (pos(it.total_cost)) { cost = it.total_cost; costSource = 'total'; }
    else if (qty && pos(it.avg_cost_price)) { cost = qty * it.avg_cost_price!; costSource = 'pru'; }
    else if (pos(it.market_value) && typeof it.unrealized_pnl === 'number') { const c = it.market_value! - it.unrealized_pnl; if (c > 0) { cost = c; costSource = 'value_minus_pnl'; } }
    matched.push({ assetId: m.asset.id, ticker: m.asset.ticker, name: m.asset.name, market: m.asset.market, currency: m.asset.currency, confidence: Math.round(m.score * 100) / 100, read,
      quantity: qty, costAmount: mismatch ? null : cost == null ? null : Math.round(cost * 100) / 100, costSource: mismatch ? null : costSource,
      marketValue: pos(it.market_value), pnl: typeof it.unrealized_pnl === 'number' ? it.unrealized_pnl : null, lastPrice: pos(it.last_price), avgCostPrice: pos(it.avg_cost_price), readCurrency: readCur, currencyMismatch: mismatch });
  }
  await audit(user.id, 'watchlist_import', 'ai', null, { model: r.model, usage: r.usage, images: images.length, read: r.data.items?.length ?? 0, matched: matched.length });
  return json({ readable: r.data.readable, matched, unmatched, totalValue: r.data.portfolio_total_value ?? null, totalCurrency: r.data.portfolio_currency ?? null, lang });
}));

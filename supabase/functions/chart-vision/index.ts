// POST /chart-vision {imageBase64, mediaType, lang} — Premium: analysis of a chart screenshot.
import { CHART_VISION_SCHEMA, MODELS, generateJson } from '../_shared/ai.ts';
import { audit, currentUser, handler, isPremium, json } from '../_shared/runtime.ts';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  if (!(await isPremium(user.id))) return json({ error: 'PREMIUM_REQUIRED' }, 402);
  const { imageBase64, mediaType, lang = 'fr' } = await req.json();
  if (!ALLOWED.includes(mediaType) || typeof imageBase64 !== 'string') return json({ error: 'image invalide' }, 400);
  if (imageBase64.length > 7_000_000) return json({ error: 'image trop lourde (max ~5 Mo)' }, 413);
  const r = await generateJson({
    model: MODELS.deep,
    schema: CHART_VISION_SCHEMA as unknown as Record<string, unknown>,
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
      { type: 'text', text: `Analyse ce graphique boursier en langue « ${lang} » : tendance, figures chartistes, niveaux clés lisibles, indicateurs visibles, scénarios baissier/central/haussier. ` +
        `Si le graphique est illisible ou n'est pas un graphique financier, mets readable=false. N'invente aucun prix non lisible sur l'image (price=null). Aucune recommandation impérative.` },
    ],
  });
  await audit(user.id, 'chart_vision', 'ai', null, { model: r.model, usage: r.usage });
  return json({ content: r.data, disclaimer: { fr: 'Lecture automatique d’image, à vérifier. Pas un conseil en investissement.', en: 'Automated image reading, to be verified. Not investment advice.' } });
}));

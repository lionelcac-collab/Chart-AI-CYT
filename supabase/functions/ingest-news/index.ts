// Job (hourly): official RSS feeds + GDELT → news_articles, then batch classification with Claude Haiku 5.5
// (ticker tagging, sentiment [-1,1], materiality 0-3, bilingual one-line summary).
import { MODELS, NEWS_CLASSIFICATION_SCHEMA, generateJson } from '../_shared/ai.ts';
import { admin, audit, handler, json, requireService } from '../_shared/runtime.ts';
import { fetchFeed, gdeltArticles, type NewsItem } from '../_shared/data/index.ts';

Deno.serve(handler(async (req) => {
  requireService(req);
  const db = admin();
  const { data: sources } = await db.from('news_sources').select('*').eq('enabled', true);
  const items: NewsItem[] = [];
  for (const s of sources ?? []) {
    try {
      items.push(...(s.kind === 'rss' ? await fetchFeed(s.url, s.name) : await gdeltArticles(s.url)));
    } catch (e) { console.warn(s.name, (e as Error).message); }
  }
  if (items.length) {
    await db.from('news_articles').upsert(items.map((n) => ({ url: n.url, title: n.title, excerpt: n.excerpt, source: n.source, language: n.language, published_at: n.publishedAt })), { onConflict: 'url', ignoreDuplicates: true });
  }

  // Classify unclassified articles in batches of 25.
  const { data: pending } = await db.from('news_articles').select('id, title, excerpt, source').is('classified_by', null).order('published_at', { ascending: false }).limit(100);
  const { data: tickers } = await db.from('assets').select('id, ticker, name').eq('is_active', true);
  const universe = (tickers ?? []).map((t) => `${t.id}=${t.name}`).join('; ');
  let classified = 0;
  for (let i = 0; i < (pending ?? []).length; i += 25) {
    const batch = pending!.slice(i, i + 25);
    const r = await generateJson<{ items: { index: number; tickers: string[]; sentiment: number; materiality: number; category: string; summary_fr: string; summary_en: string }[] }>({
      model: MODELS.bulk, effort: 'low', maxTokens: 6000,
      schema: NEWS_CLASSIFICATION_SCHEMA as unknown as Record<string, unknown>,
      content: [{ type: 'text', text:
        `Classe ces articles pour les marchés africains. Pour chaque article : tickers concernés (UNIQUEMENT parmi l'univers fourni, au format id ; liste vide sinon), ` +
        `sentiment pour l'actionnaire entre -1 et 1, matérialité 0-3, catégorie, résumé d'une phrase en français et en anglais, fondé uniquement sur le titre et l'extrait.\n` +
        `Univers : ${universe}\n\nArticles :\n` + batch.map((a, j) => `[${j}] ${a.title} — ${a.excerpt ?? ''} (${a.source})`).join('\n') }],
    });
    const valid = new Set((tickers ?? []).map((t) => t.id));
    for (const it of r.data.items) {
      const a = batch[it.index];
      if (!a) continue;
      await db.from('news_articles').update({ sentiment: Math.max(-1, Math.min(1, it.sentiment)), materiality: it.materiality, category: it.category, summary_fr: it.summary_fr, summary_en: it.summary_en, classified_by: r.model }).eq('id', a.id);
      const links = it.tickers.filter((t) => valid.has(t)).map((t) => ({ article_id: a.id, asset_id: t }));
      if (links.length) await db.from('news_asset_links').upsert(links, { onConflict: 'article_id,asset_id' });
      classified++;
    }
    await audit('system:news', 'classify', 'news_articles', null, { model: r.model, usage: r.usage, n: batch.length });
  }
  return json({ fetched: items.length, classified });
}));

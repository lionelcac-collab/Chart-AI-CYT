// Job (hourly): news from legal sources only — official exchange feeds, publishers' RSS feeds (headline, link, excerpt)
// and the GDELT open news index — then batch classification with Claude Haiku 5.5:
// relevance for African equity investors, markets (BRVM/BVMAC/NGX), tickers, sentiment [-1,1], materiality 0-3, bilingual summary.
// Irrelevant articles are deleted. Each run is logged in ingestion_runs (per-source counts / errors in `attempts`).
import { MODELS, NEWS_CLASSIFICATION_SCHEMA, generateJson } from '../_shared/ai.ts';
import { admin, audit, handler, json, requireService } from '../_shared/runtime.ts';
import { fetchFeed, gdeltArticles, type NewsItem } from '../_shared/data/index.ts';

const UA = 'Mozilla/5.0 (compatible; ChartBoursafrikIA/1.0; +https://chart-boursafrikia.com)';
const timedFetch = (url: string, init?: RequestInit) => fetch(url, { ...init, headers: { 'user-agent': UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(20000) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };
const decode = (s: string | null | undefined) => s == null ? s : s.replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&([a-z]+);/gi, (m, k) => ENT[k.toLowerCase()] ?? m).replace(/\s+/g, ' ').trim();

Deno.serve(handler(async (req) => {
  requireService(req);
  const db = admin();
  const { data: run } = await db.from('ingestion_runs').insert({ job: 'news' }).select('id').single();
  const { data: sources } = await db.from('news_sources').select('*').eq('enabled', true).order('id');
  const items: (NewsItem & { market?: string | null })[] = [];
  const attempts: { source: string; kind: string; ok: boolean; items?: number; error?: string }[] = [];
  const take = async (s: { name: string; kind: string; url: string; market: string | null }) => {
    try {
      const got = s.kind === 'rss' ? await fetchFeed(s.url, s.name, timedFetch as never) : await gdeltArticles(s.url, timedFetch as never, '7d', 40);
      const fresh = got.filter((n) => n.url && n.title && (!n.publishedAt || Date.now() - Date.parse(n.publishedAt) < 90 * 86400_000));
      items.push(...fresh.map((n) => ({ ...n, market: s.market })));
      attempts.push({ source: s.name, kind: s.kind, ok: true, items: fresh.length });
    } catch (e) { attempts.push({ source: s.name, kind: s.kind, ok: false, error: String((e as Error).message ?? e).slice(0, 160) }); }
  };
  // RSS feeds in parallel; GDELT sequentially (max 1 request / 5 s), started at the same time.
  const rss = (sources ?? []).filter((s) => s.kind === 'rss');
  const gd = (sources ?? []).filter((s) => s.kind === 'gdelt');
  await Promise.all([
    Promise.all(rss.map(take)),
    (async () => { for (let k = 0; k < gd.length; k++) { if (k) await sleep(5200); await take(gd[k]!); } })(),
  ]);
  let inserted = 0;
  if (items.length) {
    const { data } = await db.from('news_articles').upsert(items.map((n) => ({
      url: n.url, title: decode(n.title)!.slice(0, 500), excerpt: decode(n.excerpt)?.slice(0, 1000) ?? null, source: n.source, language: n.language, published_at: n.publishedAt,
      markets: n.market ? [n.market] : [],
    })), { onConflict: 'url', ignoreDuplicates: true }).select('id');
    inserted = data?.length ?? 0;
  }

  const failed = attempts.filter((a) => !a.ok).length;
  await db.from('ingestion_runs').update({ status: failed && failed === attempts.length ? 'failed' : failed ? 'partial' : 'ok', rows_written: inserted, attempts,
    error: failed ? `${failed} source(s) en échec` : null, source_used: 'classification en cours' }).eq('id', run!.id);

  // Classify unclassified articles in batches of 25 (at most 50 per run to stay within the function time limit; the hourly runs catch up).
  const { data: pending } = await db.from('news_articles').select('id, title, excerpt, source, markets').is('classified_by', null).order('published_at', { ascending: false }).limit(50);
  // Paged read of listed companies (equities only); per batch only the exchanges concerned are sent (keeps the prompt small).
  const tickers: { id: string; ticker: string; name: string; market: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('assets').select('id, ticker, name, market').eq('is_active', true).eq('asset_class', 'equity').order('id').range(from, from + 999);
    tickers.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const universeFor = (batch: { markets: string[] | null }[]) => {
    const ms = new Set(batch.flatMap((b) => b.markets ?? []));
    const all = batch.some((b) => !b.markets?.length);
    return tickers.filter((t) => all ? ['BRVM', 'BVMAC', 'NGX'].includes(t.market) || ms.has(t.market) : ms.has(t.market)).map((t) => `${t.id}=${t.name}`).join('; ');
  };
  const valid = new Set(tickers.map((t) => t.id));
  let classified = 0, dropped = 0;
  for (let i = 0; i < (pending ?? []).length; i += 25) {
    const batch = pending!.slice(i, i + 25);
    const r = await generateJson<{ items: { index: number; relevant: boolean; markets: string[]; tickers: string[]; sentiment: number; materiality: number; category: string; summary_fr: string; summary_en: string }[] }>({
      model: MODELS.bulk, effort: 'low', maxTokens: 8000,
      schema: NEWS_CLASSIFICATION_SCHEMA as unknown as Record<string, unknown>,
      content: [{ type: 'text', text:
        `Classe ces articles pour des investisseurs en actions africaines (BRVM : 8 pays de l'UEMOA ; BVMAC : CEMAC ; NGX : Nigeria ; JSE : Afrique du Sud ; EGX : Égypte ; CSE_MA : Maroc ; NSE_KE : Kenya ; GSE : Ghana ; DSE : Tanzanie ; USE : Ouganda ; RSE : Rwanda). Pour chaque article :\n` +
        `- relevant : true seulement s'il concerne une société cotée sur ces bourses, ces bourses elles-mêmes, leurs régulateurs, les émissions de titres de ces zones, ou l'économie/la politique monétaire de ces pays avec un impact plausible pour les actionnaires ; false sinon (sport, faits divers, autres pays…) ;\n` +
        `- markets : bourses concernées ; tickers : UNIQUEMENT parmi l'univers fourni (format id), liste vide si aucun titre précis n'est concerné ;\n` +
        `- sentiment pour l'actionnaire entre -1 et 1, matérialité 0-3, catégorie, résumé d'une phrase en français et en anglais, fondé uniquement sur le titre et l'extrait (n'invente rien).\n` +
        `Univers : ${universeFor(batch)}\n\nArticles :\n` + batch.map((a, j) => `[${j}] ${a.title} — ${a.excerpt ?? ''} (${a.source})`).join('\n') }],
    });
    for (const it of r.data.items) {
      const a = batch[it.index];
      if (!a) continue;
      const links = [...new Set(it.tickers.filter((t) => valid.has(t)))];
      if (!it.relevant && !links.length) { await db.from('news_articles').delete().eq('id', a.id); dropped++; continue; }
      const markets = [...new Set([...(a.markets ?? []), ...it.markets, ...links.map((t) => t.split(':')[0]!)])];
      await db.from('news_articles').update({ sentiment: Math.max(-1, Math.min(1, it.sentiment)), materiality: it.materiality, category: it.category, summary_fr: it.summary_fr, summary_en: it.summary_en, classified_by: r.model, relevant: true, markets }).eq('id', a.id);
      if (links.length) await db.from('news_asset_links').upsert(links.map((t) => ({ article_id: a.id, asset_id: t })), { onConflict: 'article_id,asset_id' });
      classified++;
    }
    await audit('system:news', 'classify', 'news_articles', null, { model: r.model, usage: r.usage, n: batch.length });
  }
  await db.from('ingestion_runs').update({ finished_at: new Date().toISOString(), source_used: `${classified} classés, ${dropped} écartés` }).eq('id', run!.id);
  return json({ fetched: items.length, inserted, classified, dropped, attempts });
}));

/**
 * News sources: official RSS feeds (exchanges, regulators, issuers) + GDELT DOC 2.0 API.
 * Only titles, links, dates and short excerpts are stored (fair use); the app
 * links back to the original article. Classification (ticker tagging,
 * sentiment, materiality) is done by Claude Haiku in the `classify-news` job.
 */
import type { FetchLike } from './connector';

export interface NewsItem {
  title: string;
  url: string;
  publishedAt: string | null;
  source: string;
  excerpt: string | null;
  language: string | null;
}

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/<[^>]+>/g, '') // escaped HTML inside <description>
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]!) : null;
};

/** Minimal RSS 2.0 / Atom parser (no dependency, runs in Deno and React Native). */
export function parseFeed(xml: string, source: string): NewsItem[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return items.map((it) => {
    const atomLink = it.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    const date = tag(it, 'pubDate') ?? tag(it, 'published') ?? tag(it, 'updated') ?? tag(it, 'dc:date');
    const parsed = date ? new Date(date) : null;
    return {
      title: tag(it, 'title') ?? '',
      url: tag(it, 'link') || atomLink || '',
      publishedAt: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      source,
      excerpt: (tag(it, 'description') ?? tag(it, 'summary'))?.slice(0, 400) ?? null,
      language: null,
    };
  }).filter((n) => n.title && n.url);
}

export async function fetchFeed(url: string, source: string, fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike): Promise<NewsItem[]> {
  const res = await fetchImpl(url, { headers: { accept: 'application/rss+xml, application/atom+xml, text/xml' } });
  if (!res.ok) throw new Error(`RSS ${source} HTTP ${res.status}`);
  return parseFeed(await res.text(), source);
}

/** GDELT DOC 2.0 article list. `query` e.g. '"Sonatel" OR "BRVM"'. */
export async function gdeltArticles(query: string, fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike, timespan = '3d', max = 50): Promise<NewsItem[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=${max}&timespan=${timespan}&sort=datedesc`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
  const body = (await res.json()) as { articles?: { url: string; title: string; seendate: string; domain: string; language: string }[] };
  return (body.articles ?? []).map((a) => ({
    title: a.title,
    url: a.url,
    // seendate format: 20240612T101500Z
    publishedAt: a.seendate ? `${a.seendate.slice(0, 4)}-${a.seendate.slice(4, 6)}-${a.seendate.slice(6, 8)}T${a.seendate.slice(9, 11)}:${a.seendate.slice(11, 13)}:${a.seendate.slice(13, 15)}Z` : null,
    source: `gdelt:${a.domain}`,
    excerpt: null,
    language: a.language ?? null,
  }));
}

/** Official feeds to configure in `news_sources` (URLs to confirm — exchanges change them). */
export const DEFAULT_FEEDS: { source: string; url: string; market: string }[] = [
  // Fill with confirmed official RSS URLs (BRVM, AMF-UMOA, COSUMAF, BVMAC, NGX, SEC Nigeria, issuers).
];

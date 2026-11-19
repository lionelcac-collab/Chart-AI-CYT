/**
 * DEMO data provider — used only when no backend is configured (or EXPO_PUBLIC_DEMO=1).
 * All names are FICTIONAL ("Démo …") and every screen shows a "MODE DÉMO — données
 * fictives" banner, so no synthetic number can be mistaken for a real price.
 * Indicators, highs/lows and the consensus are computed by the real @nyota/core code.
 */
import {
  computeConsensus, computePerformances, computeRanges, liquidity, scanMarket, technicalSnapshot, type Bar, type CurrencyCode, type MarketCode,
  type ScanPeriod, type ScanRow,
} from '@nyota/core';
import type { AssetSheet, AssetSummary, Dashboard, NewsItem, TrackRecordRow } from './types';

interface DemoAsset { id: string; ticker: string; name: string; market: MarketCode; sector: string; currency: CurrencyCode; start: number; drift: number; vol: number; tradeProb: number }

const sectorNames: Record<string, { fr: string; en: string }> = {
  banks: { fr: 'Banques', en: 'Banks' }, telecom: { fr: 'Télécoms', en: 'Telecoms' }, consumer: { fr: 'Consommation', en: 'Consumer' },
  agri: { fr: 'Agro-industrie', en: 'Agribusiness' }, energy: { fr: 'Énergie', en: 'Energy' }, industry: { fr: 'Industrie', en: 'Industrials' },
};

export const DEMO_ASSETS: DemoAsset[] = [
  { id: 'BRVM:DEMBK', ticker: 'DEMBK', name: 'Démo Banque Atlantique', market: 'BRVM', sector: 'banks', currency: 'XOF', start: 6200, drift: 0.0006, vol: 0.011, tradeProb: 0.95 },
  { id: 'BRVM:DEMTL', ticker: 'DEMTL', name: 'Démo Télécom Sahel', market: 'BRVM', sector: 'telecom', currency: 'XOF', start: 18500, drift: 0.0004, vol: 0.009, tradeProb: 0.98 },
  { id: 'BRVM:DEMAG', ticker: 'DEMAG', name: 'Démo Palmeraie', market: 'BRVM', sector: 'agri', currency: 'XOF', start: 4100, drift: -0.0003, vol: 0.016, tradeProb: 0.7 },
  { id: 'BRVM:DEMEN', ticker: 'DEMEN', name: 'Démo Énergie Lagune', market: 'BRVM', sector: 'energy', currency: 'XOF', start: 2300, drift: 0.0002, vol: 0.012, tradeProb: 0.6 },
  { id: 'BRVM:DEMCS', ticker: 'DEMCS', name: 'Démo Brasseries du Golfe', market: 'BRVM', sector: 'consumer', currency: 'XOF', start: 980, drift: 0.0008, vol: 0.018, tradeProb: 0.4 },
  { id: 'BVMAC:DEMCM', ticker: 'DEMCM', name: 'Démo Cimenterie Centrale', market: 'BVMAC', sector: 'industry', currency: 'XAF', start: 39000, drift: 0.0001, vol: 0.006, tradeProb: 0.15 },
  { id: 'BVMAC:DEMBV', ticker: 'DEMBV', name: 'Démo Banque Équatoriale', market: 'BVMAC', sector: 'banks', currency: 'XAF', start: 45000, drift: 0.0002, vol: 0.005, tradeProb: 0.12 },
  { id: 'NGX:DEMNB', ticker: 'DEMNB', name: 'Demo Niger Delta Bank', market: 'NGX', sector: 'banks', currency: 'NGN', start: 38, drift: 0.0009, vol: 0.022, tradeProb: 1 },
  { id: 'NGX:DEMNC', ticker: 'DEMNC', name: 'Demo Cement Holdings', market: 'NGX', sector: 'industry', currency: 'NGN', start: 420, drift: 0.0005, vol: 0.017, tradeProb: 0.99 },
  { id: 'NGX:DEMNT', ticker: 'DEMNT', name: 'Demo Telecom Nigeria', market: 'NGX', sector: 'telecom', currency: 'NGN', start: 210, drift: -0.0002, vol: 0.02, tradeProb: 0.99 },
  { id: 'NGX:DEMNF', ticker: 'DEMNF', name: 'Demo Foods Plc', market: 'NGX', sector: 'consumer', currency: 'NGN', start: 55, drift: 0.0003, vol: 0.025, tradeProb: 0.9 },
];

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

const cache = new Map<string, Bar[]>();
export function demoBars(a: DemoAsset): Bar[] {
  const hit = cache.get(a.id);
  if (hit) return hit;
  const r = rng(hash(a.id));
  const out: Bar[] = [];
  const end = new Date(); end.setUTCHours(0, 0, 0, 0);
  const d = new Date(end); d.setUTCFullYear(d.getUTCFullYear() - 3);
  let p = a.start;
  while (d < end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const traded = r() < a.tradeProb;
      const z = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
      const prev = p;
      if (traded) p = Math.max(1, p * Math.exp(a.drift + a.vol * z));
      const hi = Math.max(prev, p) * (1 + r() * a.vol * 0.5), lo = Math.min(prev, p) * (1 - r() * a.vol * 0.5);
      const vol = traded ? Math.round((500 + r() * 8000) * (a.currency === 'NGN' ? 300 : 1)) : 0;
      out.push({ date: d.toISOString().slice(0, 10), open: prev, high: traded ? hi : p, low: traded ? lo : p, close: Math.round(p * 100) / 100, volume: vol, value: vol * p });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  cache.set(a.id, out);
  return out;
}

/** Fictional company profiles (demo only). */
const DEMO_PROFILES: Record<string, { fr: string; en: string; hq: string; founded: number; employees: number }> = {
  banks: { fr: 'Banque commerciale fictive : crédit aux entreprises et aux particuliers, mobile banking, transferts régionaux.', en: 'Fictional commercial bank: corporate and retail lending, mobile banking, regional transfers.', hq: 'Ville Démo', founded: 1978, employees: 1450 },
  telecom: { fr: 'Opérateur télécom fictif : mobile, internet fixe et mobile money dans plusieurs pays.', en: 'Fictional telecom operator: mobile, fixed internet and mobile money in several countries.', hq: 'Ville Démo', founded: 1985, employees: 2900 },
  agri: { fr: 'Agro-industrie fictive : plantations de palmiers à huile et transformation.', en: 'Fictional agribusiness: oil-palm plantations and processing.', hq: 'Ville Démo', founded: 1969, employees: 3800 },
  energy: { fr: 'Producteur et distributeur d’électricité fictif.', en: 'Fictional power producer and distributor.', hq: 'Ville Démo', founded: 1990, employees: 2100 },
  consumer: { fr: 'Brasseur et embouteilleur fictif de boissons.', en: 'Fictional brewer and beverage bottler.', hq: 'Ville Démo', founded: 1958, employees: 1200 },
  industry: { fr: 'Industriel fictif : ciment et matériaux de construction.', en: 'Fictional industrial group: cement and building materials.', hq: 'Ville Démo', founded: 1963, employees: 950 },
};

const NEWS_TEMPLATES: { fr: string; en: string; cat: string; sent: number }[] = [
  { fr: '{name} publie un chiffre d’affaires semestriel en hausse', en: '{name} reports higher half-year revenue', cat: 'results', sent: 0.5 },
  { fr: '{name} convoque son assemblée générale et propose un dividende', en: '{name} calls its AGM and proposes a dividend', cat: 'dividend', sent: 0.3 },
  { fr: 'Changement de direction générale chez {name}', en: 'CEO change at {name}', cat: 'management', sent: -0.1 },
  { fr: '{name} : résultat trimestriel en recul sur la hausse des coûts', en: '{name}: quarterly profit down on higher costs', cat: 'results', sent: -0.4 },
];

/** Fictional news (demo only): no link, source "Démo". */
export function demoNews(market?: MarketCode, assetId?: string): NewsItem[] {
  const list = DEMO_ASSETS.filter((a) => (!market || a.market === market) && (!assetId || a.id === assetId));
  const out: NewsItem[] = [];
  list.forEach((a, i) => {
    const last = demoBars(a)[demoBars(a).length - 1]!.date;
    [0, 1].forEach((k) => {
      const tpl = NEWS_TEMPLATES[(i + k * 2) % NEWS_TEMPLATES.length]!;
      const d = new Date(`${last}T09:00:00Z`); d.setUTCDate(d.getUTCDate() - (i * 3 + k * 9));
      out.push({
        id: `${a.id}-${k}`, title: `${tpl.fr.replace('{name}', a.name)} (exemple fictif)`, url: null, source: 'Démo',
        published_at: d.toISOString(), sentiment: tpl.sent, category: tpl.cat, materiality: 2,
        summary_fr: 'Actualité fictive générée pour la démonstration.', summary_en: `${tpl.en.replace('{name}', a.name)} (fictional example).`, asset_ids: [a.id],
      });
    });
  });
  return out.sort((x, y) => String(y.published_at).localeCompare(String(x.published_at)));
}

export function demoScan(market: MarketCode, period: ScanPeriod): ScanRow[] {
  return scanMarket(DEMO_ASSETS.filter((a) => a.market === market).map((a) => ({ assetId: a.id, ticker: a.ticker, name: a.name, bars: demoBars(a) })), period);
}

const demoStatus = (bars: Bar[]) => ({ kind: 'close' as const, sessionDate: bars[bars.length - 1]!.date });

export function demoSummary(a: DemoAsset): AssetSummary {
  const b = demoBars(a);
  const last = b[b.length - 1]!, prev = b[b.length - 2]!;
  return {
    id: a.id, ticker: a.ticker, name: a.name, market: a.market, sector: a.sector, currency: a.currency,
    last: last.close, changePct: ((last.close - prev.close) / prev.close) * 100, volume: last.volume, value: last.value ?? null,
    status: demoStatus(b), source: 'demo',
  };
}

export function demoSheet(id: string, premium: boolean): AssetSheet | null {
  const a = DEMO_ASSETS.find((x) => x.id === id);
  if (!a) return null;
  const bars = demoBars(a);
  const last = bars[bars.length - 1]!;
  const s = demoSummary(a);
  const consensus = computeConsensus({ bars, sentiment: null });
  return {
    plan: premium ? 'premium' : 'free',
    asset: {
      id: a.id, ticker: a.ticker, name: a.name, market: a.market, currency: a.currency, isin: null,
      sectors: { code: a.sector, name_fr: sectorNames[a.sector]!.fr, name_en: sectorNames[a.sector]!.en },
      activity_fr: DEMO_PROFILES[a.sector]?.fr ?? null, activity_en: DEMO_PROFILES[a.sector]?.en ?? null,
      headquarters: DEMO_PROFILES[a.sector]?.hq ?? null, founded_year: DEMO_PROFILES[a.sector]?.founded ?? null, employees: DEMO_PROFILES[a.sector]?.employees ?? null,
    },
    quote: { last: last.close, change_pct: s.changePct, volume: last.volume, value: last.value ?? null, market_cap: null, status: 'close', delay_minutes: null, as_of: last.date, source: 'demo' },
    lastClose: { price: last.close, date: last.date },
    bars,
    ranges: computeRanges(bars),
    performance: computePerformances(bars),
    liquidity: liquidity(bars),
    ratios: { netMarginPct: null, roePct: null, debtToEquity: null, per: null, pb: null, dividendYieldPct: null, payoutPct: null, revenueCagr3yPct: null, netIncomeCagr3yPct: null },
    fundamentals: [], dividends: [], shareholders: [], executives: [],
    events: [
      { kind: 'agm', event_date: new Date(Date.parse(`${last.date}T00:00:00Z`) + 21 * 86400_000).toISOString().slice(0, 10), title_fr: 'Assemblée générale ordinaire (exemple fictif)', title_en: 'Annual general meeting (fictional example)' },
      { kind: 'results', event_date: new Date(Date.parse(`${last.date}T00:00:00Z`) + 45 * 86400_000).toISOString().slice(0, 10), title_fr: 'Publication des résultats annuels (exemple fictif)', title_en: 'Full-year results (fictional example)' },
    ],
    documents: [],
    peers: DEMO_ASSETS.filter((x) => x.sector === a.sector && x.id !== a.id).map((x) => ({ id: x.id, ticker: x.ticker, name: x.name, market: x.market })),
    technical: technicalSnapshot(bars),
    news: demoNews(undefined, a.id),
    analysts: null,
    consensus: !consensus ? null : premium ? consensus : {
      orientation: consensus.orientation, confidence: consensus.confidence, asOf: consensus.asOf, modelVersion: consensus.modelVersion,
      disclaimer: consensus.disclaimer, analysts: null, locked: true,
    },
  };
}

export function demoDashboard(market: MarketCode): Dashboard {
  const list = DEMO_ASSETS.filter((a) => a.market === market).map(demoSummary);
  const bySector = new Map<string, { sum: number; n: number }>();
  list.forEach((s) => { const e = bySector.get(s.sector!) ?? { sum: 0, n: 0 }; e.sum += s.changePct ?? 0; e.n++; bySector.set(s.sector!, e); });
  const idxVal = list.reduce((acc, s) => acc + (s.changePct ?? 0), 0) / Math.max(1, list.length);
  const opp = DEMO_ASSETS.filter((a) => a.market === market).map((a) => {
    const c = computeConsensus({ bars: demoBars(a) });
    return { asset_id: a.id, name: a.name, score: c ? c.forecasts[3]!.score : 0, illiquid: c?.liquidity.warning ?? true, confidence: c?.confidence ?? 'low' };
  }).sort((x, y) => Number(x.illiquid) - Number(y.illiquid) || y.score - x.score);
  return {
    market,
    indices: [{ code: `${market}-DEMO`, name: `Indice démo ${market}`, market, value: 100 * (1 + idxVal / 100), changePct: idxVal, date: list[0]?.status.kind === 'close' ? list[0].status.sessionDate : '', source: 'demo' }],
    movers: list,
    sectors: [...bySector.entries()].map(([sector, v]) => ({ sector, changePct: v.sum / v.n, count: v.n })),
    opportunities: opp,
    report: null,
  };
}

export const demoTrackRecord: TrackRecordRow[] = [];

export const sectorLabel = (code: string | null | undefined, lang: 'fr' | 'en') => (code ? sectorNames[code]?.[lang] ?? code : '—');

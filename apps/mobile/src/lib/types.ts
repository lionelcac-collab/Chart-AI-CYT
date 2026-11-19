import type {
  AnalystConsensus, Bar, ConsensusResult, Confidence, CurrencyCode, DataStatus, LiquidityStat, MarketCode,
  Orientation, PerformanceStat, RangeStat, Ratios, TechnicalSnapshot,
} from '@nyota/core';

export interface AssetSummary {
  id: string;
  ticker: string;
  name: string;
  market: MarketCode;
  sector: string | null;
  currency: CurrencyCode;
  last: number | null;
  changePct: number | null;
  volume: number | null;
  value: number | null;
  status: DataStatus;
  source: string;
  /** Source timestamp when known (ISO date or date-time). */
  asOf?: string;
}

export interface MaskedConsensus {
  orientation: Orientation;
  confidence: Confidence;
  asOf: string;
  modelVersion: string;
  disclaimer: { fr: string; en: string };
  analysts: { count: number } | null;
  locked: true;
}

export interface AssetSheet {
  plan: 'free' | 'premium';
  asset: {
    id: string; ticker: string; isin?: string | null; name: string; market: MarketCode; country?: string | null; currency: CurrencyCode;
    listing_date?: string | null; share_capital?: number | null; shares_outstanding?: number | null; free_float_pct?: number | null; website?: string | null;
    description_fr?: string | null; description_en?: string | null; activity_fr?: string | null; activity_en?: string | null;
    headquarters?: string | null; employees?: number | null; founded_year?: number | null;
    sectors?: { code: string; name_fr: string; name_en: string } | null;
  };
  quote: { last: number; change_pct: number | null; volume: number | null; value: number | null; market_cap: number | null; status: DataStatus['kind']; delay_minutes: number | null; as_of: string; source: string } | null;
  lastClose: { price: number; date: string } | null;
  bars: Bar[];
  ranges: RangeStat[];
  performance: PerformanceStat[];
  liquidity: LiquidityStat | null;
  ratios: Ratios;
  fundamentals: { fiscalYear: number; revenue?: number | null; netIncome?: number | null; provenance: { source: string } }[];
  dividends: { amount: number; currency: string; ex_date: string | null; payment_date: string | null; fiscal_year: number | null; source: string }[];
  shareholders: { holder: string; pct: number | null; as_of: string | null; source: string }[];
  executives: { person: string; role: string; source: string }[];
  events: { kind: string; event_date: string; title_fr: string | null; title_en: string | null }[];
  peers: { id: string; ticker: string; name: string; market: string }[];
  documents?: { kind: string; title: string | null; url: string; published_at: string | null }[];
  technical: TechnicalSnapshot | null;
  news: NewsItem[];
  analysts: AnalystConsensus | null;
  consensus: ConsensusResult | MaskedConsensus | null;
}

export const isFullConsensus = (c: AssetSheet['consensus']): c is ConsensusResult => !!c && !('locked' in c);

export interface IndexSummary { code: string; name: string; market: MarketCode; value: number; changePct: number | null; date: string; source: string }

export interface Dashboard {
  market: MarketCode;
  indices: IndexSummary[];
  movers: AssetSummary[];
  sectors: { sector: string; changePct: number; count: number }[];
  opportunities: { asset_id: string; name: string; score: number; illiquid: boolean; confidence: string }[];
  report: { title: string; body_fr: string; body_en: string } | null;
}

export interface AiAnalysis {
  headline: string; summary: string; technical: string; fundamental: string; risks: string[];
  scenarios: { name: 'bear' | 'central' | 'bull'; description: string; trigger: string }[];
  keyLevels: { label: string; price: number }[]; dataGaps: string[]; sources: { label: string; date: string }[];
}

export interface TrackRecordRow { scope: string; horizon: string; samples: number; calls: number; hits: number; hit_rate: number | null; range_coverage: number | null; base_rate_up: number | null; period_start: string; period_end: string }

export interface NewsItem {
  id: number | string;
  title: string;
  url: string | null;
  source: string;
  published_at: string | null;
  sentiment: number | null;
  materiality?: number | null;
  category?: string | null;
  summary_fr: string | null;
  summary_en: string | null;
  asset_ids?: string[];
}

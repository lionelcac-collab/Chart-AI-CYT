import type { CurrencyCode, MarketCode } from './types';

export interface MarketInfo {
  code: MarketCode;
  name: string;
  countries: string[];          // ISO-3166 alpha-2
  currency: CurrencyCode;
  timezone: string;             // IANA
  /** Continuous session, local time HH:MM. */
  open: string;
  close: string;
  /** Minutes after close when the official bulletin is usually published. */
  bulletinDelayMin: number;
  regulator: string;
  phase: 1 | 2;
  website: string;
  /** Trading weekdays (0 = Sunday). Default Monday–Friday. EGX trades Sunday–Thursday. */
  tradingDays?: number[];
}

const ACTIVE_MARKETS_LIST = ['BRVM', 'BVMAC', 'NGX', 'JSE', 'EGX', 'CSE_MA', 'NSE_KE', 'GSE', 'DSE', 'USE', 'RSE'] as const;

/**
 * Trading hours are indicative and must be confirmed against each exchange's
 * current rulebook before go-live (they change occasionally).
 */
export const MARKETS: Record<(typeof ACTIVE_MARKETS_LIST)[number], MarketInfo> & Partial<Record<MarketCode, MarketInfo>> = {
  BRVM: {
    code: 'BRVM', name: 'Bourse Régionale des Valeurs Mobilières',
    countries: ['CI', 'SN', 'BJ', 'BF', 'ML', 'NE', 'TG', 'GW'], currency: 'XOF',
    timezone: 'Africa/Abidjan', open: '09:00', close: '15:00', bulletinDelayMin: 120,
    regulator: 'AMF-UMOA', phase: 1, website: 'https://www.brvm.org',
  },
  BVMAC: {
    code: 'BVMAC', name: 'Bourse des Valeurs Mobilières de l’Afrique Centrale',
    countries: ['CM', 'GA', 'CG', 'TD', 'CF', 'GQ'], currency: 'XAF',
    timezone: 'Africa/Douala', open: '09:00', close: '14:00', bulletinDelayMin: 180,
    regulator: 'COSUMAF', phase: 1, website: 'https://www.bvm-ac.org',
  },
  NGX: {
    code: 'NGX', name: 'Nigerian Exchange',
    countries: ['NG'], currency: 'NGN',
    timezone: 'Africa/Lagos', open: '10:00', close: '14:30', bulletinDelayMin: 90,
    regulator: 'SEC Nigeria', phase: 1, website: 'https://ngxgroup.com',
  },
  JSE: { code: 'JSE', name: 'Johannesburg Stock Exchange', countries: ['ZA'], currency: 'ZAR', timezone: 'Africa/Johannesburg', open: '09:00', close: '17:00', bulletinDelayMin: 60, regulator: 'FSCA', phase: 1, website: 'https://www.jse.co.za' },
  EGX: { code: 'EGX', name: 'Egyptian Exchange', countries: ['EG'], currency: 'EGP', timezone: 'Africa/Cairo', open: '10:00', close: '14:30', bulletinDelayMin: 60, regulator: 'FRA', phase: 1, website: 'https://www.egx.com.eg', tradingDays: [0, 1, 2, 3, 4] },
  CSE_MA: { code: 'CSE_MA', name: 'Bourse de Casablanca', countries: ['MA'], currency: 'MAD', timezone: 'Africa/Casablanca', open: '09:30', close: '15:30', bulletinDelayMin: 60, regulator: 'AMMC', phase: 1, website: 'https://www.casablanca-bourse.com' },
  NSE_KE: { code: 'NSE_KE', name: 'Nairobi Securities Exchange', countries: ['KE'], currency: 'KES', timezone: 'Africa/Nairobi', open: '09:30', close: '15:00', bulletinDelayMin: 60, regulator: 'CMA Kenya', phase: 1, website: 'https://www.nse.co.ke' },
  GSE: { code: 'GSE', name: 'Ghana Stock Exchange', countries: ['GH'], currency: 'GHS', timezone: 'Africa/Accra', open: '10:00', close: '15:00', bulletinDelayMin: 60, regulator: 'SEC Ghana', phase: 1, website: 'https://gse.com.gh' },
  DSE: { code: 'DSE', name: 'Dar es Salaam Stock Exchange', countries: ['TZ'], currency: 'TZS', timezone: 'Africa/Dar_es_Salaam', open: '10:00', close: '16:00', bulletinDelayMin: 60, regulator: 'CMSA Tanzania', phase: 1, website: 'https://www.dse.co.tz' },
  USE: { code: 'USE', name: 'Uganda Securities Exchange', countries: ['UG'], currency: 'UGX', timezone: 'Africa/Kampala', open: '10:00', close: '16:00', bulletinDelayMin: 60, regulator: 'CMA Uganda', phase: 1, website: 'https://www.use.or.ug' },
  RSE: { code: 'RSE', name: 'Rwanda Stock Exchange', countries: ['RW'], currency: 'RWF', timezone: 'Africa/Kigali', open: '09:00', close: '12:00', bulletinDelayMin: 60, regulator: 'CMA Rwanda', phase: 1, website: 'https://www.rse.rw' },
};

/** Exchanges covered by the app (order = display order). */
export const ACTIVE_MARKETS = ['BRVM', 'BVMAC', 'NGX', 'JSE', 'EGX', 'CSE_MA', 'NSE_KE', 'GSE', 'DSE', 'USE', 'RSE'] as const;
/** Kept for compatibility: every job loops over the active exchanges. */
export const MVP_MARKETS = ACTIVE_MARKETS;

/** Short display label and country/zone of each exchange. */
export const MARKET_LABEL: Partial<Record<MarketCode, { short: string; fr: string; en: string }>> = {
  BRVM: { short: 'BRVM', fr: 'UEMOA', en: 'WAEMU' }, BVMAC: { short: 'BVMAC', fr: 'CEMAC', en: 'CEMAC' }, NGX: { short: 'NGX', fr: 'Nigeria', en: 'Nigeria' },
  JSE: { short: 'JSE', fr: 'Afrique du Sud', en: 'South Africa' }, EGX: { short: 'EGX', fr: 'Égypte', en: 'Egypt' }, CSE_MA: { short: 'BVC', fr: 'Maroc', en: 'Morocco' },
  NSE_KE: { short: 'NSE', fr: 'Kenya', en: 'Kenya' }, GSE: { short: 'GSE', fr: 'Ghana', en: 'Ghana' }, DSE: { short: 'DSE', fr: 'Tanzanie', en: 'Tanzania' },
  USE: { short: 'USE', fr: 'Ouganda', en: 'Uganda' }, RSE: { short: 'RSE', fr: 'Rwanda', en: 'Rwanda' },
};
export const marketLabel = (code: string | null | undefined) => (code ? MARKET_LABEL[code as MarketCode]?.short ?? code : '');

/** Local time (HH:MM) and weekday of a given instant in a timezone. */
export function localClock(tz: string, at: Date = new Date()): { hhmm: string; weekday: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { hhmm: `${get('hour')}:${get('minute')}`.replace(/^24/, '00'), weekday: wd, date: `${get('year')}-${get('month')}-${get('day')}` };
}

export type SessionState = 'pre_open' | 'open' | 'closed' | 'weekend';

/** Holidays are handled by the `market_holidays` table; this only checks weekday/hours. */
export function sessionState(m: MarketInfo, at: Date = new Date(), holidays: string[] = []): SessionState {
  const { hhmm, weekday, date } = localClock(m.timezone, at);
  if (!(m.tradingDays ?? [1, 2, 3, 4, 5]).includes(weekday) || holidays.includes(date)) return 'weekend';
  if (hhmm < m.open) return 'pre_open';
  if (hhmm < m.close) return 'open';
  return 'closed';
}

/** True when the daily ingestion job for a market should run (after close + bulletin delay). */
export function isIngestionWindow(m: MarketInfo, at: Date = new Date()): boolean {
  const { hhmm, weekday } = localClock(m.timezone, at);
  if (!(m.tradingDays ?? [1, 2, 3, 4, 5]).includes(weekday)) return false;
  const [h, mm] = m.close.split(':').map(Number) as [number, number];
  const t = h * 60 + mm + m.bulletinDelayMin;
  const ready = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  return hhmm >= ready;
}

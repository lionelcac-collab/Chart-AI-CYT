// Saves the corporate calendar, dividends and capital operations read from a BRVM official bulletin.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { parseBrvmDividends, parseBrvmMeetings, parseBrvmOperations } from './data/index.ts';

const SOURCE = 'official_bulletin:BRVM';
const issuerFromTitle = (t: string) =>
  /^(?:Agrément|Visa)[^A-Z]*?((?:FCTC|FCP|SICAV)?\s*[A-Z][A-Z0-9 \-]+?)(?:\s+(?:sur|dénommé|pour)(?=\s|$)|$)/.exec(t)?.[1]?.trim()
  ?? t.replace(/^(SOCIAL|GREEN|GENDER|SUSTAINABILITY|SUSTAINABLE|GSS|BLUE)\s+BOND\s+/i, '').replace(/\s+\d[\d,.]*\s*%.*$/, '').trim();

export async function saveBrvmEvents(db: SupabaseClient, text: string, sourceUrl: string | null) {
  const { data: assets } = await db.from('assets').select('ticker').eq('market', 'BRVM');
  const tickers = new Set((assets ?? []).map((a) => a.ticker as string));
  const today = new Date().toISOString().slice(0, 10);

  const meetings = parseBrvmMeetings(text, tickers).filter((m) => m.ticker);
  const meetingRows = meetings.map((m) => ({
    asset_id: `BRVM:${m.ticker}`, kind: m.kind, event_date: m.date, source: SOURCE, source_url: sourceUrl,
    title_fr: `Assemblée générale ${m.nature.toLowerCase()}${m.cancelled ? ' (annulée)' : ''}`,
    title_en: `${m.nature === 'Ordinaire' ? 'Ordinary' : m.nature === 'Extraordinaire' ? 'Extraordinary' : 'Combined'} general meeting${m.cancelled ? ' (cancelled)' : ''}`,
    details: { issuer: m.issuer, nature: m.nature, time: m.time, venue: m.venue, cancelled: m.cancelled },
  }));

  const dividends = parseBrvmDividends(text, tickers);
  const divRows = dividends.map((d) => ({ asset_id: `BRVM:${d.ticker}`, amount: d.amount, currency: 'XOF', payment_date: d.paymentDate, fiscal_year: Number(d.paymentDate.slice(0, 4)) - 1, source: SOURCE }));
  const divEvents = dividends.map((d) => ({
    asset_id: `BRVM:${d.ticker}`, kind: 'dividend', event_date: d.paymentDate, source: SOURCE, source_url: sourceUrl,
    title_fr: `Paiement du dividende : ${d.amount.toLocaleString('fr-FR')} FCFA net par action${d.yieldPct != null ? ` (rendement net ${d.yieldPct.toLocaleString('fr-FR')} %)` : ''}`,
    title_en: `Dividend payment: XOF ${d.amount.toLocaleString('en-US')} net per share${d.yieldPct != null ? ` (net yield ${d.yieldPct}%)` : ''}`,
    details: { amount: d.amount, currency: 'XOF', yieldPct: d.yieldPct },
  }));

  const ops = parseBrvmOperations(text).map((o) => ({
    market: 'BRVM', kind: o.kind, issuer: o.issuer ?? issuerFromTitle(o.title), title: o.title, regulator: o.regulator, visa_number: o.reference,
    listing_date: o.listingDate, status: o.kind === 'regulator_visa' ? 'approved' : o.listingDate && o.listingDate < today ? 'listed' : 'announced',
    coupon_pct: /(\d+(?:,\d+)?)\s*%/.exec(o.title) ? Number(/(\d+(?:,\d+)?)\s*%/.exec(o.title)![1]!.replace(',', '.')) : null,
    currency: 'XOF', source: SOURCE, source_url: sourceUrl,
  }));

  const r = await Promise.all([
    meetingRows.length ? db.from('corporate_events').upsert([...meetingRows, ...divEvents], { onConflict: 'asset_id,kind,event_date,source' }) : Promise.resolve({ error: null }),
    divRows.length ? db.from('dividends').upsert(divRows, { onConflict: 'asset_id,payment_date' }) : Promise.resolve({ error: null }),
    ops.length ? db.from('capital_operations').upsert(ops, { onConflict: 'market,title' }) : Promise.resolve({ error: null }),
  ]);
  const errors = r.map((x) => x.error?.message).filter(Boolean);
  return { meetings: meetingRows.length, dividends: divRows.length, operations: ops.length, errors };
}

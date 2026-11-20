import { router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { useT } from '../i18n';
import { fmtCompact, fmtDate, fmtNum, fmtPrice } from '../lib/format';
import type { AssetSheet } from '../lib/types';
import { space, useTheme } from '../theme';
import { Card, KV, Row, Txt } from './ui';

const EVENT_LABEL: Record<string, { fr: string; en: string }> = {
  agm: { fr: 'Assemblée générale', en: 'AGM' }, egm: { fr: 'AG extraordinaire', en: 'EGM' }, results: { fr: 'Résultats', en: 'Results' },
  dividend: { fr: 'Dividende', en: 'Dividend' }, split: { fr: 'Division du nominal', en: 'Stock split' }, rights_issue: { fr: 'Augmentation de capital', en: 'Rights issue' },
  suspension: { fr: 'Suspension', en: 'Suspension' }, other: { fr: 'Événement', en: 'Event' },
};
const DOC_LABEL: Record<string, { fr: string; en: string }> = {
  annual_report: { fr: 'Rapport annuel', en: 'Annual report' }, half_year_report: { fr: 'Rapport semestriel', en: 'Half-year report' },
  press_release: { fr: 'Communiqué', en: 'Press release' }, prospectus: { fr: 'Prospectus', en: 'Prospectus' },
  research_note: { fr: 'Note de recherche', en: 'Research note' }, regulator_notice: { fr: 'Avis du régulateur', en: 'Regulator notice' }, bulletin: { fr: 'Bulletin', en: 'Bulletin' },
};

/** "Société" tab: who the company is, key facts, ownership, management, financials, calendar, documents. */
export function CompanyPanel({ s }: { s: AssetSheet }) {
  const th = useTheme();
  const { t, lang } = useT();
  const a = s.asset;
  const na = t.asset.noInfo;
  const ax = a as typeof a & { profile_source?: string | null; profile_source_url?: string | null };
  const own = lang === 'fr' ? a.description_fr ?? a.activity_fr : a.description_en ?? a.activity_en;
  const other = lang === 'fr' ? a.description_en ?? a.activity_en : a.description_fr ?? a.activity_fr;
  const description = own ?? other;
  const otherLang = !own && !!other;
  const activity = lang === 'fr' ? a.activity_fr : a.activity_en;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = s.events.filter((e) => e.event_date >= today);
  const past = s.events.filter((e) => e.event_date < today).slice(-5).reverse();

  return (
    <>
      <Card title={t.asset.about} collapsible>
        <Txt size="sm">{description ?? na}</Txt>
        {otherLang ? <Txt size="xs" muted>{lang === 'fr' ? '(texte disponible en anglais uniquement)' : '(text available in French only)'}</Txt> : null}
        {activity && activity !== description ? <><Txt weight="700">{t.asset.activity}</Txt><Txt size="sm">{activity}</Txt></> : null}
        {a.website ? <Pressable accessibilityRole="link" onPress={() => Linking.openURL(a.website!)}><Txt size="sm" color={th.info}>{a.website}</Txt></Pressable> : null}
        {ax.profile_source && ax.profile_source !== 'not_found' ? (
          <Pressable accessibilityRole="link" onPress={() => ax.profile_source_url && Linking.openURL(ax.profile_source_url)}>
            <Txt size="xs" muted>{t.common.source} : {ax.profile_source}{ax.profile_source_url ? ' ↗' : ''}</Txt>
          </Pressable>
        ) : null}
      </Card>

      <Card title={t.asset.keyFacts} collapsible>
        <KV label={lang === 'fr' ? 'Secteur' : 'Sector'} value={a.sectors ? (lang === 'fr' ? a.sectors.name_fr : a.sectors.name_en) : na} />
        <KV label={lang === 'fr' ? 'Bourse · pays' : 'Exchange · country'} value={`${a.market}${a.country ? ` · ${a.country}` : ''}`} />
        <KV label="Ticker" value={a.ticker} />
        <KV label="ISIN" value={a.isin ?? na} />
        <KV label={t.asset.hq} value={a.headquarters ?? na} />
        <KV label={t.asset.founded} value={a.founded_year ? String(a.founded_year) : na} />
        <KV label={t.asset.employees} value={a.employees ? fmtNum(a.employees, lang, 0) : na} />
        <KV label={lang === 'fr' ? 'Introduction en bourse' : 'Listing date'} value={a.listing_date ? fmtDate(a.listing_date, lang) : na} />
        <KV label={lang === 'fr' ? 'Capital social' : 'Share capital'} value={a.share_capital != null ? fmtPrice(a.share_capital, a.currency, lang) : na} />
        <KV label={lang === 'fr' ? 'Nombre de titres' : 'Shares outstanding'} value={a.shares_outstanding != null ? fmtCompact(a.shares_outstanding, lang) : na} />
        <KV label={lang === 'fr' ? 'Flottant' : 'Free float'} value={a.free_float_pct != null ? `${fmtNum(a.free_float_pct, lang, 1)} %` : na} />
        <KV label={lang === 'fr' ? 'Capitalisation' : 'Market cap'} value={s.quote?.market_cap != null ? fmtPrice(s.quote.market_cap, a.currency, lang) : na} />
      </Card>

      <Card title={t.asset.shareholders} collapsible defaultOpen={false}>
        {s.shareholders.length ? s.shareholders.map((h) => <KV key={h.holder} label={h.holder} value={h.pct != null ? `${fmtNum(h.pct, lang, 1)} %` : '—'} />) : <Txt size="sm" muted>{na}</Txt>}
        {s.shareholders[0]?.as_of ? <Txt size="xs" muted>{lang === 'fr' ? 'Au' : 'As of'} {fmtDate(s.shareholders[0].as_of, lang)} · {s.shareholders[0].source}</Txt> : null}
      </Card>

      <Card title={t.asset.management} collapsible defaultOpen={false}>
        {s.executives.length ? s.executives.map((e) => <KV key={e.person + e.role} label={e.role} value={e.person} />) : <Txt size="sm" muted>{na}</Txt>}
      </Card>

      <Card title={t.asset.financials} collapsible defaultOpen={false}>
        {s.fundamentals.length ? (
          <View style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt size="xs" muted style={{ flex: 1 }}>{lang === 'fr' ? 'Exercice' : 'Year'}</Txt>
              <Txt size="xs" muted style={{ flex: 2, textAlign: 'right' }}>{t.asset.revenue}</Txt>
              <Txt size="xs" muted style={{ flex: 2, textAlign: 'right' }}>{t.asset.netIncome}</Txt>
            </Row>
            {s.fundamentals.slice(-5).map((f) => (
              <Row key={f.fiscalYear} style={{ justifyContent: 'space-between' }}>
                <Txt size="sm" style={{ flex: 1 }}>{f.fiscalYear}</Txt>
                <Txt size="sm" style={{ flex: 2, textAlign: 'right' }}>{fmtCompact(f.revenue, lang)}</Txt>
                <Txt size="sm" style={{ flex: 2, textAlign: 'right' }} color={(f.netIncome ?? 0) < 0 ? th.down : undefined}>{fmtCompact(f.netIncome, lang)}</Txt>
              </Row>
            ))}
            <Txt size="xs" muted>{a.currency === 'XOF' || a.currency === 'XAF' ? 'FCFA' : a.currency} · {t.common.source} : {[...new Set(s.fundamentals.map((f) => f.provenance.source))].join(', ')}</Txt>
          </View>
        ) : <Txt size="sm" muted>{na}</Txt>}
        {s.dividends.length ? (
          <View style={{ gap: 4, marginTop: space.sm }}>
            <Txt weight="700">{t.asset.dividends}</Txt>
            {s.dividends.slice(0, 5).map((d, i) => <KV key={i} label={`${d.fiscal_year ?? ''} · ${lang === 'fr' ? 'détachement' : 'ex-date'} ${fmtDate(d.ex_date, lang)}`} value={`${fmtNum(d.amount, lang, 0)} ${d.currency === 'XOF' || d.currency === 'XAF' ? 'FCFA' : d.currency}`} />)}
          </View>
        ) : null}
      </Card>

      <Card title={t.asset.calendar} collapsible defaultOpen={false}>
        {upcoming.length || past.length ? (
          <>
            {upcoming.map((e, i) => <KV key={`u${i}`} label={`${fmtDate(e.event_date, lang)} · ${EVENT_LABEL[e.kind]?.[lang] ?? e.kind}`} value={(lang === 'fr' ? e.title_fr : e.title_en) ?? ''} />)}
            {past.map((e, i) => <KV key={`p${i}`} label={`${fmtDate(e.event_date, lang)} · ${EVENT_LABEL[e.kind]?.[lang] ?? e.kind}`} value={(lang === 'fr' ? e.title_fr : e.title_en) ?? ''} />)}
          </>
        ) : <Txt size="sm" muted>{na}</Txt>}
      </Card>

      <Card title={t.asset.documents} collapsible defaultOpen={false}>
        {s.documents?.length ? s.documents.map((d, i) => (
          <Pressable key={i} accessibilityRole="link" onPress={() => Linking.openURL(d.url)}>
            <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Txt size="sm" color={th.info} style={{ flex: 1 }} numberOfLines={1}>{d.title ?? DOC_LABEL[d.kind]?.[lang] ?? d.kind}</Txt>
              <Txt size="xs" muted>{fmtDate(d.published_at, lang)}</Txt>
            </Row>
          </Pressable>
        )) : <Txt size="sm" muted>{na}</Txt>}
      </Card>

      {s.peers.length ? (
        <Card title={t.asset.peers} collapsible defaultOpen={false}>
          {s.peers.slice(0, 8).map((p) => (
            <Pressable key={p.id} onPress={() => router.push(`/asset/${encodeURIComponent(p.id)}`)}>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}><Txt weight="600">{p.ticker}</Txt><Txt size="sm" muted numberOfLines={1}>{p.name} · {p.market}</Txt></Row>
            </Pressable>
          ))}
        </Card>
      ) : null}
    </>
  );
}

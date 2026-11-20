import { Linking, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { explainFactor, type ConsensusResult, type CurrencyCode, type LiquidityStat, type PerformanceStat, type RangeStat, type Ratios, type TechnicalSnapshot, type AnalystConsensus } from '@chart-boursafrikia/core';
import { useT } from '../i18n';
import { fmtDate, fmtNum, fmtPct, fmtPrice, fmtCompact } from '../lib/format';
import { isFullConsensus, type AssetSheet } from '../lib/types';
import { useSettings } from '../settings';
import { changeColor, radius, space, useTheme } from '../theme';
import { Button, Card, Disclaimer, KV, Pill, Row, Txt } from './ui';

const periodLabel = (p: string, lang: 'fr' | 'en') => ({
  fr: { '1W': '1 sem.', '1M': '1 mois', '3M': '3 mois', '6M': '6 mois', '1Y': '1 an', '2Y': '2 ans', '3Y': '3 ans', YTD: '1er janv.', '12M': '12 mois' },
  en: { '1W': '1 wk', '1M': '1 mo', '3M': '3 mo', '6M': '6 mo', '1Y': '1 yr', '2Y': '2 yrs', '3Y': '3 yrs', YTD: 'YTD', '12M': '12 mo' },
}[lang] as Record<string, string>)[p] ?? p;

/** PLUS BAS / PLUS HAUT table with dates, position bar and distances. */
export function RangeTable({ ranges, currency }: { ranges: RangeStat[]; currency: CurrencyCode }) {
  const th = useTheme();
  const { t, lang } = useT();
  const { displayCurrency } = useSettings();
  if (!ranges.length) return <Card title={t.asset.ranges} collapsible badge={ranges.length ? `${ranges.length} périodes` : null}><Txt muted>{t.common.unavailable}</Txt><Txt size="xs" muted>{t.common.historyNeeded}</Txt></Card>;
  return (
    <Card title={t.asset.ranges} collapsible badge={ranges.length ? `${ranges.length} périodes` : null}>
      {ranges.map((r) => (
        <View key={r.period} style={{ gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: th.grid }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt weight="700">{periodLabel(r.period, lang)}{r.partial ? ` · ${t.asset.partial}` : ''}</Txt>
            <Txt size="sm" muted>{t.asset.position} {fmtNum(r.positionPct, lang, 0)} %</Txt>
          </Row>
          <View accessibilityLabel={`${t.asset.position} ${Math.round(r.positionPct)} %`} style={{ height: 6, backgroundColor: th.cardAlt, borderRadius: radius.pill, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: `${Math.min(97, Math.max(0, r.positionPct))}%`, width: 8, height: 6, borderRadius: 3, backgroundColor: th.accent }} />
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt size="xs" muted>{t.asset.low} · {fmtDate(r.lowDate, lang)}</Txt>
              <Txt size="sm" weight="600" color={th.down}>{fmtPrice(r.low, currency, lang, displayCurrency)}</Txt>
              <Txt size="xs" muted>{t.asset.fromLow} {fmtPct(r.distanceFromLowPct, lang)}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt size="xs" muted>{t.asset.high} · {fmtDate(r.highDate, lang)}</Txt>
              <Txt size="sm" weight="600" color={th.up}>{fmtPrice(r.high, currency, lang, displayCurrency)}</Txt>
              <Txt size="xs" muted>{t.asset.fromHigh} {fmtPct(r.distanceFromHighPct, lang)}</Txt>
            </View>
          </Row>
        </View>
      ))}
    </Card>
  );
}

export function PerformanceGrid({ perf }: { perf: PerformanceStat[] }) {
  const th = useTheme();
  const { t, lang } = useT();
  if (!perf.length) return <Card title={t.asset.performance} collapsible defaultOpen={false}><Txt muted>{t.common.unavailable}</Txt><Txt size="xs" muted>{t.common.historyNeeded}</Txt></Card>;
  return (
    <Card title={t.asset.performance} collapsible defaultOpen={false}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {perf.map((p) => (
          <View key={p.period} style={{ width: '23%', minWidth: 72, backgroundColor: th.cardAlt, borderRadius: radius.md, padding: space.sm, alignItems: 'center' }}>
            <Txt size="xs" muted>{periodLabel(p.period, lang)}</Txt>
            <Txt size="sm" weight="700" color={changeColor(th, p.returnPct)}>{fmtPct(p.returnPct, lang, 1)}</Txt>
            <Txt size="xs" muted>σ {p.volatilityPct == null ? '—' : `${fmtNum(p.volatilityPct, lang, 0)} %`}</Txt>
          </View>
        ))}
      </View>
      <Txt size="xs" muted>σ = {t.asset.volatility}</Txt>
    </Card>
  );
}

export function LiquidityCard({ l }: { l: LiquidityStat | null }) {
  const th = useTheme();
  const { t, lang } = useT();
  if (!l) return <Card title={t.asset.liquidity}><Txt muted>{t.common.unavailable}</Txt><Txt size="xs" muted>{t.common.historyNeeded}</Txt></Card>;
  const color = l.level === 'high' ? th.up : l.level === 'medium' ? th.info : th.warn;
  return (
    <Card title={t.asset.liquidity} collapsible defaultOpen={false} right={<Pill label={`${l.score}/100`} bg={color} color="#0B0F1E" />}>
      <KV label={t.asset.avgVolume} value={fmtCompact(l.avgVolume, lang)} />
      <KV label={t.asset.zeroDays} value={`${l.zeroVolumeSessions} / ${l.sessions}`} />
      {l.warning ? <View style={{ backgroundColor: th.cardAlt, borderLeftWidth: 3, borderLeftColor: th.warn, padding: space.sm, borderRadius: radius.sm }}><Txt size="sm" color={th.warn}>⚠ {t.asset.illiquid}</Txt></View> : null}
    </Card>
  );
}

export function FundamentalsCard({ r, sheet }: { r: Ratios; sheet: AssetSheet }) {
  const { t, lang } = useT();
  const pct = (v: number | null) => (v == null ? t.common.unavailable : `${fmtNum(v, lang, 1)} %`);
  const x = (v: number | null) => (v == null ? t.common.unavailable : `${fmtNum(v, lang, 1)}x`);
  return (
    <Card title={t.asset.fundamentals} collapsible defaultOpen={false}>
      <KV label="PER" value={x(r.per)} />
      <KV label="P/B" value={x(r.pb)} />
      <KV label={lang === 'fr' ? 'Rendement du dividende' : 'Dividend yield'} value={pct(r.dividendYieldPct)} />
      <KV label="ROE" value={pct(r.roePct)} />
      <KV label={lang === 'fr' ? 'Marge nette' : 'Net margin'} value={pct(r.netMarginPct)} />
      <KV label={lang === 'fr' ? 'Dette / fonds propres' : 'Debt / equity'} value={x(r.debtToEquity)} />
      <KV label={lang === 'fr' ? 'Croissance CA 3 ans (an.)' : 'Revenue CAGR 3y'} value={pct(r.revenueCagr3yPct)} />
      <KV label={lang === 'fr' ? 'Croissance résultat 3 ans (an.)' : 'Net income CAGR 3y'} value={pct(r.netIncomeCagr3yPct)} />
      {sheet.fundamentals.length ? <Txt size="xs" muted>{t.common.source} : {[...new Set(sheet.fundamentals.map((f) => f.provenance.source))].join(', ')} · {sheet.fundamentals.map((f) => f.fiscalYear).join(', ')}</Txt> : null}
      {sheet.dividends.length ? (
        <View style={{ gap: 4 }}>
          <Txt weight="700">{t.asset.dividends}</Txt>
          {sheet.dividends.slice(0, 5).map((d, i) => <KV key={i} label={`${d.fiscal_year ?? ''} · ${lang === 'fr' ? 'détachement' : 'ex-date'} ${fmtDate(d.ex_date, lang)}`} value={`${fmtNum(d.amount, lang, 0)} ${d.currency}`} />)}
        </View>
      ) : null}
    </Card>
  );
}

export function TechnicalCard({ tech, currency }: { tech: TechnicalSnapshot | null; currency: CurrencyCode }) {
  const th = useTheme();
  const { t, lang } = useT();
  if (!tech) return <Card title={t.asset.technical}><Txt muted>{t.common.unavailable}</Txt><Txt size="xs" muted>{t.common.historyNeeded}</Txt></Card>;
  const p = (v: number | null) => (v == null ? '—' : fmtPrice(v, currency, lang));
  const trendColor = tech.trend === 'up' ? th.up : tech.trend === 'down' ? th.down : th.neutral;
  const patternNames: Record<string, { fr: string; en: string }> = {
    double_top: { fr: 'Double sommet', en: 'Double top' }, double_bottom: { fr: 'Double creux', en: 'Double bottom' },
    breakout_up: { fr: 'Cassure haussière (55 séances)', en: 'Upside breakout (55 sessions)' }, breakdown: { fr: 'Cassure baissière (55 séances)', en: 'Downside breakdown (55 sessions)' },
    golden_cross: { fr: 'Croisement doré MM50/MM200', en: 'Golden cross 50/200' }, death_cross: { fr: 'Croisement de la mort MM50/MM200', en: 'Death cross 50/200' },
  };
  return (
    <Card title={t.asset.technical} collapsible defaultOpen={false} right={<Pill label={t.asset.trend[tech.trend]} bg={trendColor} color="#0B0F1E" />}>
      <KV label="MM20 / MM50 / MM200" value={`${p(tech.sma20)} · ${p(tech.sma50)} · ${p(tech.sma200)}`} />
      <KV label="RSI 14" value={fmtNum(tech.rsi14, lang, 1)} valueColor={tech.rsi14 != null && (tech.rsi14 > 70 || tech.rsi14 < 30) ? th.warn : undefined} />
      <KV label="MACD (12,26,9)" value={`${fmtNum(tech.macd, lang)} / ${fmtNum(tech.macdSignal, lang)}`} valueColor={changeColor(th, tech.macdHist)} />
      <KV label="Bollinger (20,2)" value={`${p(tech.bbLower)} – ${p(tech.bbUpper)}`} />
      <KV label={t.asset.supports} value={tech.levels.filter((l) => l.kind === 'support').map((l) => p(l.price)).join(' · ') || '—'} valueColor={th.up} />
      <KV label={t.asset.resistances} value={tech.levels.filter((l) => l.kind === 'resistance').map((l) => p(l.price)).join(' · ') || '—'} valueColor={th.down} />
      {tech.patterns.length ? <KV label={t.asset.patterns} value={tech.patterns.map((x) => patternNames[x.name]?.[lang] ?? x.name).join(', ')} /> : null}
    </Card>
  );
}

function AnalystBlock({ a, currency }: { a: AnalystConsensus | null; currency: CurrencyCode }) {
  const th = useTheme();
  const { t, lang } = useT();
  if (!a || a.count === 0) return <Txt size="sm" muted>{t.consensus.noAnalysts}</Txt>;
  const total = a.count;
  return (
    <View style={{ gap: 6 }}>
      <KV label={lang === 'fr' ? 'Analystes' : 'Analysts'} value={String(a.count)} />
      <KV label={t.consensus.target} value={`${fmtPrice(a.targetMean, currency, lang)} (${fmtPct(a.impliedUpsidePct, lang, 1)})`} />
      <KV label="Min / Max" value={`${fmtPrice(a.targetMin, currency, lang)} – ${fmtPrice(a.targetMax, currency, lang)}`} />
      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ flex: a.distribution.buy / total || 0.0001, backgroundColor: th.up }} />
        <View style={{ flex: a.distribution.hold / total || 0.0001, backgroundColor: th.neutral }} />
        <View style={{ flex: a.distribution.sell / total || 0.0001, backgroundColor: th.down }} />
      </View>
      <Txt size="xs" muted>{t.consensus.buy} {a.distribution.buy} · {t.consensus.hold} {a.distribution.hold} · {t.consensus.sell} {a.distribution.sell}</Txt>
      {(a as AnalystConsensus & { source?: { name: string; url: string | null; brokers: string | null; note: string | null } }).source ? (() => {
        const src = (a as AnalystConsensus & { source: { name: string; url: string | null; brokers: string | null; note: string | null } }).source;
        return (
          <View style={{ gap: 2 }}>
            {src.brokers ? <Txt size="xs" muted>{src.brokers}</Txt> : null}
            {src.note ? <Txt size="xs" color={th.warn}>ⓘ {src.note}</Txt> : null}
            <Txt size="xs" color={th.info} onPress={src.url ? () => Linking.openURL(src.url!) : undefined}>{lang === 'fr' ? 'Source' : 'Source'} : {src.name}{a.latestAt ? ` · ${fmtDate(a.latestAt, lang)}` : ''}{src.url ? ' ↗' : ''}</Txt>
          </View>
        );
      })() : null}
      {a.opinions.slice(0, 5).map((o, i) => <Txt key={i} size="xs" muted>• {o.broker} — {o.recommendation} {o.targetPrice ? `→ ${fmtNum(o.targetPrice, lang, 0)}` : ''} ({fmtDate(o.publishedAt, lang)})</Txt>)}
    </View>
  );
}

export function ConsensusCard({ sheet }: { sheet: AssetSheet }) {
  const th = useTheme();
  const { t, lang } = useT();
  const c = sheet.consensus;
  const currency = sheet.asset.currency;
  if (!c) return <Card title={t.asset.consensus}><Txt muted>{t.common.unavailable}</Txt><Txt size="xs" muted>{t.common.historyNeeded}</Txt></Card>;
  const oColor = c.orientation === 'positive' ? th.up : c.orientation === 'negative' ? th.down : th.neutral;
  const header = (
    <Row style={{ flexWrap: 'wrap' }}>
      <Pill label={t.consensus.orientation[c.orientation]} bg={oColor} color="#0B0F1E" />
      <Pill label={t.consensus.confidence[c.confidence]} />
    </Row>
  );
  return (
    <Card title={t.asset.consensus} collapsible defaultOpen={false} badge={t.consensus.orientation[c.orientation]}>
      <Txt weight="700">{t.consensus.analysts}</Txt>
      {isFullConsensus(c) ? <AnalystBlock a={c.analysts} currency={currency} /> : <Txt size="sm" muted>{c.analysts?.count ? `${c.analysts.count} analyste(s)` : t.consensus.noAnalysts}</Txt>}
      <View style={{ height: 1, backgroundColor: th.grid }} />
      <Txt weight="700">{t.consensus.model}</Txt>
      {header}
      {isFullConsensus(c) ? <FullModel c={c} currency={currency} /> : (
        <View style={{ gap: space.sm }}>
          <Txt size="sm" muted>🔒 {t.consensus.locked}</Txt>
          <Button label={t.premium.cta} onPress={() => router.push('/premium')} />
        </View>
      )}
      <Txt size="xs" muted>{lang === 'fr' ? 'Modèle' : 'Model'} {c.modelVersion} · {fmtDate(c.asOf, lang)}</Txt>
      <Pressable onPress={() => router.push('/track-record')}><Txt size="xs" color={th.info}>{t.consensus.trackRecord} →</Txt></Pressable>
      <Disclaimer text={c.disclaimer[lang]} />
    </Card>
  );
}

function FullModel({ c, currency }: { c: ConsensusResult; currency: CurrencyCode }) {
  const th = useTheme();
  const { t, lang } = useT();
  return (
    <View style={{ gap: space.md }}>
      {c.forecasts.map((f) => (
        <View key={f.horizon} style={{ backgroundColor: th.cardAlt, borderRadius: radius.md, padding: space.md, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt weight="700">{periodLabel(f.horizon, lang)}</Txt>
            <Txt size="xs" muted>{t.consensus.range} : {fmtPrice(f.rangeLow, currency, lang)} – {fmtPrice(f.rangeHigh, currency, lang)}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            {([['bear', f.bear, th.down], ['central', f.central, th.neutral], ['bull', f.bull, th.up]] as const).map(([k, s, col]) => (
              <View key={k} style={{ alignItems: 'center', flex: 1 }}>
                <Txt size="xs" muted>{t.consensus[k]}</Txt>
                <Txt size="sm" weight="700" color={col}>{fmtPct(s.returnPct, lang, 1)}</Txt>
                <Txt size="xs" muted>{fmtNum(s.probability * 100, lang, 0)} %</Txt>
              </View>
            ))}
          </Row>
        </View>
      ))}
      {c.invalidationLevel != null ? <KV label={t.consensus.invalidation} value={fmtPrice(c.invalidationLevel, currency, lang)} valueColor={th.warn} /> : null}
      <Txt weight="700">{t.consensus.factors}</Txt>
      {c.topFactors.map((f) => (
        <Row key={f.key} style={{ alignItems: 'flex-start' }}>
          <Txt color={f.score > 0.1 ? th.up : f.score < -0.1 ? th.down : th.neutral}>{f.score > 0.1 ? '▲' : f.score < -0.1 ? '▼' : '●'}</Txt>
          <Txt size="sm" style={{ flex: 1 }}>{explainFactor(f, lang)}</Txt>
        </Row>
      ))}
      <Txt size="xs" muted>{lang === 'fr' ? 'Couverture des données' : 'Data coverage'} : {fmtNum(c.dataCoverage * 100, lang, 0)} %</Txt>
    </View>
  );
}

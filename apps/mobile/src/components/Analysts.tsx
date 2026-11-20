// Markets screen, Premium: « Consensus des analystes » (buy / hold / sell) and « Objectifs de cours » over a period.
// Figures as published by the sources (dated, linked); upside computed vs the latest verified close.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useT } from '../i18n';
import { api, type AnalystRow, type ModelConsensus, type ModelPick } from '../lib/api';
import { fmtDate, fmtNum, fmtPct, fmtPrice } from '../lib/format';
import { radius, space, useTheme } from '../theme';
import { Button, Card, Loading, Pill, Row, Txt } from './ui';

const PERIODS = [3, 6, 12] as const;
const ORIENT = { fr: { positive: '▲ signal haussier', neutral: '● signal neutre', negative: '▼ signal baissier' }, en: { positive: '▲ bullish signal', neutral: '● neutral signal', negative: '▼ bearish signal' } } as const;

function ModelSection({ m, locked }: { m: ModelConsensus; locked: boolean }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const conf = (c: string) => (fr ? ({ high: 'élevée', medium: 'moyenne', low: 'faible' } as Record<string, string>)[c] ?? c : c);
  const pick = (x: ModelPick) => (
    <Pressable key={x.assetId} onPress={() => router.push(`/asset/${encodeURIComponent(x.assetId)}`)} style={{ paddingVertical: 4 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size="sm" weight="700" style={{ flex: 1 }} numberOfLines={1}>{x.ticker} <Txt size="xs" muted>{x.name}</Txt></Txt>
        <Txt size="xs" muted>{fr ? 'confiance' : 'conf.'} {conf(x.confidence)}{x.central12 != null ? ` · 12 m ${x.central12 >= 0 ? '+' : ''}${fmtNum(x.central12, lang, 1)} %` : ''}</Txt>
      </Row>
    </Pressable>
  );
  return (
    <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: th.grid, paddingTop: space.md, marginTop: space.sm }}>
      <Txt weight="800">{fr ? 'Modèle Chart-BoursafrikIA' : 'Chart-BoursafrikIA model'}</Txt>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: th.grid }}>
        {m.totals.positive ? <View style={{ flex: m.totals.positive, backgroundColor: th.up }} /> : null}
        {m.totals.neutral ? <View style={{ flex: m.totals.neutral, backgroundColor: th.neutral }} /> : null}
        {m.totals.negative ? <View style={{ flex: m.totals.negative, backgroundColor: th.down }} /> : null}
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size="sm" weight="700" color={th.up}>{fr ? '▲ Haussier' : '▲ Bullish'} {m.totals.positive}</Txt>
        <Txt size="sm" weight="700" color={th.neutral}>{fr ? '● Neutre' : '● Neutral'} {m.totals.neutral}</Txt>
        <Txt size="sm" weight="700" color={th.down}>{fr ? '▼ Baissier' : '▼ Bearish'} {m.totals.negative}</Txt>
      </Row>
      <Txt size="xs" muted>{fr ? `Signal du modèle sur ${m.count} titre(s) de cette bourse, calculée après la séance du ${m.asOf ? fmtDate(m.asOf, lang) : '—'} (tendance, valorisation, qualité, dividende, actualité, analystes).` : `Model signal on ${m.count} stocks.`}</Txt>
      {locked ? <Locked text={fr ? 'Signaux haussiers et baissiers les plus nets : réservé à Premium.' : 'Top model picks are Premium.'} /> : (
        <>
          {m.topPositive?.length ? <><Txt size="sm" weight="700" color={th.up}>{fr ? '▲ Signaux haussiers les plus nets' : '▲ Strongest bullish signals'}</Txt>{m.topPositive.map(pick)}</> : null}
          {m.topNegative?.length ? <><Txt size="sm" weight="700" color={th.down}>{fr ? '▼ Signaux baissiers les plus nets' : '▼ Strongest bearish signals'}</Txt>{m.topNegative.map(pick)}</> : null}
          <Pressable onPress={() => router.push('/previsions')}><Txt size="xs" color={th.info}>{fr ? 'Classement complet des prévisions →' : 'Full forecasts ranking →'}</Txt></Pressable>
        </>
      )}
      <Txt size="xs" muted>{fr ? 'Signal statistique du modèle : il indique le sens le plus probable du cours, ce n’est pas une recommandation d’achat ou de vente.' : 'Statistical model signal, not a buy/sell recommendation.'}</Txt>
    </View>
  );
}

function Split({ buy, hold, sell, h = 8 }: { buy: number; hold: number; sell: number; h?: number }) {
  const th = useTheme();
  const tot = buy + hold + sell;
  if (!tot) return <View style={{ height: h, borderRadius: h / 2, backgroundColor: th.grid }} />;
  return (
    <View style={{ flexDirection: 'row', height: h, borderRadius: h / 2, overflow: 'hidden' }}>
      {buy ? <View style={{ flex: buy, backgroundColor: th.up }} /> : null}
      {hold ? <View style={{ flex: hold, backgroundColor: th.neutral }} /> : null}
      {sell ? <View style={{ flex: sell, backgroundColor: th.down }} /> : null}
    </View>
  );
}

function useAnalysts(market: string, months: number) {
  return useQuery({ queryKey: ['analysts', market, months], queryFn: () => api.analysts(months, market), staleTime: 600_000 });
}

function PeriodPills({ months, setMonths }: { months: number; setMonths: (m: number) => void }) {
  const { lang } = useT();
  return <Row style={{ flexWrap: 'wrap' }}>{PERIODS.map((m) => <Pill key={m} label={lang === 'fr' ? `${m} derniers mois` : `Last ${m} months`} active={months === m} onPress={() => setMonths(m)} />)}</Row>;
}

function Locked({ text }: { text: string }) {
  const { lang } = useT();
  return (
    <View style={{ gap: space.sm }}>
      <Txt size="sm" muted>🔒 {text}</Txt>
      <Button label={lang === 'fr' ? 'Passer à Premium' : 'Go Premium'} onPress={() => router.push('/premium')} />
    </View>
  );
}

export function AnalystConsensusBlock({ market }: { market: string }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const [months, setMonths] = useState(6);
  const q = useAnalysts(market, months);
  const d = q.data;
  const label = (r: { buy: number | null; hold: number | null; sell: number | null }) => {
    const b = r.buy ?? 0, h = r.hold ?? 0, s = r.sell ?? 0;
    if (!b && !h && !s) return { t: fr ? 'Non précisé' : 'Not stated', c: th.textMuted };
    if (b > h + s) return { t: fr ? 'Majorité achat' : 'Mostly buy', c: th.up };
    if (s > b + h) return { t: fr ? 'Majorité vente' : 'Mostly sell', c: th.down };
    return { t: fr ? 'Avis partagés' : 'Mixed', c: th.neutral };
  };
  return (
    <Card title={fr ? '🧑‍💼 Consensus analystes & Chart-BoursafrikIA · PRO' : '🧑‍💼 Analysts & Chart-BoursafrikIA consensus · PRO'} collapsible badge={d && !d.locked ? d.rows.length || null : null}>
      <PeriodPills months={months} setMonths={setMonths} />
      {q.isLoading ? <Loading /> : !d ? <Txt muted>{fr ? 'Indisponible.' : 'Unavailable.'}</Txt> : (
        <>
          <Txt weight="800">{fr ? 'Analystes (courtiers / SGI)' : 'Analysts (brokers)'}</Txt>
          <View style={{ gap: 6 }}>
            <Split buy={d.totals.buy} hold={d.totals.hold} sell={d.totals.sell} h={12} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt size="sm" weight="700" color={th.up}>{fr ? 'Achat' : 'Buy'} {d.totals.buy}</Txt>
              <Txt size="sm" weight="700" color={th.neutral}>{fr ? 'Neutre' : 'Hold'} {d.totals.hold}</Txt>
              <Txt size="sm" weight="700" color={th.down}>{fr ? 'Vente' : 'Sell'} {d.totals.sell}</Txt>
            </Row>
            <Txt size="xs" muted>{fr ? `Avis publiés depuis le ${fmtDate(d.since, lang)} sur ${d.locked ? d.covered : d.rows.length} titre(s) de cette bourse.` : `Ratings published since ${fmtDate(d.since, lang)}.`}</Txt>
          </View>
          {d.locked ? <Locked text={fr ? 'Détail par titre (achat / neutre / vente, courtiers, sources) réservé à Premium.' : 'Per-stock detail is Premium.'} />
            : !d.rows.length ? <Txt size="sm" muted>{fr ? 'Aucune recommandation d’analyste publiée trouvée sur cette période pour cette bourse.' : 'No published analyst rating for this period and exchange.'}</Txt>
            : d.rows.map((r) => {
              const l = label(r);
              return (
                <Pressable key={r.assetId} onPress={() => router.push(`/asset/${encodeURIComponent(r.assetId)}`)} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: th.grid }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt weight="800">{r.ticker} <Txt size="xs" muted>{r.name}</Txt></Txt>
                    <Txt size="sm" weight="700" color={l.c}>{l.t}</Txt>
                  </Row>
                  <Split buy={r.buy ?? 0} hold={r.hold ?? 0} sell={r.sell ?? 0} />
                  {r.model ? (() => {
                    const o = r.model.orientation;
                    const an = (r.buy ?? 0) > (r.hold ?? 0) + (r.sell ?? 0) ? 'positive' : (r.sell ?? 0) > (r.buy ?? 0) + (r.hold ?? 0) ? 'negative' : 'neutral';
                    const conv = (r.buy ?? 0) + (r.hold ?? 0) + (r.sell ?? 0) === 0 ? null : an === o;
                    return (
                      <Txt size="xs">
                        <Txt size="xs" muted>{fr ? 'Modèle Chart-BoursafrikIA : ' : 'Chart-BoursafrikIA model: '}</Txt>
                        <Txt size="xs" weight="700" color={o === 'positive' ? th.up : o === 'negative' ? th.down : th.neutral}>{ORIENT[lang][o]}</Txt>
                        {conv == null ? null : <Txt size="xs" weight="700" color={conv ? th.up : th.warn}>{conv ? (fr ? '  ✓ convergent avec les analystes' : '  ✓ agrees with analysts') : (fr ? '  ≠ divergent des analystes' : '  ≠ differs from analysts')}</Txt>}
                      </Txt>
                    );
                  })() : null}
                  <Txt size="xs" muted>
                    {[r.buy != null ? `${r.buy} ${fr ? 'achat' : 'buy'}` : null, r.hold != null ? `${r.hold} ${fr ? 'neutre' : 'hold'}` : null, r.sell != null ? `${r.sell} ${fr ? 'vente' : 'sell'}` : null].filter(Boolean).join(' · ') || (fr ? 'Répartition non précisée' : 'Split not stated')}
                    {r.brokers ? ` — ${r.brokers}` : ''} · {fmtDate(r.publishedAt, lang)}
                  </Txt>
                </Pressable>
              );
            })}
          <Txt size="xs" muted>{fr ? 'Opinions publiées par des courtiers et reprises par la presse financière, citées telles quelles. Ce ne sont pas des recommandations de Chart-BoursafrikIA.' : 'Broker opinions as published; not Chart-BoursafrikIA recommendations.'}</Txt>
          {d.model ? <ModelSection m={d.model} locked={d.locked} /> : null}
        </>
      )}
    </Card>
  );
}

export function PriceTargetsBlock({ market }: { market: string }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const [months, setMonths] = useState(6);
  const [sort, setSort] = useState<'upside' | 'date'>('upside');
  const q = useAnalysts(market, months);
  const d = q.data;
  const rows: AnalystRow[] = d && !d.locked ? d.rows.filter((r) => r.targetMean != null || r.targetMin != null)
    .sort((a, b) => (sort === 'date' ? b.publishedAt.localeCompare(a.publishedAt) : (b.upsidePct ?? -1e9) - (a.upsidePct ?? -1e9))) : [];
  return (
    <Card title={fr ? '🎯 Objectifs de cours des analystes · PRO' : '🎯 Analyst price targets · PRO'} collapsible badge={rows.length || null}>
      <PeriodPills months={months} setMonths={setMonths} />
      {q.isLoading ? <Loading /> : !d ? <Txt muted>{fr ? 'Indisponible.' : 'Unavailable.'}</Txt> : d.locked
        ? <Locked text={fr ? `Objectifs moyens, fourchettes et potentiel par rapport au dernier cours pour ${d.covered} titre(s) : réservé à Premium.` : 'Targets are Premium.'} />
        : !rows.length ? <Txt size="sm" muted>{fr ? 'Aucun objectif de cours publié trouvé sur cette période pour cette bourse.' : 'No published price target for this period and exchange.'}</Txt> : (
          <>
            <Row><Pill label={fr ? 'Potentiel' : 'Upside'} active={sort === 'upside'} onPress={() => setSort('upside')} /><Pill label={fr ? 'Plus récents' : 'Latest'} active={sort === 'date'} onPress={() => setSort('date')} /></Row>
            {rows.map((r) => {
              const cur = r.currency as never;
              const lo = r.targetMin ?? r.targetMean!, hi = r.targetMax ?? r.targetMean!;
              const scaleLo = Math.min(lo, r.price ?? lo) * 0.95, scaleHi = Math.max(hi, r.price ?? hi) * 1.05;
              const pos = (v: number) => `${((v - scaleLo) / (scaleHi - scaleLo)) * 100}%` as const;
              return (
                <Pressable key={r.assetId} onPress={() => router.push(`/asset/${encodeURIComponent(r.assetId)}`)} style={{ gap: 6, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: th.grid }}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Txt weight="800">{r.ticker} <Txt size="xs" muted>{r.name}</Txt></Txt>
                      <Txt size="xs" muted>{fr ? 'Cours' : 'Price'} {fmtPrice(r.price, cur, lang)} ({r.priceDate ? fmtDate(r.priceDate, lang) : '—'})</Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt weight="800">{r.targetMean != null ? fmtPrice(r.targetMean, cur, lang) : '—'}</Txt>
                      <Txt size="sm" weight="700" color={r.upsidePct == null ? th.textMuted : r.upsidePct >= 0 ? th.up : th.down}>{r.upsidePct == null ? (fr ? 'moyenne n.c.' : 'n/a') : `${fmtPct(r.upsidePct, lang, 1)} ${fr ? 'vs cours' : 'vs price'}`}</Txt>
                    </View>
                  </Row>
                  {/* Range bar: target range (accent) and current price (marker) */}
                  <View style={{ height: 14, justifyContent: 'center' }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: th.grid }} />
                    <View style={{ position: 'absolute', left: pos(lo), width: `${Math.max(1, ((hi - lo) / (scaleHi - scaleLo)) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: th.accent }} />
                    {r.price ? <View style={{ position: 'absolute', left: pos(r.price), width: 3, height: 14, marginLeft: -1, backgroundColor: th.text }} /> : null}
                  </View>
                  <Txt size="xs" muted>
                    {r.targetMin != null && r.targetMax != null ? `${fr ? 'Fourchette' : 'Range'} ${fmtPrice(r.targetMin, cur, lang)} – ${fmtPrice(r.targetMax, cur, lang)} · ` : ''}
                    {r.referencePrice != null && r.targetMean != null ? `${fr ? 'potentiel annoncé' : 'stated upside'} ${fmtPct((r.targetMean / r.referencePrice - 1) * 100, lang, 1)} (${fr ? 'cours de référence' : 'ref. price'} ${fmtNum(r.referencePrice, lang, 2)}) · ` : ''}
                    {fmtDate(r.publishedAt, lang)}
                  </Txt>
                  {r.history.filter((h) => h.targetMean != null).length > 1 ? (
                    <Txt size="xs" muted>{fr ? 'Évolution de l’objectif moyen : ' : 'Mean target over time: '}{r.history.filter((h) => h.targetMean != null).map((h) => `${fmtNum(h.targetMean!, lang, 2)} (${fmtDate(h.date, lang)})`).join(' → ')}</Txt>
                  ) : null}
                  {r.note ? <Txt size="xs" color={th.warn}>ⓘ {r.note}</Txt> : null}
                  {r.sourceUrl ? <Pressable onPress={() => Linking.openURL(r.sourceUrl!)}><Txt size="xs" color={th.info}>{fr ? 'Source' : 'Source'} : {r.source} ↗</Txt></Pressable> : <Txt size="xs" muted>{r.source}</Txt>}
                </Pressable>
              );
            })}
            <Txt size="xs" muted>{fr ? 'Barre : fourchette des objectifs (couleur) et dernier cours (trait). Objectifs généralement à 12 mois. Le potentiel est calculé par rapport au dernier cours vérifié ; il peut être devenu négatif si le cours a dépassé l’objectif depuis sa publication.' : 'Bar: target range and last price. Usually 12-month targets.'}</Txt>
            <View style={{ borderRadius: radius.sm }}><Txt size="xs" muted>{fr ? 'Informations publiées par des tiers, pas un conseil en investissement.' : 'Third-party information, not investment advice.'}</Txt></View>
          </>
        )}
    </Card>
  );
}

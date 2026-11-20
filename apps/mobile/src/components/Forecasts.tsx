// « Prévisions » (Premium): fan chart of the model's scenarios, probabilities per horizon, invalidation level,
// analysts vs model, AI reading and the model's blind test on this stock. Free users see a locked teaser.
import type { ConsensusResult, CurrencyCode } from '@chart-boursafrikia/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { fmtDate, fmtNum, fmtPct, fmtPrice } from '../lib/format';
import { isFullConsensus, type AssetSheet } from '../lib/types';
import { radius, space, useTheme } from '../theme';
import { Button, Card, Disclaimer, KV, Loading, Pill, Row, Txt } from './ui';

const H_SESSIONS = { '1M': 21, '3M': 63, '6M': 126, '12M': 252 } as const;
const H_LABEL = { fr: { '1M': '1 mois', '3M': '3 mois', '6M': '6 mois', '12M': '12 mois' }, en: { '1M': '1 mo', '3M': '3 mo', '6M': '6 mo', '12M': '12 mo' } } as const;
type HKey = keyof typeof H_SESSIONS;

/** Price history followed by the forecast cone: 80 % range (shaded), median path, bull/bear representative paths. */
export function FanChart({ bars, c, height = 230 }: { bars: { date: string; close: number }[]; c: ConsensusResult; height?: number }) {
  const th = useTheme();
  const { lang } = useT();
  const [w, setW] = useState(0);
  const hist = bars.slice(-126);
  const H = hist.length, F = 252, labelW = 64;
  const plotW = Math.max(0, w - labelW);
  const fc = c.forecasts;
  const pts = [{ t: 0, low: c.price, high: c.price, mid: c.price, bull: c.price, bear: c.price },
    ...fc.map((f) => ({ t: H_SESSIONS[f.horizon as HKey], low: f.rangeLow, high: f.rangeHigh, mid: c.price * (1 + f.expectedReturnPct / 100), bull: f.bull.price, bear: f.bear.price }))];
  const vals = [...hist.map((b) => b.close), ...pts.flatMap((p) => [p.low, p.high]), ...(c.invalidationLevel ? [c.invalidationLevel] : [])];
  const min = Math.min(...vals), max = Math.max(...vals), pad = (max - min) * 0.06 || 1;
  const lo = min - pad, hi = max + pad;
  const X = (i: number) => (i / (H - 1 + F)) * plotW;               // i = session index from start of history
  const Y = (v: number) => 8 + (height - 28) * (1 - (v - lo) / (hi - lo));
  const fx = (t: number) => X(H - 1 + t);
  const path = (k: 'mid' | 'bull' | 'bear') => pts.map((p, i) => `${i ? 'L' : 'M'}${fx(p.t).toFixed(1)},${Y(p[k]).toFixed(1)}`).join(' ');
  const cone = [...pts.map((p) => `${fx(p.t).toFixed(1)},${Y(p.high).toFixed(1)}`), ...[...pts].reverse().map((p) => `${fx(p.t).toFixed(1)},${Y(p.low).toFixed(1)}`)].join(' ');
  const histPath = hist.map((b, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(b.close).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;
  const fmt = (v: number) => fmtNum(v, lang, v >= 100 ? 0 : 2);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }} accessibilityRole="image"
      accessibilityLabel={lang === 'fr' ? 'Graphique des prévisions du modèle : historique de cours puis cône des scénarios à 12 mois' : 'Forecast fan chart'}>
      {w > 0 && H > 1 ? (
        <Svg width={w} height={height}>
          <Polygon points={cone} fill={th.accent} fillOpacity={0.14} />
          {fc.map((f) => <Line key={f.horizon} x1={fx(H_SESSIONS[f.horizon as HKey])} x2={fx(H_SESSIONS[f.horizon as HKey])} y1={8} y2={height - 20} stroke={th.grid} strokeDasharray="2 4" />)}
          {c.invalidationLevel ? <Line x1={0} x2={plotW} y1={Y(c.invalidationLevel)} y2={Y(c.invalidationLevel)} stroke={th.warn} strokeDasharray="5 4" strokeWidth={1} /> : null}
          <Path d={histPath} stroke={th.text} strokeWidth={1.6} fill="none" />
          <Path d={path('bull')} stroke={th.up} strokeWidth={1.4} strokeDasharray="5 4" fill="none" />
          <Path d={path('bear')} stroke={th.down} strokeWidth={1.4} strokeDasharray="5 4" fill="none" />
          <Path d={path('mid')} stroke={th.accent} strokeWidth={2.2} fill="none" />
          <Circle cx={fx(0)} cy={Y(c.price)} r={3.5} fill={th.accent} />
          {fc.map((f) => <SvgText key={`l${f.horizon}`} x={fx(H_SESSIONS[f.horizon as HKey])} y={height - 6} fontSize={10} fill={th.textMuted} textAnchor="middle">{f.horizon === '12M' ? (lang === 'fr' ? '12M' : '12M') : f.horizon}</SvgText>)}
          <SvgText x={X(0)} y={height - 6} fontSize={10} fill={th.textMuted}>{lang === 'fr' ? '−6M' : '−6M'}</SvgText>
          <SvgText x={plotW + 4} y={Y(last.bull) + 4} fontSize={10} fill={th.up}>{fmt(last.bull)}</SvgText>
          <SvgText x={plotW + 4} y={Y(last.mid) + 4} fontSize={10} fill={th.accent} fontWeight="bold">{fmt(last.mid)}</SvgText>
          <SvgText x={plotW + 4} y={Y(last.bear) + 4} fontSize={10} fill={th.down}>{fmt(last.bear)}</SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

function ProbBar({ bear, central, bull }: { bear: number; central: number; bull: number }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: th.grid }}>
      <View style={{ flex: Math.max(bear, 0.001), backgroundColor: th.down }} />
      <View style={{ flex: Math.max(central, 0.001), backgroundColor: th.neutral }} />
      <View style={{ flex: Math.max(bull, 0.001), backgroundColor: th.up }} />
    </View>
  );
}

export function ForecastPanel({ s }: { s: AssetSheet }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const c = s.consensus;
  const currency = s.asset.currency as CurrencyCode;
  const full = isFullConsensus(c);
  const detail = useQuery({ queryKey: ['forecast-detail', s.asset.id], queryFn: () => api.forecastDetail(s.asset.id), enabled: full, staleTime: 3600_000 });
  const reading = useMutation({ mutationFn: () => api.forecastReading(s.asset.id, lang) });

  if (!c) return <Card title={fr ? '🔮 Prévisions' : '🔮 Forecasts'}><Txt muted>{fr ? 'Historique de cours insuffisant pour calculer des prévisions sur ce titre.' : 'Not enough price history to compute forecasts.'}</Txt></Card>;

  if (!full) {
    const or = { positive: fr ? '▲ signal haussier' : '▲ bullish signal', neutral: fr ? '● signal neutre' : '● neutral signal', negative: fr ? '▼ signal baissier' : '▼ bearish signal' }[c.orientation];
    return (
      <Card title={fr ? '🔮 Prévisions · PRO' : '🔮 Forecasts · PRO'}>
        <Txt>{fr ? `Modèle : ${or} · confiance ${c.confidence === 'high' ? 'élevée' : c.confidence === 'medium' ? 'moyenne' : 'faible'}.` : `Model: ${or} · confidence ${c.confidence}.`}</Txt>
        <View style={{ height: 150, borderRadius: radius.md, backgroundColor: th.cardAlt, alignItems: 'center', justifyContent: 'center', padding: space.md, gap: 6 }}>
          <Txt size="xl">🔒</Txt>
          <Txt weight="700" style={{ textAlign: 'center' }}>{fr ? 'Scénarios baissier / central / haussier à 1, 3, 6 et 12 mois' : 'Bear / central / bull scenarios at 1, 3, 6 and 12 months'}</Txt>
          <Txt size="sm" muted style={{ textAlign: 'center' }}>{fr ? 'Probabilités, fourchette à 80 %, niveau d’invalidation, lecture par l’IA et test du modèle sur ce titre.' : 'Probabilities, 80% range, invalidation level, AI reading and model test on this stock.'}</Txt>
        </View>
        <Button label={fr ? 'Débloquer les prévisions (Premium)' : 'Unlock forecasts (Premium)'} onPress={() => router.push('/premium')} />
        <Disclaimer text={c.disclaimer[lang]} />
      </Card>
    );
  }

  const bt = detail.data?.backtests ?? [];
  const r = reading.data?.content;
  return (
    <>
      <Card title={fr ? '🔮 Prévisions du modèle' : '🔮 Model forecasts'}>
        <Txt size="sm" muted>{fr ? `Calculées après la séance du ${fmtDate(c.asOf, lang)} à partir du cours, de la tendance, des fondamentaux, des dividendes, de l’actualité et des analystes disponibles.` : `Computed after the ${fmtDate(c.asOf, lang)} session from price, trend, fundamentals, dividends, news and available analysts.`}</Txt>
        <FanChart bars={s.bars} c={c} />
        <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
          <Txt size="xs" color={th.accent}>━ {fr ? 'Médiane' : 'Median'}</Txt>
          <Txt size="xs" color={th.up}>┅ {fr ? 'Haussier' : 'Bull'}</Txt>
          <Txt size="xs" color={th.down}>┅ {fr ? 'Baissier' : 'Bear'}</Txt>
          <Txt size="xs" muted>▒ {fr ? 'Fourchette 80 %' : '80% range'}</Txt>
          {c.invalidationLevel ? <Txt size="xs" color={th.warn}>┄ {fr ? 'Invalidation' : 'Invalidation'}</Txt> : null}
        </Row>
        {c.forecasts.map((f) => (
          <View key={f.horizon} style={{ backgroundColor: th.cardAlt, borderRadius: radius.md, padding: space.md, gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt weight="800">{H_LABEL[lang][f.horizon as HKey]}</Txt>
              <Txt size="xs" muted>{fr ? 'Fourchette 80 %' : '80% range'} : {fmtPrice(f.rangeLow, currency, lang)} – {fmtPrice(f.rangeHigh, currency, lang)}</Txt>
            </Row>
            <ProbBar bear={f.bear.probability} central={f.central.probability} bull={f.bull.probability} />
            <Row style={{ justifyContent: 'space-between' }}>
              {([[fr ? 'Baissier' : 'Bear', f.bear, th.down], [fr ? 'Central' : 'Central', f.central, th.neutral], [fr ? 'Haussier' : 'Bull', f.bull, th.up]] as const).map(([k, sc, col]) => (
                <View key={k} style={{ alignItems: 'center', flex: 1 }}>
                  <Txt size="xs" muted>{k} · {fmtNum(sc.probability * 100, lang, 0)} %</Txt>
                  <Txt size="sm" weight="800" color={col}>{fmtPct(sc.returnPct, lang, 1)}</Txt>
                  <Txt size="xs" muted>{fmtPrice(sc.price, currency, lang)}</Txt>
                </View>
              ))}
            </Row>
          </View>
        ))}
        {c.invalidationLevel != null ? <KV label={fr ? 'Niveau d’invalidation (3 mois)' : 'Invalidation level (3M)'} value={fmtPrice(c.invalidationLevel, currency, lang)} valueColor={th.warn} /> : null}
        <KV label={fr ? 'Confiance du modèle' : 'Model confidence'} value={`${c.confidence === 'high' ? (fr ? 'élevée' : 'high') : c.confidence === 'medium' ? (fr ? 'moyenne' : 'medium') : (fr ? 'faible' : 'low')} · ${fmtNum(c.confidenceValue * 100, lang, 0)} %`} />
        <KV label={fr ? 'Couverture des données' : 'Data coverage'} value={`${fmtNum(c.dataCoverage * 100, lang, 0)} %`} />
        {c.liquidity?.warning ? <Txt size="sm" color={th.warn}>⚠ {fr ? 'Titre peu liquide : les cours peuvent sauter fortement d’une séance à l’autre, la fourchette a été élargie.' : 'Illiquid stock: the range was widened.'}</Txt> : null}
        {c.analysts?.count && c.analysts.targetMean ? (
          <KV label={fr ? `Objectif moyen des analystes (${c.analysts.count})` : `Analysts' mean target (${c.analysts.count})`}
            value={`${fmtPrice(c.analysts.targetMean, currency, lang)} (${fmtPct((c.analysts.targetMean / c.price - 1) * 100, lang, 1)})`} />
        ) : <Txt size="xs" muted>{fr ? 'Aucun objectif d’analyste publié disponible pour ce titre.' : 'No published analyst target available.'}</Txt>}
      </Card>

      <Card title={fr ? '✦ Lecture IA des prévisions' : '✦ AI reading of the forecasts'}>
        {!r ? (
          <>
            <Txt size="sm" muted>{fr ? 'L’IA explique ces scénarios en langage clair : ce qui les porte, ce qui pourrait les faire échouer et les niveaux à surveiller. Elle ne modifie aucun chiffre du modèle.' : 'The AI explains these scenarios in plain words without changing any figure.'}</Txt>
            <Button label={fr ? 'Obtenir la lecture IA' : 'Get the AI reading'} icon="✦" loading={reading.isPending} onPress={() => reading.mutate()} />
            {reading.error ? <Txt size="sm" color={th.down}>{fr ? 'Lecture indisponible pour le moment, réessayez.' : 'Reading unavailable, try again.'}</Txt> : null}
          </>
        ) : (
          <View style={{ gap: space.sm }}>
            <Txt weight="800">{r.headline}</Txt>
            {r.horizons.map((h) => <Txt key={h.horizon} size="sm"><Txt size="sm" weight="700">{H_LABEL[lang][h.horizon as HKey] ?? h.horizon} · </Txt>{h.reading}</Txt>)}
            {([[fr ? 'Ce qui porte la prévision' : 'Drivers', r.drivers, th.up], [fr ? 'Risques' : 'Risks', r.risks, th.down], [fr ? 'À surveiller' : 'Watch', r.watch, th.info]] as const).map(([title, list, col]) => list.length ? (
              <View key={title} style={{ gap: 2 }}>
                <Txt weight="700" color={col}>{title}</Txt>
                {list.map((x, i) => <Txt key={i} size="sm">• {x}</Txt>)}
              </View>
            ) : null)}
            <View style={{ borderLeftWidth: 3, borderLeftColor: th.accent, backgroundColor: th.cardAlt, padding: space.md, borderRadius: radius.sm, gap: 4 }}>
              <Txt weight="800">{fr ? 'Conclusion' : 'Conclusion'}</Txt>
              <Txt size="sm">{r.conclusion}</Txt>
            </View>
          </View>
        )}
      </Card>

      <Card title={fr ? '🎯 Le modèle a-t-il vu juste sur ce titre ?' : '🎯 How did the model do on this stock?'} collapsible defaultOpen={false}>
        <Txt size="sm" muted>{fr ? 'Test « à l’aveugle » sur l’historique de ce titre : à chaque date passée, le modèle ne voit que les cours connus ce jour-là (partie prix du modèle), puis sa prévision est comparée au cours réellement observé.' : 'Blind test on this stock’s history (price-only part of the model).'}</Txt>
        {detail.isLoading ? <Loading /> : !bt.some((b) => b.n) ? <Txt size="sm" muted>{fr ? 'Historique trop court (au moins 1 an + l’horizon testé) pour ce test.' : 'History too short for this test.'}</Txt> : bt.filter((b) => b.n).map((b) => (
          <View key={b.horizon} style={{ backgroundColor: th.cardAlt, borderRadius: radius.md, padding: space.md, gap: 4 }}>
            <Txt weight="700">{H_LABEL[lang][b.horizon as HKey]} · {b.n} {fr ? 'prévisions testées' : 'forecasts tested'}</Txt>
            <KV label={fr ? 'Direction correcte' : 'Correct direction'} value={b.hitRate == null ? '—' : `${fmtNum(b.hitRate * 100, lang, 0)} % (${b.calls} ${fr ? 'appels' : 'calls'})`} valueColor={b.hitRate != null && b.baseRateUp != null && b.hitRate > Math.max(b.baseRateUp, 1 - b.baseRateUp) ? th.up : undefined} />
            <KV label={fr ? 'Cours réel dans la fourchette 80 %' : 'Real price within 80% range'} value={b.rangeCoverage == null ? '—' : `${fmtNum(b.rangeCoverage * 100, lang, 0)} %`} />
            <KV label={fr ? 'Taux de base (périodes haussières)' : 'Base rate (rising periods)'} value={b.baseRateUp == null ? '—' : `${fmtNum(b.baseRateUp * 100, lang, 0)} %`} />
            <View style={{ flexDirection: 'row', gap: 2, marginTop: 4 }}>
              {b.samples.map((x) => <View key={x.date} style={{ flex: 1, height: 10, borderRadius: 2, backgroundColor: x.hit == null ? th.grid : x.hit ? th.up : th.down }} />)}
            </View>
            <Txt size="xs" muted>{fr ? 'Dernières prévisions : vert = bonne direction, rouge = mauvaise, gris = neutre.' : 'Latest: green = right, red = wrong, grey = neutral.'}</Txt>
          </View>
        ))}
        <Pressable onPress={() => router.push('/track-record')}><Txt size="xs" color={th.info}>{fr ? 'Historique global du modèle →' : 'Overall track record →'}</Txt></Pressable>
      </Card>
      <Disclaimer text={c.disclaimer[lang]} />
    </>
  );
}

/** Teaser shown on the forecasts ranking screen for free users. */
export function ForecastTeaser({ total, positive, neutral, negative, asOf }: { total: number; positive: number; neutral: number; negative: number; asOf: string }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  return (
    <Card title={fr ? '🔮 Prévisions · PRO' : '🔮 Forecasts · PRO'}>
      <Txt>{fr ? `Le modèle a calculé des prévisions pour ${total} titres après la séance du ${fmtDate(asOf, lang)} :` : `The model computed forecasts for ${total} stocks after the ${fmtDate(asOf, lang)} session:`}</Txt>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        <Pill label={`▲ ${positive} ${fr ? 'signaux haussiers' : 'bullish'}`} color={th.up} />
        <Pill label={`● ${neutral} ${fr ? 'neutres' : 'neutral'}`} />
        <Pill label={`▼ ${negative} ${fr ? 'signaux baissiers' : 'bearish'}`} color={th.down} />
      </Row>
      <Txt size="sm" muted>{fr ? 'Avec Premium : classement des titres par rendement médian attendu, probabilité de hausse ou de baisse à 1, 3, 6 et 12 mois, fourchettes et niveaux d’invalidation, filtres par bourse.' : 'With Premium: ranking by expected median return, probability of rise/fall at 1, 3, 6 and 12 months, ranges, invalidation levels, market filters.'}</Txt>
      <Button label={fr ? 'Passer à Premium' : 'Go Premium'} onPress={() => router.push('/premium')} />
    </Card>
  );
}

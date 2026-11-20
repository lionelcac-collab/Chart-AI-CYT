import { marketLabel } from '@chart-boursafrikia/core';
// Forecasts ranking (Premium): every stock ranked by the model's median expected return or probability of rise/fall,
// per horizon and exchange. Free users see a teaser with counts only.
import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { MarketButtons } from '../components/Chrome';
import { ForecastTeaser } from '../components/Forecasts';
import { Card, Disclaimer, ErrorBox, Loading, Pill, Row, Screen, Select, Txt } from '../components/ui';
import { useT } from '../i18n';
import { api, type ForecastRow } from '../lib/api';
import { fmtDate, fmtNum, fmtPct, fmtPrice } from '../lib/format';
import { radius, space, useTheme } from '../theme';

type H = '1M' | '3M' | '6M' | '12M';
type Sort = 'central' | 'pBull' | 'pBear' | 'confidence';

export default function ForecastsScreen() {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const q = useQuery({ queryKey: ['forecast-list'], queryFn: api.forecastList, staleTime: 600_000 });
  const [h, setH] = useState<H>('3M');
  const [sort, setSort] = useState<Sort>('central');
  const [market, setMarket] = useState<string | undefined>();
  const [liquidOnly, setLiquidOnly] = useState(false);
  const [minConf, setMinConf] = useState<'all' | 'medium' | 'high'>('all');
  const [n, setN] = useState(30);

  const rows = useMemo(() => {
    if (!q.data || q.data.locked) return [];
    const rank = { low: 0, medium: 1, high: 2 } as const;
    const key = (r: ForecastRow) => sort === 'confidence' ? r.confidenceValue : r.horizons[h][sort];
    return q.data.rows
      .filter((r) => (!market || r.market === market) && (!liquidOnly || !r.illiquid) && (minConf === 'all' || rank[r.confidence] >= rank[minConf]))
      .sort((a, b) => key(b) - key(a));
  }, [q.data, h, sort, market, liquidOnly, minConf]);

  const title = fr ? 'Prévisions' : 'Forecasts';
  if (q.isLoading) return <Screen edges={[]}><Stack.Screen options={{ title }} /><Loading /></Screen>;
  if (q.error || !q.data) return <Screen edges={[]}><Stack.Screen options={{ title }} /><ErrorBox message={fr ? 'Prévisions indisponibles.' : 'Forecasts unavailable.'} onRetry={() => q.refetch()} /></Screen>;
  if (q.data.locked) return <Screen edges={[]}><Stack.Screen options={{ title }} /><ForecastTeaser {...q.data} /><Disclaimer text={fr ? 'Estimations statistiques, pas une garantie ni un conseil en investissement.' : 'Statistical estimates, not a guarantee nor investment advice.'} /></Screen>;

  const asOf = q.data.rows.reduce((m, r) => (r.asOf > m ? r.asOf : m), '');
  const sorts: [Sort, string][] = [['central', fr ? 'Rendement médian' : 'Median return'], ['pBull', fr ? 'Proba. de hausse' : 'Prob. of rise'], ['pBear', fr ? 'Proba. de baisse' : 'Prob. of fall'], ['confidence', fr ? 'Confiance' : 'Confidence']];
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title }} />
      <Card title={fr ? '🔮 Classement des prévisions du modèle' : '🔮 Model forecasts ranking'}>
        <Txt size="sm" muted>{fr ? `${q.data.rows.length} titres · calcul après la séance du ${fmtDate(asOf, lang)}. Scénarios statistiques du modèle (tendance, valorisation, qualité, dividende, actualité, analystes), pas des recommandations.` : `${q.data.rows.length} stocks · computed after the ${fmtDate(asOf, lang)} session. Statistical scenarios, not recommendations.`}</Txt>
        <MarketButtons value={market} onChange={setMarket} allLabel={fr ? 'Toutes' : 'All'} />
        <Txt size="xs" muted>{fr ? 'Horizon' : 'Horizon'}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>{(['1M', '3M', '6M', '12M'] as H[]).map((x) => <Pill key={x} label={x.replace('M', fr ? ' mois' : ' mo')} active={h === x} onPress={() => setH(x)} />)}</Row>
        <Txt size="xs" muted>{fr ? 'Trier par' : 'Sort by'}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>{sorts.map(([k, l]) => <Pill key={k} label={l} active={sort === k} onPress={() => setSort(k)} />)}</Row>
        <Row style={{ flexWrap: 'wrap' }}>
          <Pill label={fr ? 'Titres liquides uniquement' : 'Liquid only'} active={liquidOnly} onPress={() => setLiquidOnly((v) => !v)} />
          <Select label={fr ? 'Confiance' : 'Confidence'} value={minConf} onChange={setMinConf}
            options={[['all', fr ? 'Toutes' : 'All'], ['medium', fr ? 'Moyenne ou +' : 'Medium+'], ['high', fr ? 'Élevée' : 'High']].map(([v, l]) => ({ value: v as 'all', label: l }))} />
        </Row>
      </Card>

      <Card title={`${rows.length} ${fr ? 'titres' : 'stocks'}`}>
        {rows.slice(0, n).map((r, i) => {
          const f = r.horizons[h];
          return (
            <Pressable key={r.assetId} onPress={() => router.push(`/asset/${encodeURIComponent(r.assetId)}`)}
              style={{ paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: th.grid, gap: 4 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="800">{i + 1}. {r.ticker} <Txt size="xs" muted>{marketLabel(r.market)}{r.illiquid ? ' · ⚠ ' + (fr ? 'peu liquide' : 'illiquid') : ''}</Txt></Txt>
                  <Txt size="xs" muted numberOfLines={1}>{r.name}{r.sector ? ` · ${fr ? r.sector.fr : r.sector.en}` : ''}</Txt>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt weight="800" color={f.central > 0.5 ? th.up : f.central < -0.5 ? th.down : th.neutral}>{fmtPct(f.central, lang, 1)}</Txt>
                  <Txt size="xs" muted>{fmtPrice(r.price, r.currency as never, lang)}</Txt>
                </View>
              </Row>
              <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: th.grid }}>
                <View style={{ flex: Math.max(f.pBear, 0.001), backgroundColor: th.down }} />
                <View style={{ flex: Math.max(f.pCentral, 0.001), backgroundColor: th.neutral }} />
                <View style={{ flex: Math.max(f.pBull, 0.001), backgroundColor: th.up }} />
              </View>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <Txt size="xs" color={th.down}>▼ {fmtNum(f.pBear * 100, lang, 0)} %</Txt>
                <Txt size="xs" muted>{fr ? 'Fourchette' : 'Range'} {fmtPrice(f.low, r.currency as never, lang)} – {fmtPrice(f.high, r.currency as never, lang)}</Txt>
                <Txt size="xs" color={th.up}>▲ {fmtNum(f.pBull * 100, lang, 0)} %</Txt>
              </Row>
              <Txt size="xs" muted>{fr ? 'Confiance' : 'Confidence'} {r.confidence === 'high' ? (fr ? 'élevée' : 'high') : r.confidence === 'medium' ? (fr ? 'moyenne' : 'medium') : (fr ? 'faible' : 'low')}{r.analysts ? ` · ${r.analysts} ${fr ? 'analyste(s)' : 'analyst(s)'}` : ''}{r.invalidation ? ` · ${fr ? 'invalidation' : 'invalidation'} ${fmtPrice(r.invalidation, r.currency as never, lang)}` : ''}</Txt>
            </Pressable>
          );
        })}
        {rows.length > n ? <Pressable onPress={() => setN((x) => x + 30)} style={{ padding: space.md, alignItems: 'center', borderRadius: radius.md }}><Txt color={th.accent} weight="700">{fr ? 'Voir plus' : 'Show more'}</Txt></Pressable> : null}
      </Card>
      <Txt size="xs" muted>{fr ? 'Barre : probabilité de scénario baissier (rouge), central (gris), haussier (vert). Les titres peu liquides ont une fourchette élargie.' : 'Bar: probability of bear (red), central (grey), bull (green) scenario.'}</Txt>
      <Disclaimer text={fr ? 'Estimations statistiques, pas une garantie ni un conseil en investissement. Pour une analyse adaptée à votre situation, consultez un professionnel agréé (SGI, CIF).' : 'Statistical estimates, not a guarantee nor investment advice.'} />
    </Screen>
  );
}

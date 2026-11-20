import { useQuery } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, View } from 'react-native';
import { APP_NAME, MARKETS, sessionState, type MarketCode } from '@chart-boursafrikia/core';
import { Columns, Hero, MarketButtons, useIsDesktop } from '../../components/Chrome';
import { MarketScan } from '../../components/MarketScan';
import { AnalystConsensusBlock, PriceTargetsBlock } from '../../components/Analysts';
import { NewsList } from '../../components/NewsList';
import { Button, Card, ErrorBox, Loading, Pill, ProvenanceBadge, Row, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { sectorLabel } from '../../lib/demo';
import { asOfLabel, fmtCompact, fmtNum, fmtPct, fmtPrice } from '../../lib/format';
import { changeColor, radius, space, useTheme } from '../../theme';

export default function Dashboard() {
  const th = useTheme();
  const { t, lang } = useT();
  const [market, setMarket] = useState<MarketCode>('BRVM');
  const desktop = useIsDesktop();
  const q = useQuery({ queryKey: ['dashboard', market], queryFn: () => api.dashboard(market) });
  const state = sessionState(MARKETS[market as 'BRVM']);
  const stateLabel = { fr: { open: 'Séance en cours', closed: 'Séance terminée', pre_open: 'Avant ouverture', weekend: 'Marché fermé' }, en: { open: 'Session open', closed: 'Session closed', pre_open: 'Pre-open', weekend: 'Market closed' } }[lang][state];

  const news = useQuery({ queryKey: ['news', market], queryFn: () => api.news(market, 5) });
  const d = q.data;
  // Traded value when the source gives it, else number of shares traded (Mansa free plan: volume only).
  const byValue = (d?.movers ?? []).some((m) => m.value != null);
  const traded = [...(d?.movers ?? [])].filter((m) => (byValue ? m.value : m.volume) ?? 0).sort((a, b) => ((byValue ? b.value : b.volume) ?? 0) - ((byValue ? a.value : a.volume) ?? 0)).slice(0, 5);

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()} brand={false}>
      <Hero />
      <View style={{ flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'flex-end' : 'stretch', gap: space.md }}>
        <View style={{ flex: desktop ? 1 : undefined }}>
          <Txt size="xl" weight="800">{t.dashboard.title}</Txt>
          <Txt size="sm" muted>{APP_NAME} · {lang === 'fr' ? 'cours officiels et analyse IA' : 'official prices and AI analysis'}</Txt>
        </View>
        <View style={{ width: desktop ? 460 : undefined }}>
          <MarketButtons<MarketCode> value={market} onChange={(m) => m && setMarket(m)} />
        </View>
        <View style={{ alignSelf: desktop ? 'auto' : 'flex-start', marginBottom: desktop ? 8 : 0 }}><Pill label={stateLabel} bg={state === 'open' ? th.up : th.cardAlt} color={state === 'open' ? '#0B0F1E' : th.textMuted} /></View>
      </View>

      {q.isLoading ? <Loading /> : q.error ? <ErrorBox message={t.common.error} onRetry={() => q.refetch()} /> : d ? (
        <Columns flex={[3, 2]}>{[
        <Fragment key="main">
          <Card title={t.dashboard.indices} collapsible badge={d.indices.length || null}>
            {d.indices.length ? d.indices.map((i) => (
              <Row key={i.code} style={{ justifyContent: 'space-between' }}>
                <View><Txt weight="700">{i.code}</Txt><Txt size="xs" muted>{i.name}</Txt></View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt weight="600">{fmtNum(i.value, lang)}</Txt>
                  <Txt size="sm" weight="700" color={changeColor(th, i.changePct)}>{fmtPct(i.changePct, lang)}</Txt>
                </View>
              </Row>
            )) : <Txt muted>{t.common.unavailable}</Txt>}
            {d.indices[0] ? <ProvenanceBadge status={asOfLabel(d.indices[0].date, { kind: 'close', sessionDate: d.indices[0].date.slice(0, 10) }, lang)} source={d.indices[0].source} /> : null}
          </Card>

          {d.report ? (
            <Card title={t.dashboard.report} collapsible defaultOpen={false}>
              <Txt weight="700">{d.report.title}</Txt>
              <Txt size="sm">{lang === 'fr' ? d.report.body_fr : d.report.body_en}</Txt>
            </Card>
          ) : null}

          <Card title={t.dashboard.heatmap} collapsible defaultOpen={false} badge={d.sectors.length || null}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {d.sectors.length ? d.sectors.map((s) => {
                const intensity = Math.min(1, Math.abs(s.changePct) / 3);
                const bg = s.changePct >= 0 ? `rgba(47,203,142,${0.15 + 0.6 * intensity})` : `rgba(255,107,107,${0.15 + 0.6 * intensity})`;
                return (
                  <View key={s.sector} style={{ backgroundColor: bg, borderRadius: radius.md, padding: space.md, minWidth: '30%', flexGrow: 1 }}>
                    <Txt size="sm" weight="700">{sectorLabel(s.sector, lang)}</Txt>
                    <Txt size="sm">{fmtPct(s.changePct, lang)} · {s.count}</Txt>
                  </View>
                );
              }) : <Txt muted>{t.common.unavailable}</Txt>}
            </View>
          </Card>

          <MarketScan market={market} />
          <PriceTargetsBlock market={market} />
        </Fragment>,
        <Fragment key="side">

          <Card title={t.dashboard.news} collapsible defaultOpen={desktop} badge={news.data?.length || null}>
            {news.isLoading ? <Loading /> : news.data?.length ? <NewsList items={news.data} /> : <Txt muted>{t.common.unavailable}</Txt>}
            <Button label={t.dashboard.allNews} variant="secondary" onPress={() => router.push({ pathname: '/news', params: { market } })} />
          </Card>
          <Card title={t.dashboard.volume} collapsible defaultOpen={desktop} badge={traded.length || null}>
            {traded.map((a) => (
              <Row key={a.id} style={{ justifyContent: 'space-between' }}>
                <Link href={`/asset/${encodeURIComponent(a.id)}`}><Txt weight="700">{a.ticker}</Txt></Link>
                <Txt size="sm">{byValue ? `${fmtCompact(a.value, lang)} ${a.currency === 'XOF' || a.currency === 'XAF' ? 'FCFA' : a.currency}` : `${fmtCompact(a.volume, lang)} ${lang === 'fr' ? 'titres' : 'shares'}`}</Txt>
              </Row>
            ))}
          </Card>

          <Card title={t.dashboard.opportunities} collapsible defaultOpen={desktop} badge={Math.min(5, d.opportunities.length) || null}>
            {d.opportunities.length ? d.opportunities.slice(0, 5).map((o, i) => (
              <Pressable key={o.asset_id} onPress={() => router.push(`/asset/${encodeURIComponent(o.asset_id)}`)}>
                <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Txt size="sm" style={{ flex: 1 }} numberOfLines={1}>{i + 1}. {o.name}{o.illiquid ? ' ⚠' : ''}</Txt>
                  <Txt size="sm" weight="700" color={changeColor(th, o.score)}>{fmtNum(o.score * 100, lang, 0)}</Txt>
                </Row>
              </Pressable>
            )) : <Txt muted>{t.common.unavailable}</Txt>}
            <Txt size="xs" muted>{lang === 'fr' ? 'Score du modèle de −100 à +100, ⚠ = titre peu liquide. Classement statistique, pas une recommandation.' : 'Model score from −100 to +100, ⚠ = illiquid. Statistical ranking, not a recommendation.'}</Txt>
          </Card>
          <AnalystConsensusBlock market={market} />
          {d.movers[0] ? <ProvenanceBadge status={asOfLabel(d.movers[0].asOf, d.movers[0].status, lang)} source={d.movers[0].source} /> : null}
        </Fragment>,
        ]}</Columns>
      ) : null}
    </Screen>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { APP_NAME, MVP_MARKETS, MARKETS, sessionState, type MarketCode } from '@nyota/core';
import { Card, ErrorBox, Loading, Pill, ProvenanceBadge, Row, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { sectorLabel } from '../../lib/demo';
import { fmtCompact, fmtNum, fmtPct, fmtPrice, statusLabel } from '../../lib/format';
import type { AssetSummary } from '../../lib/types';
import { changeColor, radius, space, useTheme } from '../../theme';

function MoverRow({ a }: { a: AssetSummary }) {
  const th = useTheme();
  const { lang } = useT();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/asset/${encodeURIComponent(a.id)}`)} style={{ paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flex: 1, paddingRight: space.sm }}>
        <Txt weight="700">{a.ticker}</Txt>
        <Txt size="xs" muted numberOfLines={1}>{a.name}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt size="sm" weight="600">{fmtPrice(a.last, a.currency, lang)}</Txt>
        <Txt size="sm" weight="700" color={changeColor(th, a.changePct)}>{fmtPct(a.changePct, lang)}</Txt>
      </View>
    </Pressable>
  );
}

export default function Dashboard() {
  const th = useTheme();
  const { t, lang } = useT();
  const [market, setMarket] = useState<MarketCode>('BRVM');
  const q = useQuery({ queryKey: ['dashboard', market], queryFn: () => api.dashboard(market) });
  const state = sessionState(MARKETS[market as 'BRVM']);
  const stateLabel = { fr: { open: 'Séance en cours', closed: 'Séance terminée', pre_open: 'Avant ouverture', weekend: 'Marché fermé' }, en: { open: 'Session open', closed: 'Session closed', pre_open: 'Pre-open', weekend: 'Market closed' } }[lang][state];

  const d = q.data;
  const movers = d?.movers.filter((m) => m.changePct != null) ?? [];
  const top = [...movers].sort((a, b) => b.changePct! - a.changePct!).slice(0, 5);
  const flop = [...movers].sort((a, b) => a.changePct! - b.changePct!).slice(0, 5);
  const traded = [...(d?.movers ?? [])].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 5);

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View>
        <Txt size="xxl" weight="800">{APP_NAME}<Txt size="xxl" color={th.accent}> ✦</Txt></Txt>
        <Txt muted>{t.dashboard.title}</Txt>
      </View>
      <Row style={{ flexWrap: 'wrap' }}>
        {MVP_MARKETS.map((m) => <Pill key={m} label={m} active={m === market} onPress={() => setMarket(m)} />)}
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size="sm" muted>{MARKETS[market as 'BRVM'].name}</Txt>
        <Pill label={stateLabel} bg={state === 'open' ? th.up : th.cardAlt} color={state === 'open' ? '#0B0F1E' : th.textMuted} />
      </Row>

      {q.isLoading ? <Loading /> : q.error ? <ErrorBox message={t.common.error} onRetry={() => q.refetch()} /> : d ? (
        <>
          <Card title={t.dashboard.indices}>
            {d.indices.length ? d.indices.map((i) => (
              <Row key={i.code} style={{ justifyContent: 'space-between' }}>
                <View><Txt weight="700">{i.code}</Txt><Txt size="xs" muted>{i.name}</Txt></View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt weight="600">{fmtNum(i.value, lang)}</Txt>
                  <Txt size="sm" weight="700" color={changeColor(th, i.changePct)}>{fmtPct(i.changePct, lang)}</Txt>
                </View>
              </Row>
            )) : <Txt muted>{t.common.unavailable}</Txt>}
            {d.indices[0] ? <ProvenanceBadge status={statusLabel({ kind: 'close', sessionDate: d.indices[0].date }, lang)} source={d.indices[0].source} /> : null}
          </Card>

          {d.report ? (
            <Card title={t.dashboard.report}>
              <Txt weight="700">{d.report.title}</Txt>
              <Txt size="sm">{lang === 'fr' ? d.report.body_fr : d.report.body_en}</Txt>
            </Card>
          ) : null}

          <Card title={t.dashboard.heatmap}>
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

          <Card title={t.dashboard.top}>{top.map((a) => <MoverRow key={a.id} a={a} />)}</Card>
          <Card title={t.dashboard.flop}>{flop.map((a) => <MoverRow key={a.id} a={a} />)}</Card>
          <Card title={t.dashboard.volume}>
            {traded.map((a) => (
              <Row key={a.id} style={{ justifyContent: 'space-between' }}>
                <Link href={`/asset/${encodeURIComponent(a.id)}`}><Txt weight="700">{a.ticker}</Txt></Link>
                <Txt size="sm">{fmtCompact(a.value, lang)} {a.currency === 'XOF' || a.currency === 'XAF' ? 'FCFA' : a.currency}</Txt>
              </Row>
            ))}
          </Card>

          <Card title={t.dashboard.opportunities}>
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
          {d.movers[0] ? <ProvenanceBadge status={statusLabel(d.movers[0].status, lang)} source={d.movers[0].source} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

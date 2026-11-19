import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SCAN_PERIODS, scanView, type MarketCode, type ScanPeriod, type ScanRow } from '@chart-boursafrikia/core';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { fmtDate, fmtNum, fmtPct } from '../lib/format';
import { changeColor, radius, space, useTheme } from '../theme';
import { Card, ErrorBox, Loading, Pill, Row, Txt } from './ui';

const PERIOD_LABEL: Record<ScanPeriod, { fr: string; en: string }> = {
  '1D': { fr: '1 j', en: '1D' }, '1W': { fr: '1 sem.', en: '1W' }, '1M': { fr: '1 mois', en: '1M' }, '3M': { fr: '3 mois', en: '3M' },
  '6M': { fr: '6 mois', en: '6M' }, YTD: { fr: '1er janv.', en: 'YTD' }, '1Y': { fr: '1 an', en: '1Y' }, '2Y': { fr: '2 ans', en: '2Y' }, '3Y': { fr: '3 ans', en: '3Y' },
};
const THRESHOLDS = [1, 2, 3, 5];

function open(id: string) { router.push(`/asset/${encodeURIComponent(id)}`); }

function MoverLine({ r }: { r: ScanRow }) {
  const th = useTheme();
  const { lang } = useT();
  return (
    <Pressable accessibilityRole="link" onPress={() => open(r.assetId)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <View style={{ flex: 1, paddingRight: space.sm }}>
        <Txt weight="700">{r.ticker}{r.illiquid ? ' ⚠' : ''}</Txt>
        <Txt size="xs" muted numberOfLines={1}>{r.name}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt size="sm">{fmtNum(r.last, lang, r.last < 100 ? 2 : 0)}</Txt>
        <Txt size="sm" weight="700" color={changeColor(th, r.returnPct)}>{fmtPct(r.returnPct, lang)}</Txt>
      </View>
    </Pressable>
  );
}

/** Bar showing where the price sits between its support and resistance. */
function LevelLine({ r, kind }: { r: ScanRow; kind: 'support' | 'resistance' }) {
  const th = useTheme();
  const { t, lang, fmt } = useT();
  const dist = kind === 'support' ? r.supportDistPct : r.resistanceDistPct;
  const lo = r.support ?? r.last, hi = r.resistance ?? r.last;
  const pos = hi > lo ? Math.min(100, Math.max(0, ((r.last - lo) / (hi - lo)) * 100)) : kind === 'support' ? 0 : 100;
  const col = kind === 'support' ? th.up : th.down;
  return (
    <Pressable accessibilityRole="link" onPress={() => open(r.assetId)} style={{ paddingVertical: 6, gap: 4 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt weight="700">{r.ticker}{r.illiquid ? ' ⚠' : ''} <Txt size="xs" muted>{r.name}</Txt></Txt>
        <Txt size="sm" weight="700" color={col}>{fmt(t.dashboard.distance, { n: fmtNum(dist, lang, 1) })}</Txt>
      </Row>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: th.cardAlt }}>
        <View style={{ position: 'absolute', left: `${Math.min(96, pos)}%`, width: 8, height: 6, borderRadius: 3, backgroundColor: th.accent }} />
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size="xs" color={th.up}>S {r.support != null ? fmtNum(r.support, lang, r.support < 100 ? 2 : 0) : '—'}</Txt>
        <Txt size="xs" muted>{fmtNum(r.last, lang, r.last < 100 ? 2 : 0)}</Txt>
        <Txt size="xs" color={th.down}>R {r.resistance != null ? fmtNum(r.resistance, lang, r.resistance < 100 ? 2 : 0) : t.dashboard.noResistance}</Txt>
      </Row>
    </Pressable>
  );
}

export function MarketScan({ market }: { market: MarketCode }) {
  const { t, lang, fmt } = useT();
  const [period, setPeriod] = useState<ScanPeriod>('1D');
  const [levelPeriod, setLevelPeriod] = useState<ScanPeriod>('3M');
  const [near, setNear] = useState(3);
  const movers = useQuery({ queryKey: ['scan', market, period], queryFn: () => api.scan(market, period) });
  const levels = useQuery({ queryKey: ['scan', market, levelPeriod], queryFn: () => api.scan(market, levelPeriod) });
  const mv = scanView(movers.data?.rows ?? [], near);
  const lv = scanView(levels.data?.rows ?? [], near, 50);
  const periods = (ps: ScanPeriod[], cur: ScanPeriod, set: (p: ScanPeriod) => void) => (
    <Row style={{ flexWrap: 'wrap' }}>{ps.map((p) => <Pill key={p} label={PERIOD_LABEL[p][lang]} active={cur === p} onPress={() => set(p)} />)}</Row>
  );
  const asOf = (d: string | null | undefined) => (d ? <Txt size="xs" muted>{lang === 'fr' ? 'Clôture du' : 'Close of'} {fmtDate(d, lang)}</Txt> : null);

  return (
    <>
      <Card title={`${t.dashboard.top} / ${t.dashboard.flop}`}>
        {periods(SCAN_PERIODS, period, setPeriod)}
        {movers.isLoading ? <Loading /> : movers.error ? <ErrorBox message={t.common.error} onRetry={() => movers.refetch()} /> : movers.data?.unavailable ? (
          <View><Txt muted>{t.common.unavailable}</Txt><Txt size="xs" muted>{t.common.historyNeeded}</Txt></View>
        ) : (
          <View style={{ gap: space.md }}>
            <View>
              <Txt weight="700">▲ {t.dashboard.top}</Txt>
              {mv.gainers.length ? mv.gainers.map((r) => <MoverLine key={r.assetId} r={r} />) : <Txt size="sm" muted>{lang === 'fr' ? 'Aucun titre en hausse sur la période.' : 'No stock up over the period.'}</Txt>}
            </View>
            <View>
              <Txt weight="700">▼ {t.dashboard.flop}</Txt>
              {mv.losers.length ? mv.losers.map((r) => <MoverLine key={r.assetId} r={r} />) : <Txt size="sm" muted>{lang === 'fr' ? 'Aucun titre en baisse sur la période.' : 'No stock down over the period.'}</Txt>}
            </View>
            {asOf(movers.data?.sessionDate)}
          </View>
        )}
      </Card>

      <Card title={lang === 'fr' ? 'Supports et résistances' : 'Supports & resistances'}>
        <Txt size="xs" muted>{t.dashboard.period}</Txt>
        {periods(SCAN_PERIODS.filter((p) => p !== '1D'), levelPeriod, setLevelPeriod)}
        <Txt size="xs" muted>{t.dashboard.threshold}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>{THRESHOLDS.map((n) => <Pill key={n} label={`≤ ${n} %`} active={near === n} onPress={() => setNear(n)} />)}</Row>
        {levels.isLoading ? <Loading /> : levels.error ? <ErrorBox message={t.common.error} onRetry={() => levels.refetch()} /> : levels.data?.unavailable ? (
          <View><Txt muted>{t.common.unavailable}</Txt><Txt size="xs" muted>{t.common.historyNeeded}</Txt></View>
        ) : (
          <View style={{ gap: space.md }}>
            <View>
              <Txt weight="700">{t.dashboard.nearSupport} ({lv.nearSupport.length})</Txt>
              {lv.nearSupport.length ? lv.nearSupport.map((r) => <LevelLine key={r.assetId} r={r} kind="support" />) : <Txt size="sm" muted>{fmt(t.dashboard.noneNear, { n: near })}</Txt>}
            </View>
            <View>
              <Txt weight="700">{t.dashboard.nearResistance} ({lv.nearResistance.length})</Txt>
              {lv.nearResistance.length ? lv.nearResistance.map((r) => <LevelLine key={r.assetId} r={r} kind="resistance" />) : <Txt size="sm" muted>{fmt(t.dashboard.noneNear, { n: near })}</Txt>}
            </View>
            <Txt size="xs" muted>{t.dashboard.levelsHelp} ⚠ = {lang === 'fr' ? 'titre peu liquide' : 'illiquid'}.</Txt>
            {asOf(levels.data?.sessionDate)}
          </View>
        )}
      </Card>
    </>
  );
}

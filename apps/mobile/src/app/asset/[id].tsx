import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { AssetSectionsAnalysis } from '../../components/AiAnalysisCard';
import { ConsensusCard, FundamentalsCard, LiquidityCard, PerformanceGrid, RangeTable, TechnicalCard } from '../../components/AssetSections';
import { Columns, useIsDesktop } from '../../components/Chrome';
import { CompanyPanel } from '../../components/CompanyPanel';
import { ForecastPanel } from '../../components/Forecasts';
import { AlertForm, AlertList } from '../../components/Alerts';
import { NewsList } from '../../components/NewsList';
import PriceChart from '../../components/PriceChart';
import { Button, Card, ErrorBox, KV, Loading, Pill, ProvenanceBadge, Row, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { asOfLabel, fmtCompact, fmtDate, fmtNum, fmtPct, fmtPrice, statusLabel } from '../../lib/format';
import { useSettings } from '../../settings';
import { changeColor, radius, space, useTheme } from '../../theme';

const CHART_RANGES = [['1M', 22], ['3M', 66], ['6M', 130], ['1A', 260], ['3A', 800]] as const;

/** % change over the last n sessions (null when the history is shorter than the period). */
function periodChange(bars: { close: number }[], n: number): number | null {
  if (bars.length < 2) return null;
  const last = bars[bars.length - 1]!.close;
  const first = bars.length > n ? bars[bars.length - 1 - n]!.close : null;
  return first && first > 0 ? (last / first - 1) * 100 : null;
}

function PeriodButton({ label, pct, active, onPress }: { label: string; pct: number | null; active: boolean; onPress: () => void }) {
  const th = useTheme();
  const { lang } = useT();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${label} ${pct == null ? '' : fmtPct(pct, lang, 1)}`} onPress={onPress} hitSlop={4}
      style={{ flex: 1, maxWidth: 110, alignItems: 'center', paddingHorizontal: 2, paddingVertical: 6, borderRadius: radius.md, backgroundColor: active ? th.accent : th.cardAlt, borderWidth: 1, borderColor: active ? th.accent : th.border, gap: 1 }}>
      <Txt size="sm" weight="700" color={active ? th.accentText : th.text}>{label}</Txt>
      <Txt size="xs" weight="700" color={pct == null ? (active ? th.accentText : th.textMuted) : active ? th.accentText : changeColor(th, pct)}>{pct == null ? '—' : fmtPct(pct, lang, 1)}</Txt>
    </Pressable>
  );
}

export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assetId = decodeURIComponent(String(id));
  const th = useTheme();
  const { t, lang } = useT();
  const { plan, displayCurrency } = useSettings();
  const qc = useQueryClient();
  const desktop = useIsDesktop();
  const [range, setRange] = useState<number>(260);
  const [tab, setTab] = useState<'analysis' | 'forecast' | 'company' | 'news'>('analysis');

  const q = useQuery({ queryKey: ['asset', assetId, plan], queryFn: () => api.asset(assetId, plan === 'premium') });
  const wl = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const watched = wl.data?.includes(assetId) ?? false;
  const myAlerts = useQuery({ queryKey: ['alerts'], queryFn: api.alerts });
  const toggle = useMutation({ mutationFn: () => api.toggleWatch(assetId, !watched), onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }) });

  const s = q.data;
  const bars = useMemo(() => (s ? s.bars.slice(-range) : []), [s, range]);
  const levels = useMemo(() => s?.technical?.levels.map((l) => ({ price: l.price, kind: l.kind })) ?? [], [s]);

  if (q.isLoading) return <Screen><Loading /></Screen>;
  if (q.error || !s) return <Screen><ErrorBox message={t.common.error} onRetry={() => q.refetch()} /></Screen>;

  // Free plan (or outside the session): no intraday quote → derive the header from the last verified session.
  const lastBar = s.bars[s.bars.length - 1];
  const prevBar = s.bars[s.bars.length - 2];
  // Only an intraday delayed quote (Premium, during the session) overrides the verified history.
  const quote = (s.quote?.status === 'delayed' ? s.quote : null) ?? (lastBar ? {
    last: lastBar.close, change_pct: prevBar && prevBar.close > 0 ? ((lastBar.close - prevBar.close) / prevBar.close) * 100 : null,
    volume: lastBar.volume, value: lastBar.value ?? null, market_cap: null, status: 'close' as const, delay_minutes: null,
    as_of: lastBar.date, source: s.lastSource ?? '—',
  } : null);
  const status = quote?.as_of?.includes('T') ? asOfLabel(quote.as_of, null, lang) : quote?.status === 'delayed'
    ? statusLabel({ kind: 'delayed', delayMinutes: quote.delay_minutes ?? 30 }, lang)
    : statusLabel(s.lastClose ? { kind: 'close', sessionDate: s.lastClose.date } : { kind: 'unavailable' }, lang);
  const last = quote?.last ?? s.lastClose?.price ?? null;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: s.asset.ticker, headerShown: !desktop, headerRight: () => (
        <Pressable accessibilityLabel={watched ? t.watchlist.remove : t.watchlist.add} onPress={() => toggle.mutate()} hitSlop={10}>
          <Txt size="xl" color={th.accent}>{watched ? '★' : '☆'}</Txt>
        </Pressable>
      ) }} />
      {desktop ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="link" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <Txt size="sm" color={th.accent} weight="700">‹ {lang === 'fr' ? 'Retour' : 'Back'}</Txt>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => toggle.mutate()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: th.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
            <Txt color={th.accent}>{watched ? '★' : '☆'}</Txt>
            <Txt size="sm" weight="700">{watched ? t.watchlist.remove : t.watchlist.add}</Txt>
          </Pressable>
        </Row>
      ) : null}
      <View style={{ gap: 4 }}>
        <Txt size={desktop ? 'xxl' : 'lg'} weight="800">{s.asset.name}</Txt>
        <Txt size="sm" muted>{s.asset.ticker} · {s.asset.market}{s.asset.sectors ? ` · ${lang === 'fr' ? s.asset.sectors.name_fr : s.asset.sectors.name_en}` : ''}</Txt>
        <Row style={{ alignItems: 'flex-end', marginTop: space.sm }}>
          <Txt size="xxl" weight="800">{fmtPrice(last, s.asset.currency, lang, displayCurrency)}</Txt>
          <Txt size="lg" weight="700" color={changeColor(th, quote?.change_pct)}>{fmtPct(quote?.change_pct, lang)}</Txt>
        </Row>
        <ProvenanceBadge status={status} source={quote?.source ?? '—'} />
      </View>

      <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
        {(['analysis', 'forecast', 'company', 'news'] as const).map((k) => <Pill key={k} label={t.asset.tabs[k]} active={tab === k} onPress={() => setTab(k)} />)}
      </Row>

      {tab === 'analysis' ? (
        <>
        <AssetSectionsAnalysis assetId={s.asset.id} />
        <Card title={lang === 'fr' ? '🔔 Alertes sur ce titre' : '🔔 Alerts on this stock'} collapsible defaultOpen={false} badge={(myAlerts.data ?? []).filter((x) => x.asset_id === s.asset.id).length || null}>
          <AlertForm assets={[{ id: s.asset.id, ticker: s.asset.ticker, last: last, currency: s.asset.currency }]} />
          <AlertList alerts={(myAlerts.data ?? []).filter((x) => x.asset_id === s.asset.id)} />
        </Card>
        {desktop ? (
          <Columns flex={[3, 2]}>{[
            <Fragment key="main">
        <Card>
          <Row gap={6}>
            {CHART_RANGES.map(([label, n]) => <PeriodButton key={label} label={lang === 'en' ? label.replace('A', 'Y') : label} pct={periodChange(s.bars, n)} active={range === n} onPress={() => setRange(n)} />)}
          </Row>
          {bars.length > 1 ? <PriceChart bars={bars} levels={levels} /> : <Txt muted>{t.common.unavailable}</Txt>}
          <Txt size="xs" muted>— MM50  - - MM200  · {t.asset.supports}/{t.asset.resistances}</Txt>
        </Card>

              <TechnicalCard tech={s.technical} currency={s.asset.currency} />
              <ConsensusCard sheet={s} />
            </Fragment>,
            <Fragment key="side">
        <Card title={t.asset.overview}>
          <KV label={t.asset.volumeDay} value={fmtCompact(quote?.volume, lang)} />
          <KV label={t.asset.valueDay} value={quote?.value != null ? fmtPrice(quote.value, s.asset.currency, lang) : '—'} />
          <KV label={t.asset.marketCap} value={quote?.market_cap != null ? fmtPrice(quote.market_cap, s.asset.currency, lang) : t.common.unavailable} />
        </Card>

              <RangeTable ranges={s.ranges} currency={s.asset.currency} />
              <PerformanceGrid perf={s.performance} />
              <LiquidityCard l={s.liquidity} />
              <FundamentalsCard r={s.ratios} sheet={s} />
            </Fragment>,
          ]}</Columns>
        ) : (
          <>
        <Card>
          <Row gap={6}>
            {CHART_RANGES.map(([label, n]) => <PeriodButton key={label} label={lang === 'en' ? label.replace('A', 'Y') : label} pct={periodChange(s.bars, n)} active={range === n} onPress={() => setRange(n)} />)}
          </Row>
          {bars.length > 1 ? <PriceChart bars={bars} levels={levels} /> : <Txt muted>{t.common.unavailable}</Txt>}
          <Txt size="xs" muted>— MM50  - - MM200  · {t.asset.supports}/{t.asset.resistances}</Txt>
        </Card>

        <Card title={t.asset.overview}>
          <KV label={t.asset.volumeDay} value={fmtCompact(quote?.volume, lang)} />
          <KV label={t.asset.valueDay} value={quote?.value != null ? fmtPrice(quote.value, s.asset.currency, lang) : '—'} />
          <KV label={t.asset.marketCap} value={quote?.market_cap != null ? fmtPrice(quote.market_cap, s.asset.currency, lang) : t.common.unavailable} />
        </Card>

        <RangeTable ranges={s.ranges} currency={s.asset.currency} />
        <PerformanceGrid perf={s.performance} />
        <LiquidityCard l={s.liquidity} />
        <ConsensusCard sheet={s} />
        <TechnicalCard tech={s.technical} currency={s.asset.currency} />
        <FundamentalsCard r={s.ratios} sheet={s} />
          </>
        )}
        </>
      ) : tab === 'forecast' ? (
        <ForecastPanel s={s} />
      ) : tab === 'company' ? (
        <CompanyPanel s={s} />
      ) : (
        <Card title={t.asset.news}>
          {s.news.length ? <NewsList items={s.news} showTickers={false} /> : <Txt muted>{t.asset.noNews}</Txt>}
          {s.events.length ? (
            <View style={{ gap: 4, marginTop: space.sm }}>
              <Txt weight="700">{t.asset.calendar}</Txt>
              {s.events.map((e, i) => <KV key={i} label={fmtDate(e.event_date, lang)} value={(lang === 'fr' ? e.title_fr : e.title_en) ?? e.kind} />)}
            </View>
          ) : null}
        </Card>
      )}
      <Button label={t.assistant.title} variant="secondary" icon="✦" onPress={() => router.push({ pathname: '/assistant', params: { q: s.asset.name } })} />
    </Screen>
  );
}

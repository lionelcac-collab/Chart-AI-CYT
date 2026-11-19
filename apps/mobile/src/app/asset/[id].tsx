import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { AssetSectionsAnalysis } from '../../components/AiAnalysisCard';
import { ConsensusCard, FundamentalsCard, LiquidityCard, PerformanceGrid, RangeTable, TechnicalCard } from '../../components/AssetSections';
import PriceChart from '../../components/PriceChart';
import { Button, Card, ErrorBox, KV, Loading, Pill, ProvenanceBadge, Row, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { fmtCompact, fmtDate, fmtNum, fmtPct, fmtPrice, statusLabel } from '../../lib/format';
import { useSettings } from '../../settings';
import { changeColor, space, useTheme } from '../../theme';

const CHART_RANGES = [['1M', 22], ['3M', 66], ['6M', 130], ['1A', 260], ['3A', 800]] as const;

export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assetId = decodeURIComponent(String(id));
  const th = useTheme();
  const { t, lang } = useT();
  const { plan, displayCurrency } = useSettings();
  const qc = useQueryClient();
  const [range, setRange] = useState<number>(260);

  const q = useQuery({ queryKey: ['asset', assetId, plan], queryFn: () => api.asset(assetId, plan === 'premium') });
  const wl = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const watched = wl.data?.includes(assetId) ?? false;
  const toggle = useMutation({ mutationFn: () => api.toggleWatch(assetId, !watched), onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }) });

  const s = q.data;
  const bars = useMemo(() => (s ? s.bars.slice(-range) : []), [s, range]);
  const levels = useMemo(() => s?.technical?.levels.map((l) => ({ price: l.price, kind: l.kind })) ?? [], [s]);

  if (q.isLoading) return <Screen><Loading /></Screen>;
  if (q.error || !s) return <Screen><ErrorBox message={t.common.error} onRetry={() => q.refetch()} /></Screen>;

  const quote = s.quote;
  const status = quote?.status === 'delayed'
    ? statusLabel({ kind: 'delayed', delayMinutes: quote.delay_minutes ?? 30 }, lang)
    : statusLabel(s.lastClose ? { kind: 'close', sessionDate: s.lastClose.date } : { kind: 'unavailable' }, lang);
  const last = quote?.last ?? s.lastClose?.price ?? null;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: s.asset.ticker, headerRight: () => (
        <Pressable accessibilityLabel={watched ? t.watchlist.remove : t.watchlist.add} onPress={() => toggle.mutate()} hitSlop={10}>
          <Txt size="xl" color={th.accent}>{watched ? '★' : '☆'}</Txt>
        </Pressable>
      ) }} />
      <View style={{ gap: 4 }}>
        <Txt size="lg" weight="700">{s.asset.name}</Txt>
        <Txt size="sm" muted>{s.asset.ticker} · {s.asset.market}{s.asset.sectors ? ` · ${lang === 'fr' ? s.asset.sectors.name_fr : s.asset.sectors.name_en}` : ''}</Txt>
        <Row style={{ alignItems: 'flex-end', marginTop: space.sm }}>
          <Txt size="xxl" weight="800">{fmtPrice(last, s.asset.currency, lang, displayCurrency)}</Txt>
          <Txt size="lg" weight="700" color={changeColor(th, quote?.change_pct)}>{fmtPct(quote?.change_pct, lang)}</Txt>
        </Row>
        <ProvenanceBadge status={status} source={quote?.source ?? '—'} />
      </View>

      <Card>
        <Row style={{ flexWrap: 'wrap' }}>
          {CHART_RANGES.map(([label, n]) => <Pill key={label} label={lang === 'en' ? label.replace('A', 'Y') : label} active={range === n} onPress={() => setRange(n)} />)}
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
      <AssetSectionsAnalysis assetId={s.asset.id} />
      <TechnicalCard tech={s.technical} currency={s.asset.currency} />
      <FundamentalsCard r={s.ratios} sheet={s} />

      <Card title={t.asset.identity}>
        <KV label="ISIN" value={s.asset.isin ?? '—'} />
        <KV label={lang === 'fr' ? 'Pays' : 'Country'} value={s.asset.country ?? '—'} />
        <KV label={lang === 'fr' ? 'Devise' : 'Currency'} value={s.asset.currency} />
        <KV label={lang === 'fr' ? 'Introduction' : 'Listing date'} value={fmtDate(s.asset.listing_date, lang)} />
        <KV label={lang === 'fr' ? 'Capital' : 'Share capital'} value={s.asset.share_capital != null ? fmtPrice(s.asset.share_capital, s.asset.currency, lang) : '—'} />
        <KV label={lang === 'fr' ? 'Nombre de titres' : 'Shares outstanding'} value={fmtCompact(s.asset.shares_outstanding, lang)} />
        <KV label={lang === 'fr' ? 'Flottant' : 'Free float'} value={s.asset.free_float_pct != null ? `${fmtNum(s.asset.free_float_pct, lang, 1)} %` : '—'} />
        {s.shareholders.map((h) => <KV key={h.holder} label={h.holder} value={h.pct != null ? `${fmtNum(h.pct, lang, 1)} %` : '—'} />)}
        {s.executives.map((e) => <KV key={e.person + e.role} label={e.role} value={e.person} />)}
        {s.asset.website ? <Pressable onPress={() => Linking.openURL(s.asset.website!)}><Txt size="sm" color={th.info}>{s.asset.website}</Txt></Pressable> : null}
      </Card>

      {s.peers.length ? (
        <Card title={t.asset.peers}>
          {s.peers.slice(0, 8).map((p) => (
            <Pressable key={p.id} onPress={() => router.push(`/asset/${encodeURIComponent(p.id)}`)}>
              <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}><Txt weight="600">{p.ticker}</Txt><Txt size="sm" muted numberOfLines={1}>{p.name} · {p.market}</Txt></Row>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card title={t.asset.news}>
        {s.news.length ? s.news.slice(0, 10).map((n) => (
          <Pressable key={n.id} onPress={() => Linking.openURL(n.url)} style={{ gap: 2 }}>
            <Txt size="sm" weight="600">{n.title}</Txt>
            {(lang === 'fr' ? n.summary_fr : n.summary_en) ? <Txt size="xs" muted>{lang === 'fr' ? n.summary_fr : n.summary_en}</Txt> : null}
            <Txt size="xs" muted>{n.source} · {fmtDate(n.published_at, lang)}</Txt>
          </Pressable>
        )) : <Txt muted>{t.common.unavailable}</Txt>}
        {s.events.map((e, i) => <KV key={i} label={fmtDate(e.event_date, lang)} value={(lang === 'fr' ? e.title_fr : e.title_en) ?? e.kind} />)}
      </Card>
      <Button label={t.assistant.title} variant="secondary" icon="✦" onPress={() => router.push({ pathname: '/assistant', params: { q: s.asset.name } })} />
    </Screen>
  );
}

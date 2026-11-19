import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { MVP_MARKETS, type MarketCode } from '@nyota/core';
import { Card, ErrorBox, Loading, Pill, Row, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { sectorLabel } from '../../lib/demo';
import { fmtCompact, fmtPct, fmtPrice } from '../../lib/format';
import { useSettings } from '../../settings';
import { changeColor, radius, space, useTheme } from '../../theme';

type SortKey = 'change' | 'value' | 'name';

export default function Screener() {
  const th = useTheme();
  const { t, lang, fmt } = useT();
  const { plan } = useSettings();
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState<MarketCode | undefined>();
  const [sector, setSector] = useState<string | undefined>();
  const [sort, setSort] = useState<SortKey>('change');
  const [minValue, setMinValue] = useState(false);
  const q = useQuery({ queryKey: ['search', query, market], queryFn: () => api.search(query, market) });

  const sectors = useMemo(() => [...new Set((q.data ?? []).map((a) => a.sector).filter(Boolean))] as string[], [q.data]);
  const rows = useMemo(() => {
    let r = (q.data ?? []).filter((a) => !sector || a.sector === sector);
    if (minValue) r = r.filter((a) => (a.value ?? 0) > 0);
    return r.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'value' ? (b.value ?? 0) - (a.value ?? 0) : (b.changePct ?? -1e9) - (a.changePct ?? -1e9));
  }, [q.data, sector, sort, minValue]);

  return (
    <Screen>
      <Txt size="xl" weight="800">{t.screener.title}</Txt>
      <TextInput value={query} onChangeText={setQuery} placeholder={t.common.search} placeholderTextColor={th.textMuted} autoCapitalize="characters"
        accessibilityLabel={t.common.search}
        style={{ backgroundColor: th.card, color: th.text, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: th.border, fontSize: 15 }} />
      <Row style={{ flexWrap: 'wrap' }}>
        <Pill label={t.screener.all} active={!market} onPress={() => setMarket(undefined)} />
        {MVP_MARKETS.map((m) => <Pill key={m} label={m} active={market === m} onPress={() => setMarket(m)} />)}
      </Row>
      {sectors.length ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <Pill label={t.screener.all} active={!sector} onPress={() => setSector(undefined)} />
          {sectors.map((s) => <Pill key={s} label={sectorLabel(s, lang)} active={sector === s} onPress={() => setSector(s)} />)}
        </Row>
      ) : null}
      <Row style={{ flexWrap: 'wrap' }}>
        <Txt size="sm" muted>{t.screener.sort} :</Txt>
        <Pill label={lang === 'fr' ? 'Variation' : 'Change'} active={sort === 'change'} onPress={() => setSort('change')} />
        <Pill label={lang === 'fr' ? 'Valeur échangée' : 'Traded value'} active={sort === 'value'} onPress={() => setSort('value')} />
        <Pill label={lang === 'fr' ? 'Nom' : 'Name'} active={sort === 'name'} onPress={() => setSort('name')} />
      </Row>
      <Card>
        <Txt weight="700">{t.screener.advanced}</Txt>
        {plan === 'premium'
          ? <Pill label={lang === 'fr' ? 'Échangé aujourd’hui uniquement' : 'Traded today only'} active={minValue} onPress={() => setMinValue((v) => !v)} />
          : <Pressable onPress={() => router.push('/premium')}><Txt size="sm" color={th.info}>🔒 PER, rendement, momentum, liquidité, score du modèle → Premium</Txt></Pressable>}
      </Card>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox message={t.common.error} onRetry={() => q.refetch()} /> : (
        <Card>
          <Txt size="xs" muted>{fmt(t.screener.results, { n: rows.length })}</Txt>
          {rows.map((a) => (
            <Pressable key={a.id} onPress={() => router.push(`/asset/${encodeURIComponent(a.id)}`)} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: th.grid }}>
              <View style={{ flex: 1 }}>
                <Txt weight="700">{a.ticker} <Txt size="xs" muted>{a.market}</Txt></Txt>
                <Txt size="xs" muted numberOfLines={1}>{a.name}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt size="sm">{fmtPrice(a.last, a.currency, lang)}</Txt>
                <Txt size="sm" weight="700" color={changeColor(th, a.changePct)}>{fmtPct(a.changePct, lang)}</Txt>
                <Txt size="xs" muted>{fmtCompact(a.value, lang)}</Txt>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

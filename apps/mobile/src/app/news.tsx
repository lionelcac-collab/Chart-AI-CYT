import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { MVP_MARKETS, type MarketCode } from '@chart-boursafrikia/core';
import { NewsList } from '../components/NewsList';
import { Card, ErrorBox, Loading, Pill, Row, Screen, Txt } from '../components/ui';
import { useT } from '../i18n';
import { api } from '../lib/api';

const CATS = ['results', 'dividend', 'corporate_action', 'regulation', 'management', 'macro'] as const;
const CAT_LABEL: Record<(typeof CATS)[number], { fr: string; en: string }> = {
  results: { fr: 'Résultats', en: 'Results' }, dividend: { fr: 'Dividendes', en: 'Dividends' }, corporate_action: { fr: 'Opérations', en: 'Corporate actions' },
  regulation: { fr: 'Régulation', en: 'Regulation' }, management: { fr: 'Direction', en: 'Management' }, macro: { fr: 'Macro', en: 'Macro' },
};

export default function News() {
  const { t, lang } = useT();
  const params = useLocalSearchParams<{ market?: string }>();
  const [market, setMarket] = useState<MarketCode | undefined>((params.market as MarketCode) || undefined);
  const [cat, setCat] = useState<string | undefined>();
  const q = useQuery({ queryKey: ['news', market ?? 'ALL', 60], queryFn: () => api.news(market, 60) });
  const items = (q.data ?? []).filter((n) => !cat || n.category === cat);
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: t.dashboard.news }} />
      <Row style={{ flexWrap: 'wrap' }}>
        <Pill label={t.screener.all} active={!market} onPress={() => setMarket(undefined)} />
        {MVP_MARKETS.map((m) => <Pill key={m} label={m} active={market === m} onPress={() => setMarket(m)} />)}
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        <Pill label={t.screener.all} active={!cat} onPress={() => setCat(undefined)} />
        {CATS.map((c) => <Pill key={c} label={CAT_LABEL[c][lang]} active={cat === c} onPress={() => setCat(c)} />)}
      </Row>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox message={t.common.error} onRetry={() => q.refetch()} /> : (
        <Card>{items.length ? <NewsList items={items} /> : <Txt muted>{t.common.unavailable}</Txt>}</Card>
      )}
      <Txt size="xs" muted>{lang === 'fr'
        ? 'Sources officielles (bourses, régulateurs, émetteurs) et presse via GDELT. Résumés et tonalité générés automatiquement par IA : vérifiez dans l’article d’origine.'
        : 'Official sources (exchanges, regulators, issuers) and press via GDELT. Summaries and tone are AI-generated: check the original article.'}</Txt>
    </Screen>
  );
}

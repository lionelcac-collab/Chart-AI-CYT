import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Card, Loading, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { fmtPct, fmtPrice } from '../../lib/format';
import { DEMO_MODE } from '../../lib/supabase';
import { useSettings } from '../../settings';
import { changeColor, space, useTheme } from '../../theme';

export default function Watchlist() {
  const th = useTheme();
  const { t, lang } = useT();
  const { plan } = useSettings();
  const ids = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const all = useQuery({ queryKey: ['search', '', undefined], queryFn: () => api.search(''), enabled: !!ids.data?.length });
  const rows = (all.data ?? []).filter((a) => ids.data?.includes(a.id));

  return (
    <Screen refreshing={ids.isRefetching} onRefresh={() => ids.refetch()}>
      <Txt size="xl" weight="800">{t.watchlist.title}</Txt>
      {plan === 'free' ? <Txt size="xs" muted>{t.watchlist.limit}</Txt> : null}
      {DEMO_MODE ? <Txt size="sm" muted>{lang === 'fr' ? 'Les listes de suivi sont enregistrées dans votre compte (backend requis).' : 'Watchlists are saved to your account (backend required).'}</Txt> : null}
      {ids.isLoading ? <Loading /> : !ids.data?.length ? <Card><Txt muted>{t.watchlist.empty}</Txt></Card> : (
        <Card>
          {rows.map((a) => (
            <Pressable key={a.id} onPress={() => router.push(`/asset/${encodeURIComponent(a.id)}`)} style={{ flexDirection: 'row', paddingVertical: space.sm }}>
              <View style={{ flex: 1 }}><Txt weight="700">{a.ticker}</Txt><Txt size="xs" muted numberOfLines={1}>{a.name}</Txt></View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt size="sm">{fmtPrice(a.last, a.currency, lang)}</Txt>
                <Txt size="sm" weight="700" color={changeColor(th, a.changePct)}>{fmtPct(a.changePct, lang)}</Txt>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

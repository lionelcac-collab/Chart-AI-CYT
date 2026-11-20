// Corporate calendar: general meetings and dividend payments read from the official bulletins.
import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Card, ErrorBox, Loading, Pill, Row, Screen, Txt } from '../components/ui';
import { useT } from '../i18n';
import { api, type CalendarEvent } from '../lib/api';
import { fmtDate } from '../lib/format';
import { radius, space, useTheme } from '../theme';

type Kind = 'all' | 'meetings' | 'dividends';
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarScreen() {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const q = useQuery({ queryKey: ['calendar'], queryFn: api.calendar });
  const wl = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const [kind, setKind] = useState<Kind>('all');
  const [mine, setMine] = useState(false);
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const today = new Date().toISOString().slice(0, 10);

  const events = useMemo(() => (q.data ?? []).filter((e) =>
    (kind === 'all' || (kind === 'dividends' ? e.kind === 'dividend' : e.kind === 'agm' || e.kind === 'egm'))
    && (!mine || (e.asset_id && wl.data?.includes(e.asset_id)))
    && (when === 'upcoming' ? e.event_date >= today : e.event_date < today)), [q.data, kind, mine, when, wl.data, today]);
  const ordered = when === 'upcoming' ? events : [...events].reverse();
  const groups = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of ordered) { const k = e.event_date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), e]); }
    return [...m.entries()];
  }, [ordered]);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: fr ? 'Calendrier' : 'Calendar' }} />
      <View>
        <Txt size="xl" weight="800">{fr ? 'Calendrier des sociétés' : 'Corporate calendar'}</Txt>
        <Txt size="sm" muted>{fr ? 'Assemblées générales et paiements de dividendes, relevés dans le Bulletin Officiel de la Cote de la BRVM (mis à jour après chaque séance).' : 'General meetings and dividend payments from the BRVM official bulletin (updated after each session).'}</Txt>
      </View>
      <Row style={{ flexWrap: 'wrap' }} gap={6}>
        <Pill label={fr ? 'À venir' : 'Upcoming'} active={when === 'upcoming'} onPress={() => setWhen('upcoming')} />
        <Pill label={fr ? 'Passés' : 'Past'} active={when === 'past'} onPress={() => setWhen('past')} />
        <View style={{ width: 8 }} />
        <Pill label={fr ? 'Tout' : 'All'} active={kind === 'all'} onPress={() => setKind('all')} />
        <Pill label={fr ? 'Assemblées' : 'Meetings'} active={kind === 'meetings'} onPress={() => setKind('meetings')} />
        <Pill label={fr ? 'Dividendes' : 'Dividends'} active={kind === 'dividends'} onPress={() => setKind('dividends')} />
        <Pill label={fr ? '☆ Mes titres' : '☆ My stocks'} active={mine} onPress={() => setMine((v) => !v)} />
      </Row>

      {q.isLoading ? <Loading /> : q.error ? <ErrorBox message={fr ? 'Calendrier indisponible.' : 'Calendar unavailable.'} onRetry={() => q.refetch()} /> : !groups.length ? (
        <Card><Txt muted>{when === 'upcoming'
          ? (fr ? 'Aucun événement à venir publié pour ces critères. Les assemblées générales de la BRVM se tiennent surtout d’avril à juillet ; consultez aussi « Passés ».' : 'No upcoming event published for these filters. BRVM general meetings are mostly held from April to July; see also “Past”.')
          : (fr ? 'Aucun événement pour ces critères.' : 'No event for these filters.')}</Txt></Card>
      ) : groups.map(([ym, items]) => {
        const [y, mo] = ym.split('-');
        return (
          <Card key={ym} title={`${(fr ? MONTHS_FR : MONTHS_EN)[Number(mo) - 1]} ${y}`} collapsible badge={items.length}>
            {items.map((e) => {
              const d = e.details ?? {};
              const isDiv = e.kind === 'dividend';
              return (
                <Pressable key={e.id} onPress={() => e.asset_id && router.push(`/asset/${encodeURIComponent(e.asset_id)}`)}
                  style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: th.grid, opacity: d.cancelled ? 0.55 : 1 }}>
                  <View style={{ width: 46, alignItems: 'center', paddingVertical: 4, borderRadius: radius.sm, backgroundColor: isDiv ? th.up + '22' : th.accent + '22' }}>
                    <Txt weight="800">{e.event_date.slice(8, 10)}</Txt>
                    <Txt size="xs" muted>{(fr ? MONTHS_FR : MONTHS_EN)[Number(e.event_date.slice(5, 7)) - 1]!.slice(0, 4)}</Txt>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt weight="700">{e.assets?.ticker ?? '—'} <Txt size="xs" muted>{e.assets?.name ?? d.issuer ?? ''}</Txt></Txt>
                    <Txt size="sm" color={isDiv ? th.up : th.text}>{isDiv ? '💰 ' : '🏛 '}{(fr ? e.title_fr : e.title_en) ?? e.kind}</Txt>
                    {!isDiv && (d.time || d.venue) ? <Txt size="xs" muted numberOfLines={2}>{d.time ? `${d.time} · ` : ''}{d.venue ?? ''}</Txt> : null}
                  </View>
                </Pressable>
              );
            })}
          </Card>
        );
      })}
      <Txt size="xs" muted>{fr ? 'Source : Bulletin Officiel de la Cote de la BRVM. ' : 'Source: BRVM official bulletin. '}{fr ? 'Les dates de paiement de dividende sont celles du dernier dividende publié. NGX et BVMAC : calendrier non encore disponible.' : 'Dividend dates are those of the last published dividend. NGX and BVMAC: calendar not yet available.'}</Txt>
      {(q.data ?? []).find((e) => e.source_url) ? <Pressable onPress={() => Linking.openURL((q.data ?? []).find((e) => e.source_url)!.source_url!)}><Txt size="xs" color={th.accent}>{fr ? 'Voir le bulletin source ↗' : 'Open source bulletin ↗'}</Txt></Pressable> : null}
      <Txt size="xs" muted>{fr ? `Mis à jour : ${fmtDate(today, lang)}` : `Updated: ${fmtDate(today, lang)}`}</Txt>
    </Screen>
  );
}

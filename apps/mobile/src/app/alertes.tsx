import { marketLabel } from '@chart-boursafrikia/core';
// Alerts: notification history (in-app), my alerts (per stock and global), create an alert on one or several stocks.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { AlertForm, AlertList } from '../components/Alerts';
import { Button, Card, Loading, Pill, Row, Screen, Txt } from '../components/ui';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { fmtDate } from '../lib/format';
import { radius, space, useTheme } from '../theme';

export default function AlertsScreen() {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const user = useQuery({ queryKey: ['user'], queryFn: async () => (supabase ? (await supabase.auth.getUser()).data.user : null) });
  const events = useQuery({ queryKey: ['alert-events'], queryFn: () => api.alertEvents(100), enabled: !!user.data });
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: api.alerts, enabled: !!user.data });
  const all = useQuery({ queryKey: ['search', '', undefined], queryFn: () => api.search('') });
  const wl = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist, enabled: !!user.data });
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const unread = (events.data ?? []).filter((e) => !e.read_at).length;

  // Opening the screen marks notifications as read (after a short delay so the user sees which ones were new).
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(() => api.markAlertEventsRead().then(() => qc.invalidateQueries({ queryKey: ['alert-events'] })), 4000);
    return () => clearTimeout(t);
  }, [unread, qc]);

  if (user.isFetched && !user.data) return (
    <Screen edges={[]}><Stack.Screen options={{ title: fr ? 'Mes alertes' : 'My alerts' }} />
      <Card><Txt weight="700">{fr ? 'Connectez-vous pour créer et recevoir des alertes.' : 'Sign in to create and receive alerts.'}</Txt><Button label={fr ? 'Se connecter' : 'Sign in'} onPress={() => router.push('/auth')} /></Card>
    </Screen>
  );

  const byId = new Map((all.data ?? []).map((a) => [a.id, a]));
  const results = query.trim().length >= 2 ? (all.data ?? []).filter((a) => !picked.includes(a.id) && `${a.ticker} ${a.name}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : [];
  const targets = picked.map((id) => byId.get(id)).filter(Boolean).map((a) => ({ id: a!.id, ticker: a!.ticker, last: a!.last, currency: a!.currency }));

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: fr ? 'Mes alertes' : 'My alerts' }} />
      <Card title={fr ? `Notifications${unread ? ` (${unread} nouvelle${unread > 1 ? 's' : ''})` : ''}` : `Notifications${unread ? ` (${unread} new)` : ''}`}>
        {events.isLoading ? <Loading /> : !(events.data ?? []).length ? <Txt size="sm" muted>{fr ? 'Aucune alerte déclenchée pour l’instant. Les alertes sont vérifiées après chaque séance.' : 'No alert fired yet.'}</Txt>
          : (events.data ?? []).slice(0, 50).map((e) => (
            <Pressable key={e.id} onPress={() => e.asset_id && router.push(`/asset/${encodeURIComponent(e.asset_id)}`)}
              style={{ paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: th.grid, flexDirection: 'row', gap: space.sm }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: e.read_at ? 'transparent' : th.accent }} />
              <View style={{ flex: 1 }}>
                <Txt weight={e.read_at ? '600' : '800'}>{e.title}</Txt>
                <Txt size="xs" muted>{e.body}</Txt>
                <Txt size="xs" muted>{fmtDate(e.created_at, lang)}</Txt>
              </View>
            </Pressable>
          ))}
      </Card>

      <Card title={fr ? `Mes alertes (${alerts.data?.length ?? 0})` : `My alerts (${alerts.data?.length ?? 0})`}>
        {alerts.isLoading ? <Loading /> : <AlertList alerts={alerts.data ?? []} />}
        <Txt size="xs" muted>{fr ? 'Notifications dans l’application (🔔) et sur l’application mobile. Vérification après chaque séance, une notification par titre et par séance.' : 'In-app (🔔) and mobile push notifications, checked after each session.'}</Txt>
      </Card>

      <Card title={fr ? 'Nouvelle alerte sur un ou plusieurs titres' : 'New alert on one or several stocks'}>
        <TextInput value={query} onChangeText={setQuery} placeholder={fr ? 'Ajouter un titre (ex. SONATEL, MTNN)…' : 'Add a stock…'} placeholderTextColor={th.textMuted} autoCapitalize="characters"
          style={{ backgroundColor: th.bg, color: th.text, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: th.border }} accessibilityLabel={fr ? 'Ajouter un titre à l’alerte' : 'Add a stock to the alert'} />
        {results.map((a) => (
          <Pressable key={a.id} onPress={() => { setPicked((p) => [...p, a.id]); setQuery(''); }} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: th.grid }}>
            <Txt weight="700">+ {a.ticker} <Txt size="xs" muted>{marketLabel(a.market)} · {a.name}</Txt></Txt>
          </Pressable>
        ))}
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {picked.map((id) => <Pill key={id} label={`${byId.get(id)?.ticker ?? id} ✕`} active onPress={() => setPicked((p) => p.filter((x) => x !== id))} />)}
          {wl.data?.length ? <Pill label={fr ? `+ Mes ${wl.data.length} titres suivis` : `+ My ${wl.data.length} watched`} onPress={() => setPicked((p) => [...new Set([...p, ...(wl.data ?? [])])])} /> : null}
        </Row>
        {targets.length ? <AlertForm key={targets.map((t) => t.id).join(',')} assets={targets} onDone={() => setPicked([])} /> : <Txt size="xs" muted>{fr ? 'Choisissez un ou plusieurs titres pour définir l’alerte.' : 'Pick one or several stocks.'}</Txt>}
      </Card>
    </Screen>
  );
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { ENTITLEMENTS } from '@chart-boursafrikia/core';
import { useT } from '../i18n';
import { api, type AlertKind, type AlertRow } from '../lib/api';
import { fmtDate, fmtNum } from '../lib/format';
import { useSettings } from '../settings';
import { radius, space, useTheme } from '../theme';
import { Button, Card, Pill, Row, Txt } from './ui';

export const KIND_LABEL: Record<AlertKind, { fr: string; en: string; unit: 'price' | 'pct' | null }> = {
  price_above: { fr: 'Cours au-dessus de', en: 'Price above', unit: 'price' },
  price_below: { fr: 'Cours en dessous de', en: 'Price below', unit: 'price' },
  change_pct: { fr: 'Variation de la séance ≥', en: 'Daily change ≥', unit: 'pct' },
  near_support: { fr: 'Proche d’un support (écart ≤)', en: 'Near a support (gap ≤)', unit: 'pct' },
  near_resistance: { fr: 'Proche d’une résistance (écart ≤)', en: 'Near a resistance (gap ≤)', unit: 'pct' },
  events: { fr: 'Événements (AG, dividende) dans les 7 jours', en: 'Events (AGM, dividend) within 7 days', unit: null },
};

export function describeAlert(a: Pick<AlertRow, 'kind' | 'threshold' | 'direction' | 'assets'>, fr: boolean) {
  const k = KIND_LABEL[a.kind];
  const lbl = fr ? k.fr : k.en;
  if (k.unit === null) return lbl;
  if (a.kind === 'change_pct') return `${lbl} ${a.direction === 'both' ? '±' : a.direction === 'up' ? '+' : '−'}${fmtNum(a.threshold ?? 0, fr ? 'fr' : 'en', 2)} %`;
  if (k.unit === 'pct') return `${lbl} ${fmtNum(a.threshold ?? 0, fr ? 'fr' : 'en', 2)} %`;
  const cur = a.assets?.currency === 'XOF' || a.assets?.currency === 'XAF' ? 'FCFA' : a.assets?.currency ?? '';
  return `${lbl} ${fmtNum(a.threshold ?? 0, fr ? 'fr' : 'en', (a.threshold ?? 0) < 100 ? 2 : 0)} ${cur}`;
}

const errText = (code: string | undefined, fr: boolean) => code === 'ALERT_LIMIT'
  ? (fr ? `Limite de ${ENTITLEMENTS.free.alerts} alertes atteinte sur l’offre gratuite (l’alerte globale compte pour une). Passez à Premium pour des alertes illimitées.` : `Free plan limited to ${ENTITLEMENTS.free.alerts} alerts.`)
  : code === 'AUTH_REQUIRED' ? (fr ? 'Connectez-vous pour créer des alertes.' : 'Sign in to create alerts.') : (fr ? 'Création impossible.' : 'Could not create.');

/** Create an alert on one or several assets. `assets` = preselected targets (asset sheet) or picked from search. */
export function AlertForm({ assets, onDone }: { assets: { id: string; ticker: string; last: number | null; currency: string }[]; onDone?: () => void }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const single = assets.length === 1 ? assets[0]! : null;
  const [kind, setKind] = useState<AlertKind>('change_pct');
  const [dir, setDir] = useState<'up' | 'down' | 'both'>('both');
  const defaults: Record<AlertKind, string> = {
    price_above: single?.last ? String(Math.round(single.last * 1.05 * 100) / 100) : '', price_below: single?.last ? String(Math.round(single.last * 0.95 * 100) / 100) : '',
    change_pct: '5', near_support: '2', near_resistance: '2', events: '',
  };
  const [value, setValue] = useState(defaults.change_pct);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const kinds: AlertKind[] = single ? ['change_pct', 'price_above', 'price_below', 'near_support', 'near_resistance', 'events'] : ['change_pct', 'near_support', 'near_resistance', 'events'];
  const unit = KIND_LABEL[kind].unit;

  async function create() {
    setMsg(null);
    const t = unit ? Number(value.replace(',', '.')) : null;
    if (unit && !(t! > 0)) { setMsg(fr ? 'Indiquez un seuil valide.' : 'Enter a valid threshold.'); return; }
    if (!assets.length) { setMsg(fr ? 'Choisissez au moins un titre.' : 'Pick at least one stock.'); return; }
    setBusy(true);
    try {
      await api.createAlerts(assets.map((a) => ({ asset_id: a.id, kind, threshold: t, direction: kind === 'change_pct' ? dir : 'both' })));
      await Promise.all(['alerts', 'alert-events'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      setMsg(fr ? `✓ Alerte créée${assets.length > 1 ? ` sur ${assets.length} titres` : ''}. Vérifiée après chaque séance ; vous serez notifié ici (🔔) et sur l’application mobile.` : '✓ Alert created.');
      onDone?.();
    } catch (e) { setMsg(errText((e as { code?: string }).code, fr)); } finally { setBusy(false); }
  }

  return (
    <View style={{ gap: space.sm }}>
      <Row style={{ flexWrap: 'wrap' }} gap={6}>
        {kinds.map((k) => <Pill key={k} label={(fr ? KIND_LABEL[k].fr : KIND_LABEL[k].en).replace(/ \(écart ≤\)| \(gap ≤\)| ≥$/, '')} active={kind === k} onPress={() => { setKind(k); setValue(defaults[k]); }} />)}
      </Row>
      {kind === 'change_pct' ? (
        <Row gap={6}>
          {(['both', 'up', 'down'] as const).map((d) => <Pill key={d} label={d === 'both' ? (fr ? 'Hausse ou baisse' : 'Up or down') : d === 'up' ? (fr ? 'Hausse' : 'Up') : (fr ? 'Baisse' : 'Down')} active={dir === d} onPress={() => setDir(d)} />)}
        </Row>
      ) : null}
      {unit ? (
        <Row gap={space.sm}>
          <Txt size="sm" style={{ flex: 1 }}>{fr ? KIND_LABEL[kind].fr : KIND_LABEL[kind].en}</Txt>
          <TextInput value={value} onChangeText={setValue} keyboardType="decimal-pad" accessibilityLabel={fr ? 'Seuil de l’alerte' : 'Alert threshold'}
            style={{ width: 110, backgroundColor: th.bg, color: th.text, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: th.border, textAlign: 'right' }} />
          <Txt size="sm" muted>{unit === 'pct' ? '%' : single?.currency === 'XOF' || single?.currency === 'XAF' ? 'FCFA' : single?.currency}</Txt>
        </Row>
      ) : <Txt size="xs" muted>{fr ? 'Prévenu quand une assemblée générale ou un paiement de dividende est prévu dans les 7 jours.' : 'Notified when an AGM or dividend payment is due within 7 days.'}</Txt>}
      <Button label={fr ? `🔔 Créer l’alerte${assets.length > 1 ? ` (${assets.length} titres)` : ''}` : `🔔 Create alert${assets.length > 1 ? ` (${assets.length})` : ''}`} loading={busy} onPress={create} />
      {msg ? <Txt size="xs" color={msg.startsWith('✓') ? th.up : th.warn}>{msg}</Txt> : null}
    </View>
  );
}

/** List of alerts with on/off and delete. */
export function AlertList({ alerts }: { alerts: AlertRow[] }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['alerts'] });
  if (!alerts.length) return <Txt size="sm" muted>{fr ? 'Aucune alerte.' : 'No alert.'}</Txt>;
  return (
    <View>
      {alerts.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: th.grid, opacity: a.active ? 1 : 0.5 }}>
          <Pressable style={{ flex: 1 }} onPress={() => a.asset_id && router.push(`/asset/${encodeURIComponent(a.asset_id)}`)}>
            <Txt weight="700">{a.scope === 'watchlist' ? (fr ? '🌐 Tous mes titres suivis' : '🌐 All my watched stocks') : a.assets?.ticker ?? a.asset_id}</Txt>
            <Txt size="xs" muted>{describeAlert(a, fr)}{a.last_triggered_at ? ` · ${fr ? 'dernier déclenchement' : 'last fired'} ${fmtDate(a.last_triggered_at, lang)}` : ''}</Txt>
          </Pressable>
          <Pill label={a.active ? (fr ? 'Active' : 'On') : (fr ? 'En pause' : 'Paused')} active={a.active}
            onPress={() => api.setAlertActive(a.id, !a.active).then(refresh).catch((e) => setErr(errText((e as { code?: string }).code, fr)))} />
          <Pressable accessibilityRole="button" accessibilityLabel={fr ? 'Supprimer l’alerte' : 'Delete alert'} hitSlop={8} onPress={() => api.deleteAlerts([a.id]).then(refresh)}>
            <Txt color={th.down}>✕</Txt>
          </Pressable>
        </View>
      ))}
      {err ? <Txt size="xs" color={th.warn}>{err}</Txt> : null}
    </View>
  );
}

/** One-click global alert on every stock of the watchlist (current and future). */
export function GlobalAlertCard({ count }: { count: number }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const { plan } = useSettings();
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: api.alerts });
  const global = (alerts.data ?? []).filter((a) => a.scope === 'watchlist');
  const [change, setChange] = useState(true);
  const [levels, setLevels] = useState(true);
  const [events, setEvents] = useState(true);
  const [pctV, setPctV] = useState('5');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function activate() {
    setMsg(null); setBusy(true);
    const p = Number(pctV.replace(',', '.')) || 5;
    const rows = [
      ...(change ? [{ asset_id: null, kind: 'change_pct' as const, threshold: p, direction: 'both' as const, scope: 'watchlist' as const }] : []),
      ...(levels ? [{ asset_id: null, kind: 'near_support' as const, threshold: 2, scope: 'watchlist' as const }, { asset_id: null, kind: 'near_resistance' as const, threshold: 2, scope: 'watchlist' as const }] : []),
      ...(events ? [{ asset_id: null, kind: 'events' as const, threshold: null, scope: 'watchlist' as const }] : []),
    ];
    try {
      await api.createAlerts(rows);
      await Promise.all(['alerts', 'alert-events'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      setMsg(fr ? `✓ Alerte globale activée sur vos ${count} titres (et ceux que vous ajouterez).` : '✓ Global alert enabled.');
    } catch (e) { setMsg(errText((e as { code?: string }).code, fr)); } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true);
    try { await api.deleteAlerts(global.map((a) => a.id)); await qc.invalidateQueries({ queryKey: ['alerts'] }); setMsg(fr ? 'Alerte globale désactivée.' : 'Global alert disabled.'); } finally { setBusy(false); }
  }
  const Check = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => set(!on)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 }}>
      <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: th.accent, backgroundColor: on ? th.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on ? <Txt size="xs" weight="900" color={th.accentText}>✓</Txt> : null}</View>
      <Txt size="sm" style={{ flex: 1 }}>{label}</Txt>
    </Pressable>
  );

  return (
    <Card title={fr ? '🔔 Alerte globale' : '🔔 Global alert'} collapsible defaultOpen={!global.length} badge={global.length ? (fr ? 'active' : 'on') : null}>
      {global.length ? (
        <>
          <Txt size="sm">{fr ? `Active sur vos ${count} titres suivis (et ceux que vous ajouterez) :` : `On for your ${count} watched stocks:`}</Txt>
          {global.map((a) => <Txt key={a.id} size="sm" muted>• {describeAlert(a, fr)}</Txt>)}
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Button label={fr ? 'Gérer mes alertes' : 'Manage alerts'} variant="secondary" onPress={() => router.push('/alertes')} /></View>
            <View style={{ flex: 1 }}><Button label={fr ? 'Désactiver' : 'Disable'} variant="ghost" loading={busy} onPress={disable} /></View>
          </Row>
        </>
      ) : (
        <>
          <Txt size="sm" muted>{fr ? `Un clic pour surveiller les ${count} titres de votre liste, y compris ceux que vous ajouterez. Vérifié après chaque séance.` : `One click to watch all ${count} stocks of your list.`}</Txt>
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><Check on={change} set={setChange} label={fr ? 'Variation de la séance ≥ ±' : 'Daily change ≥ ±'} /></View>
            <TextInput value={pctV} onChangeText={setPctV} keyboardType="decimal-pad" accessibilityLabel={fr ? 'Seuil de variation' : 'Change threshold'}
              style={{ width: 60, backgroundColor: th.bg, color: th.text, borderRadius: radius.sm, padding: 6, borderWidth: 1, borderColor: th.border, textAlign: 'right' }} />
            <Txt size="sm" muted>%</Txt>
          </Row>
          <Check on={levels} set={setLevels} label={fr ? 'Proche d’un support ou d’une résistance (écart ≤ 2 %)' : 'Near a support or resistance (≤ 2%)'} />
          <Check on={events} set={setEvents} label={fr ? 'Assemblée générale ou dividende dans les 7 jours' : 'AGM or dividend within 7 days'} />
          <Button label={fr ? `🔔 Activer l’alerte globale (${count} titres)` : `🔔 Enable global alert (${count})`} loading={busy} disabled={!change && !levels && !events} onPress={activate} />
          {plan === 'free' ? <Txt size="xs" muted>{fr ? 'Offre gratuite : l’alerte globale compte pour une seule alerte.' : 'Free plan: the global alert counts as one alert.'}</Txt> : null}
        </>
      )}
      {msg ? <Txt size="xs" color={msg.startsWith('✓') ? th.up : th.warn}>{msg}</Txt> : null}
    </Card>
  );
}

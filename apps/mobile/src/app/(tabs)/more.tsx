import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Platform, TextInput } from 'react-native';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { APP_NAME } from '@chart-boursafrikia/core';
import { Card, Pill, Row, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { SNAPSHOT } from '../../lib/snapshot';
import { DEMO_MODE, supabase } from '../../lib/supabase';
import { useSettings } from '../../settings';
import { space, useTheme } from '../../theme';

function Item({ label, onPress, badge }: { label: string; onPress: () => void; badge?: string }) {
  const th = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingVertical: space.md, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: th.grid }}>
      <Txt>{label}</Txt>
      <Txt muted>{badge ?? '›'}</Txt>
    </Pressable>
  );
}

export default function More() {
  const th = useTheme();
  const { t, lang } = useT();
  const s = useSettings();
  const soon = lang === 'fr' ? 'bientôt' : 'soon';
  const qc = useQueryClient();
  const user = useQuery({ queryKey: ['user'], queryFn: async () => (supabase ? (await supabase.auth.getUser()).data.user : null) });
  const isAdmin = useQuery({
    queryKey: ['is-admin', user.data?.id], enabled: !!user.data,
    queryFn: async () => (supabase && user.data ? ((await supabase.rpc('is_admin', { uid: user.data.id })).data === true) : false),
  });
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const changePassword = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwMsg(error ? (lang === 'fr' ? `Échec : ${error.message}` : `Failed: ${error.message}`) : (lang === 'fr' ? 'Mot de passe modifié.' : 'Password changed.'));
    if (!error) setNewPw('');
  };
  const signOut = async () => { await supabase?.auth.signOut(); s.setPlan('free'); qc.invalidateQueries(); };
  const deleteAccount = async () => {
    const go = async () => { await supabase?.functions.invoke('delete-account', { body: {} }); await signOut(); };
    const msg = lang === 'fr' ? 'Supprimer définitivement votre compte et vos données ? Les abonnements en cours doivent être résiliés dans votre compte Apple/Google.' : 'Permanently delete your account and data? Active subscriptions must be cancelled in your Apple/Google account.';
    if (Platform.OS === 'web') { if (globalThis.confirm?.(msg)) await go(); }
    else Alert.alert('', msg, [{ text: t.common.cancel, style: 'cancel' }, { text: 'OK', style: 'destructive', onPress: go }]);
  };
  return (
    <Screen>
      <Txt size="xl" weight="800">{t.tabs.more}</Txt>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt weight="700">{s.plan === 'premium' ? `${APP_NAME} Premium ✦` : t.common.free}</Txt>
          {s.plan === 'free' ? <Pill label={t.premium.trial} bg={th.accent} color={th.accentText} onPress={() => router.push('/premium')} /> : null}
        </Row>
        {DEMO_MODE ? (
          <>
            <Txt size="xs" muted>{SNAPSHOT
              ? (lang === 'fr' ? 'Instantané de données réelles : connexion, IA et abonnements désactivés tant que le serveur n’est pas déployé.' : 'Real-data snapshot: sign-in, AI and subscriptions disabled until the server is deployed.')
              : (lang === 'fr' ? 'Mode démo : connexion et abonnements désactivés.' : 'Demo mode: sign-in and subscriptions disabled.')}</Txt>
            {SNAPSHOT && SNAPSHOT.kind !== 'db' ? null : <Pill label={lang === 'fr' ? 'Aperçu Premium (démo)' : 'Premium preview (demo)'} active={s.plan === 'premium'} onPress={() => s.setPlan(s.plan === 'premium' ? 'free' : 'premium')} />}
          </>
        ) : null}
      </Card>
      {!DEMO_MODE ? (
        <Card title={t.more.account}>
          {user.data ? (
            <>
              <Txt size="sm" muted>{user.data.email}{isAdmin.data ? (lang === 'fr' ? ' · Super administrateur' : ' · Super admin') : ''}</Txt>
              <TextInput value={newPw} onChangeText={setNewPw} secureTextEntry autoComplete="new-password" placeholder={lang === 'fr' ? 'Nouveau mot de passe (10 caractères min.)' : 'New password (min. 10 characters)'} placeholderTextColor={th.textMuted}
                accessibilityLabel={lang === 'fr' ? 'Nouveau mot de passe' : 'New password'}
                style={{ backgroundColor: th.cardAlt, color: th.text, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: th.border }} />
              <Item label={lang === 'fr' ? 'Changer mon mot de passe' : 'Change my password'} onPress={() => (newPw.length >= 10 ? changePassword() : setPwMsg(lang === 'fr' ? '10 caractères minimum.' : 'At least 10 characters.'))} />
              {pwMsg ? <Txt size="xs" muted>{pwMsg}</Txt> : null}
              <Item label={t.more.signOut} onPress={signOut} />
              <Item label={lang === 'fr' ? 'Supprimer mon compte' : 'Delete my account'} onPress={deleteAccount} />
            </>
          ) : <Item label={t.more.signIn} onPress={() => router.push('/auth')} />}
        </Card>
      ) : null}
      <Card title={t.more.settings}>
        <Txt size="sm" muted>{t.more.language}</Txt>
        <Row><Pill label="Français" active={s.lang === 'fr'} onPress={() => s.setLang('fr')} /><Pill label="English" active={s.lang === 'en'} onPress={() => s.setLang('en')} /></Row>
        <Txt size="sm" muted>{t.more.theme}</Txt>
        <Row>{(['system', 'dark', 'light'] as const).map((m) => <Pill key={m} label={t.more.themes[m]} active={s.themePref === m} onPress={() => s.setThemePref(m)} />)}</Row>
        <Txt size="sm" muted>{t.more.currency}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>{(['local', 'EUR', 'XOF', 'USD'] as const).map((c) => <Pill key={c} label={c === 'local' ? t.more.local : c} active={s.displayCurrency === c} onPress={() => s.setDisplayCurrency(c)} />)}</Row>
        <Txt size="xs" muted>{lang === 'fr' ? 'XOF/XAF ↔ EUR : parité fixe 1 EUR = 655,957 FCFA. Autres devises : taux du jour (source indiquée).' : 'XOF/XAF ↔ EUR: fixed parity 1 EUR = 655.957 FCFA. Other currencies: daily rates (source shown).'}</Txt>
      </Card>
      <Card>
        <Item label={t.more.portfolio} badge={soon} onPress={() => {}} />
        <Item label={t.more.calendar} badge={soon} onPress={() => {}} />
        <Item label={t.more.ipo} badge={soon} onPress={() => {}} />
        <Item label={t.more.trackRecord} onPress={() => router.push('/track-record')} />
        <Item label={t.more.sources} onPress={() => router.push('/legal/sources')} />
        <Item label={t.more.legal} onPress={() => router.push('/legal/disclaimer')} />
        <Item label={t.more.privacy} onPress={() => router.push('/legal/privacy')} />
        <Item label={t.more.terms} onPress={() => router.push('/legal/terms')} />
      </Card>
      <Txt size="xs" muted style={{ textAlign: 'center' }}>{APP_NAME} 0.1.0</Txt>
    </Screen>
  );
}

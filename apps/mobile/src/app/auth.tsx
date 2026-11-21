import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';
import { Button, Card, Pill, Row, Screen, Txt } from '../components/ui';
import { api } from '../lib/api';
import { useT } from '../i18n';
import { supabase } from '../lib/supabase';
import { radius, space, useTheme } from '../theme';

/** Sign-in by password, or passwordless with a 6-digit code sent by email. */
export default function Auth() {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = { backgroundColor: th.card, color: th.text, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: th.border, fontSize: 16 } as const;

  async function sendCode() {
    if (!supabase) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, data: { language: lang } } });
    setBusy(false);
    if (error) setErr(error.message); else setStep('code');
  }
  // First sign-in (or profile never filled in): go through the investor profile questionnaire.
  async function afterSignIn() {
    const p = await api.investorProfile().catch(() => null);
    // Direct visit to /auth (link, bookmark, new tab): nothing to go back to → home.
    if (p) { if (router.canGoBack()) router.back(); else router.replace('/'); } else router.replace({ pathname: '/profil', params: { first: '1' } });
  }

  async function signInPassword() {
    if (!supabase) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(fr ? 'E-mail ou mot de passe incorrect.' : 'Wrong email or password.'); else await afterSignIn();
  }
  async function verify() {
    if (!supabase) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setErr(error.message); else await afterSignIn();
  }

  return (
    <Screen edges={['bottom']}>
      <Txt size="xl" weight="800">{fr ? 'Connexion' : 'Sign in'}</Txt>
      {supabase ? (
        <Row>
          <Pill label={fr ? 'Mot de passe' : 'Password'} active={mode === 'password'} onPress={() => setMode('password')} />
          <Pill label={fr ? 'Code par e-mail' : 'Email code'} active={mode === 'code'} onPress={() => setMode('code')} />
        </Row>
      ) : null}
      {!supabase ? <Card><Txt muted>{fr ? 'Indisponible en mode démo.' : 'Unavailable in demo mode.'}</Txt></Card> : mode === 'password' ? (
        <>
          <TextInput style={input} value={email} onChangeText={setEmail} placeholder="email@exemple.com" placeholderTextColor={th.textMuted} keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Email" />
          <TextInput style={input} value={password} onChangeText={setPassword} placeholder={fr ? 'Mot de passe' : 'Password'} placeholderTextColor={th.textMuted} secureTextEntry autoCapitalize="none" autoComplete="current-password" accessibilityLabel={fr ? 'Mot de passe' : 'Password'} onSubmitEditing={signInPassword} />
          <Button label={fr ? 'Se connecter' : 'Sign in'} loading={busy} disabled={!email.includes('@') || password.length < 6} onPress={signInPassword} />
        </>
      ) : step === 'email' ? (
        <>
          <TextInput style={input} value={email} onChangeText={setEmail} placeholder="email@exemple.com" placeholderTextColor={th.textMuted} keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Email" />
          <Button label={fr ? 'Recevoir un code' : 'Get a code'} loading={busy} disabled={!email.includes('@')} onPress={sendCode} />
        </>
      ) : (
        <>
          <Txt size="sm" muted>{fr ? `Code envoyé à ${email}` : `Code sent to ${email}`}</Txt>
          <TextInput style={input} value={code} onChangeText={setCode} placeholder="123456" placeholderTextColor={th.textMuted} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" accessibilityLabel="Code" />
          <Button label={fr ? 'Valider' : 'Verify'} loading={busy} disabled={code.length < 6} onPress={verify} />
        </>
      )}
      {err ? <Txt size="sm" color={th.down}>{err}</Txt> : null}
    </Screen>
  );
}

import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';
import { Button, Card, Screen, Txt } from '../components/ui';
import { useT } from '../i18n';
import { supabase } from '../lib/supabase';
import { radius, space, useTheme } from '../theme';

/** Passwordless sign-in: 6-digit code by email (works on weak networks, no password to forget). */
export default function Auth() {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
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
  async function verify() {
    if (!supabase) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setErr(error.message); else router.back();
  }

  return (
    <Screen edges={['bottom']}>
      <Txt size="xl" weight="800">{fr ? 'Connexion' : 'Sign in'}</Txt>
      {!supabase ? <Card><Txt muted>{fr ? 'Indisponible en mode démo.' : 'Unavailable in demo mode.'}</Txt></Card> : step === 'email' ? (
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

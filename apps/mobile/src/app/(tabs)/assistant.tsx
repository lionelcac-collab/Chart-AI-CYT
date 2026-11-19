import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Rich } from '../../components/Rich';
import { Button, Card, Disclaimer, Pill, Row, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useSettings } from '../../settings';
import { radius, space, useTheme } from '../../theme';

type Msg = { role: 'user' | 'assistant'; content: string; auth?: boolean };


export default function Assistant() {
  const th = useTheme();
  const { t, lang } = useT();
  const { plan } = useSettings();
  const params = useLocalSearchParams<{ q?: string }>();
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const user = useQuery({ queryKey: ['user'], queryFn: async () => (supabase ? (await supabase.auth.getUser()).data.user : null) });
  const signedOut = user.isFetched && !user.data;

  useEffect(() => { if (params.q) setInput(lang === 'fr' ? `Que penser de ${params.q} ?` : `What about ${params.q}?`); }, [params.q, lang]);

  const errText = (e: unknown) => {
    const code = (e as ApiError).code;
    if (code === 'NO_AI_YET') return lang === 'fr' ? 'Assistant disponible une fois le serveur et la clé Claude configurés.' : 'Assistant available once the server and the Claude key are configured.';
    if (code === 'DEMO_NO_AI') return lang === 'fr' ? 'Assistant indisponible en mode démo (backend non configuré).' : 'Assistant unavailable in demo mode (no backend).';
    if (code === 'QUOTA_EXCEEDED') return lang === 'fr' ? 'Limite quotidienne atteinte. Passez à Premium pour continuer.' : 'Daily limit reached. Upgrade to Premium to continue.';
    if (code === 'PREMIUM_REQUIRED') return t.assistant.chartPremium;
    if (code === 'AUTH_REQUIRED') return lang === 'fr' ? 'Connectez-vous (gratuit) pour utiliser l’assistant IA.' : 'Sign in (free) to use the AI assistant.';
    if (code === 'NETWORK') return lang === 'fr' ? 'Connexion au serveur impossible. Vérifiez votre réseau et réessayez.' : 'Could not reach the server. Check your connection and retry.';
    return t.common.error;
  };

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (signedOut) { router.push('/auth'); return; }
    const next: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const reply = await api.chat(next, lang);
      setMsgs([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: `⚠ ${errText(e)}`, auth: (e as ApiError).code === 'AUTH_REQUIRED' }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  async function analyzeChart() {
    if (plan !== 'premium') { router.push('/premium'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
    if (res.canceled || !res.assets[0]?.base64) return;
    const img = res.assets[0];
    setMsgs((m) => [...m, { role: 'user', content: '🖼 ' + t.assistant.chart }]);
    setBusy(true);
    try {
      const r = await api.chartVision(img.base64!, img.mimeType ?? 'image/jpeg', lang);
      const c = r.content as { readable: boolean; trend: string; patterns: string[]; levels: { kind: string; price: number | null }[]; scenarios: { name: string; description: string }[]; caveats: string[] };
      const txt = !c.readable ? (lang === 'fr' ? 'Graphique illisible ou non financier.' : 'Chart unreadable or not financial.') : [
        `Tendance : ${c.trend}`, c.patterns.length ? `Figures : ${c.patterns.join(', ')}` : '',
        c.levels.length ? `Niveaux : ${c.levels.map((l) => `${l.kind} ${l.price ?? '?'}`).join(' · ')}` : '',
        ...c.scenarios.map((s) => `• ${s.name} — ${s.description}`), ...c.caveats.map((x) => `⚠ ${x}`),
      ].filter(Boolean).join('\n');
      setMsgs((m) => [...m, { role: 'assistant', content: txt }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `⚠ ${errText(e)}` }]);
    } finally { setBusy(false); }
  }

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
          <Txt size="xl" weight="800">{t.assistant.title}</Txt>
          <Card style={{ borderColor: th.accent, borderWidth: 2 }}>
            <Txt weight="800" color={th.accent}>✦ {lang === 'fr' ? 'Analyse IA avancée des bourses africaines' : 'Advanced AI analysis of African stock markets'}</Txt>
            <Txt size="sm" muted>{t.assistant.intro}</Txt>
            {!msgs.length ? (
              <View style={{ gap: space.sm }}>
                <Txt size="sm" weight="700">{lang === 'fr' ? 'Exemples de questions :' : 'Example questions:'}</Txt>
                <Row style={{ flexWrap: 'wrap' }}>
                  {(lang === 'fr'
                    ? ['Quels titres de la BRVM sont proches d’un support ?', 'Analyse SONATEL : tendance et niveaux clés', 'Quels secteurs ont le plus monté ce mois-ci ?', 'Compare Dangote Cement et BUA Cement']
                    : ['Which BRVM stocks are near a support?', 'Analyse SONATEL: trend and key levels', 'Which sectors rose most this month?', 'Compare Dangote Cement and BUA Cement']
                  ).map((q) => <Pill key={q} label={q} onPress={() => setInput(q)} />)}
                </Row>
              </View>
            ) : null}
          </Card>
          {signedOut ? (
            <Card>
              <Txt weight="700">{lang === 'fr' ? 'Connectez-vous pour discuter avec l’IA' : 'Sign in to chat with the AI'}</Txt>
              <Txt size="sm" muted>{lang === 'fr' ? 'Le compte est gratuit et donne droit à 3 analyses IA par jour.' : 'The account is free and includes 3 AI analyses per day.'}</Txt>
              <Button label={lang === 'fr' ? 'Se connecter / créer un compte' : 'Sign in / create an account'} onPress={() => router.push('/auth')} />
            </Card>
          ) : null}
          {msgs.map((m, i) => (
            <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: m.role === 'user' ? th.accent : th.card, borderRadius: radius.lg, padding: space.md, borderWidth: m.role === 'user' ? 0 : 1, borderColor: th.border }}>
              {m.role === 'user' ? <Txt size="sm" color={th.accentText}>{m.content}</Txt> : <Rich text={m.content} color={th.text} />}
              {m.auth ? <View style={{ marginTop: space.sm }}><Button label={lang === 'fr' ? 'Se connecter / créer un compte' : 'Sign in / create an account'} onPress={() => router.push('/auth')} /></View> : null}
            </View>
          ))}
          {busy ? <Txt size="sm" muted>✦ {lang === 'fr' ? 'L’IA analyse les données du marché… (10 à 30 secondes)' : 'The AI is analysing market data… (10 to 30 seconds)'}</Txt> : null}
          <Disclaimer />
        </ScrollView>
        <View style={{ padding: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: th.border, backgroundColor: th.bg }}>
          <Button label={(plan === 'premium' ? '' : '🔒 ') + t.assistant.chart} variant="ghost" onPress={analyzeChart} />
          <Row>
            <TextInput value={input} onChangeText={setInput} placeholder={t.assistant.placeholder} placeholderTextColor={th.textMuted} multiline onSubmitEditing={send}
              accessibilityLabel={t.assistant.placeholder}
              style={{ flex: 1, backgroundColor: th.card, color: th.text, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: th.border, maxHeight: 120 }} />
            <Button label="➤" onPress={send} disabled={!input.trim()} loading={busy} />
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

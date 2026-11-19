import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Disclaimer, Row, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { useSettings } from '../../settings';
import { radius, space, useTheme } from '../../theme';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function Assistant() {
  const th = useTheme();
  const { t, lang } = useT();
  const { plan } = useSettings();
  const params = useLocalSearchParams<{ q?: string }>();
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => { if (params.q) setInput(lang === 'fr' ? `Que penser de ${params.q} ?` : `What about ${params.q}?`); }, [params.q, lang]);

  const errText = (e: unknown) => {
    const code = (e as ApiError).code;
    if (code === 'NO_AI_YET') return lang === 'fr' ? 'Assistant disponible une fois le serveur et la clé Claude configurés.' : 'Assistant available once the server and the Claude key are configured.';
    if (code === 'DEMO_NO_AI') return lang === 'fr' ? 'Assistant indisponible en mode démo (backend non configuré).' : 'Assistant unavailable in demo mode (no backend).';
    if (code === 'QUOTA_EXCEEDED') return lang === 'fr' ? 'Limite quotidienne atteinte. Passez à Premium pour continuer.' : 'Daily limit reached. Upgrade to Premium to continue.';
    if (code === 'PREMIUM_REQUIRED') return t.assistant.chartPremium;
    return t.common.error;
  };

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const reply = await api.chat(next, lang);
      setMsgs([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: `⚠ ${errText(e)}` }]);
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
          <Card><Txt size="sm" muted>{t.assistant.intro}</Txt></Card>
          {msgs.map((m, i) => (
            <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: m.role === 'user' ? th.accent : th.card, borderRadius: radius.lg, padding: space.md, borderWidth: m.role === 'user' ? 0 : 1, borderColor: th.border }}>
              <Txt size="sm" color={m.role === 'user' ? th.accentText : th.text}>{m.content}</Txt>
            </View>
          ))}
          {busy ? <Txt size="sm" muted>{t.common.loading}</Txt> : null}
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

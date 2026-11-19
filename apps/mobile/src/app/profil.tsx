// Investor profile questionnaire (risk profile + knowledge). Shown after the first sign-in, editable from "Plus".
// The AI uses it to adapt its vocabulary and to flag signals that don't fit the profile — never as personal advice.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { KNOWLEDGE_LABEL, PROFILE_QUESTIONS, RISK_LABEL, scoreProfile, type KnowledgeLevel, type ProfileAnswers, type RiskProfile } from '@chart-boursafrikia/core';
import { Button, Card, Loading, Screen, Txt } from '../components/ui';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { radius, space, useTheme } from '../theme';

export default function InvestorProfileScreen() {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const existing = useQuery({ queryKey: ['investor-profile'], queryFn: api.investorProfile });
  const [answers, setAnswers] = useState<ProfileAnswers>({});
  const [saved, setSaved] = useState<{ risk: RiskProfile; knowledge: KnowledgeLevel } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (existing.data?.answers) setAnswers(existing.data.answers); }, [existing.data]);

  const sc = scoreProfile(answers);
  const answered = PROFILE_QUESTIONS.filter((q) => { const a = answers[q.id]; return Array.isArray(a) ? a.length > 0 : !!a; }).length;

  const pick = (qid: string, value: string, multi?: boolean) => setAnswers((prev) => {
    if (!multi) return { ...prev, [qid]: value };
    const cur = Array.isArray(prev[qid]) ? (prev[qid] as string[]) : [];
    if (value === 'none') return { ...prev, [qid]: cur.includes('none') ? [] : ['none'] };
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur.filter((v) => v !== 'none'), value];
    return { ...prev, [qid]: next };
  });

  async function save() {
    setErr(null);
    if (!sc.complete) { setErr(fr ? 'Répondez à toutes les questions.' : 'Please answer every question.'); return; }
    setBusy(true);
    try {
      await api.saveInvestorProfile(answers, sc.risk, sc.knowledge, sc.riskScore, sc.knowledgeScore);
      await qc.invalidateQueries({ queryKey: ['investor-profile'] });
      setSaved({ risk: sc.risk, knowledge: sc.knowledge });
    } catch (e) {
      setErr((e as { code?: string }).code === 'AUTH_REQUIRED' ? (fr ? 'Connectez-vous pour enregistrer votre profil.' : 'Sign in to save your profile.') : (fr ? 'Enregistrement impossible.' : 'Could not save.'));
    } finally { setBusy(false); }
  }

  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (existing.isLoading) return <Screen edges={[]}><Loading /></Screen>;

  if (saved) {
    const r = RISK_LABEL[saved.risk];
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: fr ? 'Profil investisseur' : 'Investor profile' }} />
        <Card style={{ borderColor: th.accent, borderWidth: 2 }}>
          <Txt size="xs" muted>{fr ? 'Votre profil' : 'Your profile'}</Txt>
          <Txt size="xl" weight="800">{fr ? r.fr : r.en} · {fr ? KNOWLEDGE_LABEL[saved.knowledge].fr : KNOWLEDGE_LABEL[saved.knowledge].en}</Txt>
          <Txt size="sm">{fr ? r.desc.fr : r.desc.en}</Txt>
          <Txt size="sm" muted>{fr
            ? 'L’assistant IA adaptera désormais son vocabulaire à votre niveau de connaissances et signalera les titres ou signaux peu compatibles avec votre profil de risque. Ses réponses restent informatives : elles ne constituent pas un conseil en investissement personnalisé.'
            : 'The AI assistant will now adapt its vocabulary to your knowledge level and flag stocks or signals that don’t fit your risk profile. Answers remain informative, not personalised investment advice.'}</Txt>
          <Button label={fr ? 'Continuer' : 'Continue'} onPress={done} />
          <Button label={fr ? 'Modifier mes réponses' : 'Edit my answers'} variant="ghost" onPress={() => setSaved(null)} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: fr ? 'Profil investisseur' : 'Investor profile' }} />
      <Card style={{ borderColor: th.accent, borderWidth: 1 }}>
        <Txt weight="800">🧭 {first ? (fr ? 'Bienvenue ! Faisons connaissance' : 'Welcome! Let’s get to know you') : (fr ? 'Votre profil investisseur' : 'Your investor profile')}</Txt>
        <Txt size="sm" muted>{fr
          ? '9 questions (2 minutes) pour évaluer votre profil de risque et vos connaissances. L’IA s’en sert pour adapter ses explications et vous signaler ce qui ne correspond pas à votre profil. Vos réponses restent privées.'
          : '9 questions (2 minutes) to assess your risk profile and knowledge. The AI uses them to adapt its explanations. Your answers stay private.'}</Txt>
        <View style={{ height: 6, backgroundColor: th.cardAlt, borderRadius: 3 }}>
          <View style={{ width: `${(answered / PROFILE_QUESTIONS.length) * 100}%`, height: 6, borderRadius: 3, backgroundColor: th.accent }} />
        </View>
        <Txt size="xs" muted>{answered} / {PROFILE_QUESTIONS.length}</Txt>
      </Card>

      {PROFILE_QUESTIONS.map((q, i) => {
        const a = answers[q.id];
        return (
          <Card key={q.id}>
            <Txt size="xs" muted>{i + 1}. {q.kind === 'risk' ? (fr ? 'Profil de risque' : 'Risk profile') : (fr ? 'Connaissances' : 'Knowledge')}</Txt>
            <Txt weight="700">{fr ? q.title.fr : q.title.en}</Txt>
            {q.help ? <Txt size="xs" muted>{fr ? q.help.fr : q.help.en}</Txt> : null}
            <View style={{ gap: 6 }}>
              {q.options.map((o) => {
                const on = Array.isArray(a) ? a.includes(o.value) : a === o.value;
                return (
                  <Pressable key={o.value} accessibilityRole={q.multi ? 'checkbox' : 'radio'} accessibilityState={{ checked: on }} onPress={() => pick(q.id, o.value, q.multi)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: on ? th.accent : th.border, backgroundColor: on ? th.cardAlt : 'transparent' }}>
                    <View style={{ width: 20, height: 20, borderRadius: q.multi ? 5 : 10, borderWidth: 2, borderColor: th.accent, backgroundColor: on ? th.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Txt size="xs" weight="900" color={th.accentText}>✓</Txt> : null}
                    </View>
                    <Txt size="sm" style={{ flex: 1 }}>{fr ? o.label.fr : o.label.en}</Txt>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        );
      })}

      {err ? <Txt size="sm" color={th.warn}>{err}</Txt> : null}
      <Button label={fr ? 'Voir mon profil et enregistrer' : 'See my profile and save'} loading={busy} disabled={!sc.complete} onPress={save} />
      {first ? <Button label={fr ? 'Plus tard' : 'Later'} variant="ghost" onPress={done} /> : null}
      <Txt size="xs" muted>{fr ? 'Ce questionnaire ne remplace pas l’évaluation d’un conseiller agréé.' : 'This questionnaire does not replace an assessment by a licensed adviser.'}</Txt>
    </Screen>
  );
}

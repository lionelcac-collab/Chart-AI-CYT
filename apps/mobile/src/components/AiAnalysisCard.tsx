import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { ENTITLEMENTS } from '@chart-boursafrikia/core';
import { useT } from '../i18n';
import { ApiError, api } from '../lib/api';
import { fmtNum } from '../lib/format';
import { useSettings } from '../settings';
import { space, useTheme } from '../theme';
import { Button, Card, Disclaimer, KV, Txt } from './ui';

export function AssetSectionsAnalysis({ assetId }: { assetId: string }) {
  const th = useTheme();
  const { t, lang, fmt } = useT();
  const { plan } = useSettings();
  const m = useMutation({ mutationFn: () => api.analyze(assetId, lang) });
  const err = m.error as ApiError | null;

  const errorText = !err ? null
    : err.code === 'QUOTA_EXCEEDED' ? (lang === 'fr' ? `Limite de ${ENTITLEMENTS.free.aiAnalysesPerDay} analyses IA par jour atteinte.` : `Daily limit of ${ENTITLEMENTS.free.aiAnalysesPerDay} AI analyses reached.`)
    : err.code === 'NO_AI_YET' ? (lang === 'fr' ? 'Analyse IA disponible une fois le serveur et la clé Claude configurés.' : 'AI analysis available once the server and the Claude key are configured.')
    : err.code === 'DEMO_NO_AI' ? (lang === 'fr' ? 'Analyse IA indisponible en mode démo (backend non configuré).' : 'AI analysis unavailable in demo mode (no backend).')
    : err.code === 'NO_BACKEND' || err.code === 'NETWORK' ? t.common.error
    : lang === 'fr' ? 'Connectez-vous pour lancer une analyse IA.' : 'Sign in to run an AI analysis.';

  const a = m.data?.content;
  return (
    <Card title={t.asset.analyze} collapsible defaultOpen={false}>
      {!a ? (
        <View style={{ gap: space.sm }}>
          {plan === 'free' ? <Txt size="xs" muted>{fmt(t.asset.analysesLeft, { n: ENTITLEMENTS.free.aiAnalysesPerDay })}</Txt> : null}
          <Button label={t.asset.analyze} icon="✦" loading={m.isPending} onPress={() => m.mutate()} />
          {errorText ? <Txt size="sm" color={th.warn}>{errorText}</Txt> : null}
          {err?.code === 'QUOTA_EXCEEDED' ? <Button label={t.premium.cta} variant="secondary" onPress={() => router.push('/premium')} /> : null}
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <Txt weight="700" size="lg">{a.headline}</Txt>
          <Txt size="sm">{a.summary}</Txt>
          <Txt weight="700">{t.asset.technical}</Txt><Txt size="sm">{a.technical}</Txt>
          <Txt weight="700">{t.asset.fundamentals}</Txt><Txt size="sm">{a.fundamental}</Txt>
          {a.scenarios.map((s) => (
            <View key={s.name} style={{ borderLeftWidth: 3, borderLeftColor: s.name === 'bull' ? th.up : s.name === 'bear' ? th.down : th.neutral, paddingLeft: space.sm }}>
              <Txt weight="700" size="sm">{t.consensus[s.name]}</Txt>
              <Txt size="sm">{s.description}</Txt>
              <Txt size="xs" muted>{s.trigger}</Txt>
            </View>
          ))}
          {a.keyLevels.map((k) => <KV key={k.label} label={k.label} value={fmtNum(k.price, lang)} />)}
          {a.risks.length ? <View><Txt weight="700">{lang === 'fr' ? 'Risques' : 'Risks'}</Txt>{a.risks.map((r) => <Txt key={r} size="sm">• {r}</Txt>)}</View> : null}
          {a.dataGaps.length ? <Txt size="xs" muted>{lang === 'fr' ? 'Données manquantes' : 'Missing data'} : {a.dataGaps.join(' · ')}</Txt> : null}
          <Txt size="xs" muted>{t.common.source} : {a.sources.map((s) => `${s.label} (${s.date})`).join(' · ')}</Txt>
          <Disclaimer />
        </View>
      )}
    </Card>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Card, KV, Loading, Screen, Txt } from '../components/ui';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { fmtDate, fmtNum } from '../lib/format';

export default function TrackRecord() {
  const { t, lang } = useT();
  const q = useQuery({ queryKey: ['track-record'], queryFn: api.trackRecord });
  const fr = lang === 'fr';
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: t.more.trackRecord }} />
      <Card title={fr ? 'Comment lire ces chiffres' : 'How to read these figures'}>
        <Txt size="sm">{fr
          ? 'Le modèle est testé « en aveugle » sur l’historique : à chaque date, il ne voit que les données disponibles ce jour-là, puis on compare sa prévision au cours réellement observé. Le taux de réussite directionnel compte les appels haussiers/baissiers corrects. La couverture indique la part des cours réels tombés dans la fourchette à 80 % (idéal ≈ 80 %). Le taux de base est la part de périodes haussières : un bon modèle doit faire mieux.'
          : 'The model is tested “blind” on history: at each date it only sees data available that day, then its forecast is compared to the actually observed price. Directional hit rate counts correct up/down calls. Coverage is the share of real prices inside the 80% range (ideal ≈ 80%). Base rate is the share of rising periods: a good model should beat it.'}</Txt>
        <Txt size="xs" muted>{fr ? 'Les backtests utilisent la partie prix du modèle tant que les historiques point-in-time des fondamentaux ne sont pas disponibles. Performances passées ≠ performances futures.' : 'Backtests use the price part of the model until point-in-time fundamentals history is available. Past performance ≠ future results.'}</Txt>
      </Card>
      {q.isLoading ? <Loading /> : !q.data?.length ? (
        <Card><Txt muted>{fr ? 'Premier backtest publié après la constitution de l’historique de cours (au moins 2 ans de données vérifiées).' : 'First backtest published once the price history is built (at least 2 years of verified data).'}</Txt></Card>
      ) : q.data.map((r) => (
        <Card key={`${r.scope}-${r.horizon}`} title={`${r.scope === 'ALL' ? (fr ? 'Afrique' : 'Africa') : r.scope} · ${r.horizon}`}>
          <KV label={fr ? 'Réussite directionnelle' : 'Directional hit rate'} value={r.hit_rate == null ? '—' : `${fmtNum(r.hit_rate * 100, lang, 1)} % (${r.hits}/${r.calls})`} />
          <KV label={fr ? 'Taux de base (hausse)' : 'Base rate (up)'} value={r.base_rate_up == null ? '—' : `${fmtNum(r.base_rate_up * 100, lang, 1)} %`} />
          <KV label={fr ? 'Couverture fourchette 80 %' : '80% range coverage'} value={r.range_coverage == null ? '—' : `${fmtNum(r.range_coverage * 100, lang, 1)} %`} />
          <KV label={fr ? 'Échantillons' : 'Samples'} value={String(r.samples)} />
          <Txt size="xs" muted>{fmtDate(r.period_start, lang)} → {fmtDate(r.period_end, lang)}</Txt>
        </Card>
      ))}
    </Screen>
  );
}

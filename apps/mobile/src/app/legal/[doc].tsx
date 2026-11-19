import { Stack, useLocalSearchParams } from 'expo-router';
import { Card, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { LEGAL } from '../../lib/legal';

export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { lang } = useT();
  const d = LEGAL[doc as keyof typeof LEGAL]?.[lang];
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: d?.title ?? '' }} />
      {d ? d.sections.map((s) => (
        <Card key={s.h} title={s.h}><Txt size="sm">{s.p}</Txt></Card>
      )) : <Txt muted>—</Txt>}
    </Screen>
  );
}

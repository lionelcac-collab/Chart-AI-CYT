import { View } from 'react-native';
import { Txt } from './ui';

/** Minimal markdown for AI replies: ## headings, - bullets, **bold**. */
export function Rich({ text, color }: { text: string; color: string }) {
  const inline = (s: string, k: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <Txt key={k + i} size="sm" weight="700" color={color}>{part.slice(2, -2)}</Txt> : part);
  return (
    <View style={{ gap: 4 }}>
      {text.split('\n').map((line, i) => {
        const l = line.trimEnd();
        if (!l.trim()) return <View key={i} style={{ height: 4 }} />;
        const h = /^#{1,4}\s+(.*)$/.exec(l);
        if (h) return <Txt key={i} weight="800" color={color} style={{ marginTop: 4 }}>{inline(h[1]!.replace(/\*\*/g, ''), `h${i}`)}</Txt>;
        const b = /^(\s*)[-*•]\s+(.*)$/.exec(l);
        if (b) return <Txt key={i} size="sm" color={color} style={{ paddingLeft: 8 + (b[1]!.length > 1 ? 12 : 0) }}>• {inline(b[2]!, `b${i}`)}</Txt>;
        return <Txt key={i} size="sm" color={color}>{inline(l, `p${i}`)}</Txt>;
      })}
    </View>
  );
}

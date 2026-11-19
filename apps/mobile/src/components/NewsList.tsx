import { router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { useT } from '../i18n';
import { fmtDate } from '../lib/format';
import type { NewsItem } from '../lib/types';
import { space, useTheme } from '../theme';
import { Txt } from './ui';

const CATEGORY: Record<string, { fr: string; en: string }> = {
  results: { fr: 'Résultats', en: 'Results' }, dividend: { fr: 'Dividende', en: 'Dividend' }, corporate_action: { fr: 'Opération', en: 'Corporate action' },
  regulation: { fr: 'Régulation', en: 'Regulation' }, macro: { fr: 'Macro', en: 'Macro' }, management: { fr: 'Direction', en: 'Management' },
  market: { fr: 'Marché', en: 'Market' }, other: { fr: 'Autre', en: 'Other' },
};

/** News list: title, AI summary, category, tone dot, source and date; tickers open the asset sheet. */
export function NewsList({ items, showTickers = true }: { items: NewsItem[]; showTickers?: boolean }) {
  const th = useTheme();
  const { lang } = useT();
  return (
    <View style={{ gap: space.md }}>
      {items.map((n) => {
        const tone = n.sentiment == null ? th.neutral : n.sentiment > 0.15 ? th.up : n.sentiment < -0.15 ? th.down : th.neutral;
        const summary = lang === 'fr' ? n.summary_fr : n.summary_en;
        return (
          <View key={String(n.id)} style={{ gap: 3, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: th.grid }}>
            <Pressable disabled={!n.url} accessibilityRole={n.url ? 'link' : undefined} onPress={() => n.url && Linking.openURL(n.url)}>
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
                <View accessibilityLabel={lang === 'fr' ? 'Tonalité' : 'Tone'} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone, marginTop: 6 }} />
                <Txt size="sm" weight="600" style={{ flex: 1 }}>{n.title}</Txt>
              </View>
            </Pressable>
            {summary ? <Txt size="xs" muted style={{ marginLeft: 16 }}>{summary}</Txt> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: 16 }}>
              {n.category ? <Txt size="xs" color={th.info}>{CATEGORY[n.category]?.[lang] ?? n.category}</Txt> : null}
              <Txt size="xs" muted>{n.source} · {fmtDate(n.published_at, lang)}</Txt>
              {showTickers ? (n.asset_ids ?? []).slice(0, 3).map((id) => (
                <Txt key={id} size="xs" weight="700" color={th.accent} onPress={() => router.push(`/asset/${encodeURIComponent(id)}`)}>{id.split(':')[1]}</Txt>
              )) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

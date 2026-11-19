import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useT } from '../../i18n';
import { useTheme } from '../../theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
  const th = useTheme();
  const { t } = useT();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: th.card, borderTopColor: th.border },
      tabBarActiveTintColor: th.accent, tabBarInactiveTintColor: th.textMuted,
    }}>
      <Tabs.Screen name="index" options={{ title: t.tabs.dashboard, tabBarIcon: icon('◎') }} />
      <Tabs.Screen name="screener" options={{ title: t.tabs.screener, tabBarIcon: icon('⌕') }} />
      <Tabs.Screen name="watchlist" options={{ title: t.tabs.watchlist, tabBarIcon: icon('☆') }} />
      <Tabs.Screen name="assistant" options={{ title: t.tabs.assistant, tabBarIcon: icon('✦') }} />
      <Tabs.Screen name="more" options={{ title: t.tabs.more, tabBarIcon: icon('≡') }} />
    </Tabs>
  );
}

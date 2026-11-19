import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle, type StyleProp, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../i18n';
import { fmtDate } from '../lib/format';
import { SNAPSHOT } from '../lib/snapshot';
import { DEMO_MODE } from '../lib/supabase';
import { font, radius, space, useTheme } from '../theme';

export function Txt({ children, size = 'md', weight = '400', color, muted, style, numberOfLines, onPress }: {
  children: ReactNode; size?: keyof typeof font; weight?: TextStyle['fontWeight']; color?: string; muted?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number; onPress?: () => void;
}) {
  const t = useTheme();
  return <Text onPress={onPress} accessibilityRole={onPress ? 'link' : undefined} numberOfLines={numberOfLines} style={[{ color: color ?? (muted ? t.textMuted : t.text), fontSize: font[size], fontWeight: weight, fontVariant: ['tabular-nums'] }, style]}>{children}</Text>;
}

export function DemoBanner() {
  const t = useTheme();
  const { t: tr, lang } = useT();
  if (SNAPSHOT) {
    const at = new Date(SNAPSHOT.fetchedAt);
    const hh = at.toISOString().slice(11, 16);
    return (
      <View accessibilityRole="alert" style={{ backgroundColor: t.info, paddingVertical: 6, paddingHorizontal: space.md }}>
        <Text style={{ color: '#06122B', fontSize: font.xs, fontWeight: '700', textAlign: 'center' }}>
          {tr.common.snapshotBanner.replace('{date}', fmtDate(SNAPSHOT.fetchedAt, lang)).replace('{time}', hh)}
        </Text>
      </View>
    );
  }
  if (!DEMO_MODE) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: t.warn, paddingVertical: 6, paddingHorizontal: space.md }}>
      <Text style={{ color: '#1A1000', fontSize: font.xs, fontWeight: '700', textAlign: 'center' }}>{tr.common.demoBanner}</Text>
    </View>
  );
}

export function Screen({ children, scroll = true, refreshing, onRefresh, edges = ['top'] }: { children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; edges?: ('top' | 'bottom')[] }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.bg }}>
      <DemoBanner />
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2, maxWidth: 960, width: '100%', alignSelf: 'center' }}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.accent} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : <View style={{ flex: 1, maxWidth: 960, width: '100%', alignSelf: 'center' }}>{children}</View>}
    </SafeAreaView>
  );
}

export function Card({ children, style, title, right }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.card, borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, gap: space.md }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt size="lg" weight="700">{title}</Txt>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Pill({ label, color, bg, onPress, active }: { label: string; color?: string; bg?: string; onPress?: () => void; active?: boolean }) {
  const t = useTheme();
  const content = (
    <View style={{ paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: bg ?? (active ? t.accent : t.cardAlt), borderWidth: StyleSheet.hairlineWidth, borderColor: active ? t.accent : t.border }}>
      <Text style={{ color: color ?? (active ? t.accentText : t.text), fontSize: font.sm, fontWeight: '600' }}>{label}</Text>
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress} hitSlop={6}>{content}</Pressable> : content;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, icon }: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; loading?: boolean; icon?: string }) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : variant === 'secondary' ? t.cardAlt : 'transparent';
  const fg = variant === 'primary' ? t.accentText : t.text;
  return (
    <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, paddingVertical: 14, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: 'center', borderWidth: variant === 'ghost' ? 1 : 0, borderColor: t.border })}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: font.md }}>{icon ? `${icon}  ` : ''}{label}</Text>}
    </Pressable>
  );
}

export function Loading() {
  const t = useTheme();
  return <View style={{ padding: space.xxl, alignItems: 'center' }}><ActivityIndicator color={t.accent} size="large" /></View>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  const { t: tr } = useT();
  return (
    <Card style={{ borderColor: t.down }}>
      <Txt color={t.down} weight="600">{message}</Txt>
      {onRetry ? <Button label={tr.common.retry} variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

export function KV({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Txt muted size="sm">{label}</Txt>
      <Txt size="sm" weight="600" color={valueColor}>{value}</Txt>
    </Row>
  );
}

export function Disclaimer({ text }: { text?: string }) {
  const { t } = useT();
  return <Txt size="xs" muted style={{ fontStyle: 'italic' }}>{text ?? t.disclaimer}</Txt>;
}

/** Freshness + source badge: required next to every price. */
export function ProvenanceBadge({ status, source }: { status: string; source: string }) {
  const t = useTheme();
  const { t: tr } = useT();
  return (
    <Row gap={6}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.info }} />
      <Txt size="xs" muted>{status} · {tr.common.source} : {source === 'mansa' ? 'Mansa Markets' : source}</Txt>
    </Row>
  );
}

import { useState, type ReactNode } from 'react';
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
          {(SNAPSHOT.kind === 'db' ? tr.common.dbBanner : tr.common.snapshotBanner).replace('{date}', fmtDate(SNAPSHOT.fetchedAt, lang)).replace('{time}', hh)}
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

/**
 * Card. With `collapsible`, the title becomes a tap target that shows/hides the content
 * (▸ closed / ▾ open); `badge` shows a short summary (e.g. a count) next to the title.
 */
export function Card({ children, style, title, right, collapsible, defaultOpen = true, badge }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; title?: string; right?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; badge?: string | number | null;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const shown = !collapsible || open;
  const header = title ? (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
        {collapsible ? <Txt size="md" color={t.accent}>{open ? '▾' : '▸'}</Txt> : null}
        <Txt size="lg" weight="700" style={{ flexShrink: 1 }}>{title}</Txt>
        {badge != null && badge !== '' ? (
          <View style={{ backgroundColor: t.cardAlt, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Txt size="xs" weight="700" muted>{badge}</Txt>
          </View>
        ) : null}
      </View>
      {right}
    </View>
  ) : null;
  return (
    <View style={[{ backgroundColor: t.card, borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, gap: space.md }, style]}>
      {header && collapsible ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}, ${open ? 'replier' : 'déplier'}`} onPress={() => setOpen((o) => !o)} hitSlop={6}>
          {header}
        </Pressable>
      ) : header}
      {shown ? children : null}
    </View>
  );
}

/** Collapsible sub-section inside a card (lighter than a Card). */
export function Section({ title, badge, defaultOpen = false, children, color }: { title: string; badge?: string | number | null; defaultOpen?: boolean; children: ReactNode; color?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border, paddingTop: space.sm, gap: space.sm }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
          <Txt color={t.accent}>{open ? '▾' : '▸'}</Txt>
          <Txt weight="700" color={color} style={{ flexShrink: 1 }}>{title}</Txt>
        </View>
        {badge != null && badge !== '' ? (
          <View style={{ backgroundColor: t.cardAlt, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Txt size="xs" weight="700" muted>{badge}</Txt>
          </View>
        ) : null}
      </Pressable>
      {open ? children : null}
    </View>
  );
}

/** Dropdown selector: shows the current choice; tapping opens the option list (replaces long rows of pills). */
export function Select<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? String(value);
  return (
    <View style={{ gap: 6, flexGrow: 1, minWidth: 140 }}>
      <Txt size="xs" muted>{label}</Txt>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} : ${current}`} accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: t.cardAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, borderWidth: 1, borderColor: open ? t.accent : t.border }}>
        <Txt weight="600">{current}</Txt>
        <Txt color={t.accent}>{open ? '▴' : '▾'}</Txt>
      </Pressable>
      {open ? (
        <View accessibilityRole="menu" style={{ backgroundColor: t.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
          {options.map((o) => (
            <Pressable key={String(o.value)} accessibilityRole="menuitem" accessibilityState={{ selected: o.value === value }}
              onPress={() => { onChange(o.value); setOpen(false); }}
              style={({ pressed }) => ({ paddingHorizontal: space.md, paddingVertical: 10, backgroundColor: o.value === value ? t.accent : pressed ? t.card : 'transparent' })}>
              <Txt weight={o.value === value ? '700' : '400'} color={o.value === value ? t.accentText : t.text}>{o.label}</Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
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

/**
 * App chrome: desktop top navigation, brand strip, home hero, responsive columns and footer.
 * Desktop = web viewport ≥ 900 px: top nav replaces the bottom tab bar and content gets a wide grid.
 */
import { router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { APP_NAME } from '@chart-boursafrikia/core';
import { useT } from '../i18n';
import { useSettings } from '../settings';
import { font, radius, space, useTheme } from '../theme';

export const DESKTOP_MIN = 900;
export const CONTENT_MAX = 1240;

export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN;
}

const copy = {
  fr: {
    tagline: 'Analyse IA des bourses africaines',
    badge: '✦ Analyse IA avancée',
    heroTitle: 'L’intelligence artificielle au service des bourses africaines',
    heroSub: 'Cours officiels, plus bas / plus hauts, supports et résistances, scénarios et consensus calculés par IA sur les actions de la BRVM, de la BVMAC et de la NGX.',
    askAi: 'Demander à l’assistant IA', explore: 'Explorer les actions', premium: 'Premium', signIn: 'Connexion',
    strip: 'Analyse IA · Bourses africaines',
    markets: [['BRVM', '8 pays UEMOA'], ['BVMAC', '6 pays CEMAC'], ['NGX', 'Nigeria']],
    footer: 'Analyse IA des marchés boursiers africains — données issues des bulletins officiels et de fournisseurs licenciés.',
    disclaimer: 'Estimations statistiques, pas une garantie ni un conseil en investissement.',
  },
  en: {
    tagline: 'AI analysis of African stock markets',
    badge: '✦ Advanced AI analysis',
    heroTitle: 'Artificial intelligence for African stock markets',
    heroSub: 'Official prices, lows / highs, supports and resistances, AI-computed scenarios and consensus on BRVM, BVMAC and NGX stocks.',
    askAi: 'Ask the AI assistant', explore: 'Explore stocks', premium: 'Premium', signIn: 'Sign in',
    strip: 'AI analysis · African markets',
    markets: [['BRVM', '8 WAEMU countries'], ['BVMAC', '6 CEMAC countries'], ['NGX', 'Nigeria']],
    footer: 'AI analysis of African stock markets — data from official bulletins and licensed providers.',
    disclaimer: 'Statistical estimates, not a guarantee nor investment advice.',
  },
} as const;

export function useChromeCopy() { const { lang } = useT(); return copy[lang]; }

function Logo({ size = 22 }: { size?: number }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image source={require('../../assets/logo-mark.png')} accessibilityLabel="logo" style={{ width: size + 18, height: size + 18, borderRadius: (size + 18) * 0.22 }} />
      <Text style={{ color: th.text, fontSize: size, fontWeight: '800', letterSpacing: -0.3 }}>{APP_NAME}</Text>
    </View>
  );
}

/** Desktop header: logo + tagline, main navigation, Premium / sign-in. */
export function TopNav() {
  const th = useTheme();
  const { t } = useT();
  const c = useChromeCopy();
  const { plan } = useSettings();
  const path = usePathname();
  const items: [string, string, string][] = [
    ['/', t.tabs.dashboard, '◎'], ['/screener', t.tabs.screener, '⌕'], ['/watchlist', t.tabs.watchlist, '☆'],
    ['/assistant', t.tabs.assistant, '✦'], ['/track-record', 'Track record', '◷'], ['/more', t.tabs.more, '≡'],
  ];
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <View accessibilityRole="header" style={{ backgroundColor: th.card, borderBottomWidth: 1, borderBottomColor: th.border }}>
      <View style={{ maxWidth: CONTENT_MAX, width: '100%', alignSelf: 'center', paddingHorizontal: space.xl, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xl }}>
        <Pressable accessibilityRole="link" onPress={() => router.navigate('/')} style={{ gap: 2 }}>
          <Logo />
          <Text style={{ color: th.textMuted, fontSize: font.xs, fontWeight: '600', marginLeft: 48 }}>{c.tagline}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 4, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          {items.map(([href, label, icon]) => {
            const active = isActive(href);
            const ai = href === '/assistant';
            return (
              <Pressable key={href} accessibilityRole="link" accessibilityState={{ selected: active }} onPress={() => router.navigate(href as never)}
                style={(state) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
                  backgroundColor: active ? th.accent : (state as { hovered?: boolean }).hovered ? th.cardAlt : 'transparent',
                  borderWidth: ai && !active ? 1 : 0, borderColor: th.accent,
                })}>
                <Text style={{ color: active ? th.accentText : ai ? th.accent : th.textMuted, fontSize: 14 }}>{icon}</Text>
                <Text style={{ color: active ? th.accentText : th.text, fontSize: 14, fontWeight: active ? '700' : '600' }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          {plan !== 'premium' ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/premium')} style={{ backgroundColor: th.accent, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill }}>
              <Text style={{ color: th.accentText, fontWeight: '800', fontSize: 14 }}>★ {c.premium}</Text>
            </Pressable>
          ) : <Text style={{ color: th.accent, fontWeight: '800' }}>★ Premium</Text>}
          <Pressable accessibilityRole="button" onPress={() => router.push('/more')} style={{ borderWidth: 1, borderColor: th.border, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill }}>
            <Text style={{ color: th.text, fontWeight: '600', fontSize: 14 }}>👤</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Small strip shown at the top of every mobile screen: what the app is. */
export function BrandStrip() {
  const th = useTheme();
  const c = useChromeCopy();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: th.cardAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', maxWidth: '100%' }}>
      <Image source={require('../../assets/logo-mark.png')} accessibilityIgnoresInvertColors style={{ width: 20, height: 20, borderRadius: 5 }} />
      <Text style={{ color: th.text, fontSize: 12, fontWeight: '700', flexShrink: 0 }} numberOfLines={1}>{APP_NAME}</Text>
      <Text style={{ color: th.textMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>· {c.strip}</Text>
    </View>
  );
}

/** Home hero: tells immediately that this is advanced AI analysis of African markets. */
export function Hero() {
  const th = useTheme();
  const c = useChromeCopy();
  const desktop = useIsDesktop();
  return (
    <View style={{ backgroundColor: '#161B1E', borderWidth: th.mode === 'dark' ? 1 : 0, borderColor: '#2A3438', borderRadius: radius.lg, padding: desktop ? 40 : space.xl, gap: space.md, overflow: 'hidden' }}>
      <Image source={require('../../assets/splash-icon.png')} accessibilityIgnoresInvertColors style={{ position: 'absolute', right: desktop ? 30 : -60, top: desktop ? 10 : 10, width: desktop ? 380 : 220, height: desktop ? 380 : 220, opacity: desktop ? 0.9 : 0.22 }} />
      <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(110,236,242,0.16)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
        <Text style={{ color: '#6EECF2', fontWeight: '800', fontSize: 12, letterSpacing: 0.4 }}>{c.badge.toUpperCase()}</Text>
      </View>
      {!desktop ? <Text style={{ color: '#EEF1FA', fontSize: 15, fontWeight: '800' }}>{APP_NAME}</Text> : null}
      <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: desktop ? 40 : 24, lineHeight: desktop ? 46 : 30, fontWeight: '800', maxWidth: desktop ? 680 : undefined, letterSpacing: -0.5 }}>{c.heroTitle}</Text>
      <Text style={{ color: '#B5C6C9', fontSize: desktop ? 17 : 14, lineHeight: desktop ? 25 : 20, maxWidth: desktop ? 660 : undefined }}>{c.heroSub}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {c.markets.map(([code, zone]) => (
          <View key={code} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>{code}</Text>
            <Text style={{ color: '#B5C6C9', fontSize: 12 }}>{zone}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm }}>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/assistant')} style={{ backgroundColor: '#6EECF2', paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.md }}>
          <Text style={{ color: '#04191B', fontWeight: '800', fontSize: 15 }}>✦ {c.askAi}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/screener')} style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.md }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{c.explore} →</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Side-by-side columns on desktop, stacked on phones. `flex` sets each column's relative width. */
export function Columns({ children, flex }: { children: ReactNode[]; flex?: number[] }) {
  const desktop = useIsDesktop();
  if (!desktop) return <>{children}</>;
  return (
    <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' }}>
      {children.map((col, i) => <View key={i} style={{ flex: flex?.[i] ?? 1, minWidth: 0, gap: space.lg }}>{col}</View>)}
    </View>
  );
}

export function Footer() {
  const th = useTheme();
  const c = useChromeCopy();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: th.border, paddingTop: space.lg, marginTop: space.xl, gap: 4 }}>
      <Logo size={16} />
      <Text style={{ color: th.textMuted, fontSize: font.sm }}>{c.footer}</Text>
      <Text style={{ color: th.textMuted, fontSize: font.xs }}>{c.disclaimer}</Text>
    </View>
  );
}

const SHORT_ZONE = { BRVM: 'UEMOA', BVMAC: 'CEMAC', NGX: 'Nigeria' };

/** The three exchanges as always-visible buttons (optionally with an "All" button first). */
export function MarketButtons<T extends string>({ value, onChange, allLabel }: { value: T | undefined; onChange: (m: T | undefined) => void; allLabel?: string }) {
  const th = useTheme();
  const { lang } = useT();
  const c = copy[lang];
  const desktop = useIsDesktop();
  const items: [T | undefined, string, string][] = [
    ...(allLabel ? [[undefined, allLabel, desktop ? 'BRVM · BVMAC · NGX' : (lang === 'fr' ? '3 bourses' : '3 exchanges')] as [T | undefined, string, string]] : []),
    ...c.markets.map(([code, zone]) => [code as T, code, desktop ? zone : SHORT_ZONE[code as 'BRVM']] as [T | undefined, string, string]),
  ];
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: space.sm }}>
      {items.map(([v, label, sub]) => {
        const active = value === v;
        return (
          <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(v)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6, borderRadius: radius.md, borderWidth: 1,
              backgroundColor: active ? th.accent : th.card, borderColor: active ? th.accent : th.border }}>
            <Text style={{ color: active ? th.accentText : th.text, fontWeight: '800', fontSize: 15 }}>{label}</Text>
            <Text numberOfLines={1} style={{ color: active ? th.accentText : th.textMuted, fontSize: 11, marginTop: 2 }}>{sub}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

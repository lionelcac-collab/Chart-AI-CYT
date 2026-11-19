import { useColorScheme } from 'react-native';
import { useSettings } from './settings';

/** Nyota identity: night indigo + star gold. Positive/negative colours tuned for both modes (WCAG AA on cards). */
const palette = {
  dark: {
    bg: '#0B0F1E', card: '#141A2E', cardAlt: '#1B2240', border: '#26304F',
    text: '#EEF1FA', textMuted: '#9AA4C2', accent: '#F2B544', accentText: '#1A1300',
    up: '#2FCB8E', down: '#FF6B6B', neutral: '#8C96B5', warn: '#F5A524', info: '#6EA8FE',
    chartLine: '#F2B544', chartFill: 'rgba(242,181,68,0.16)', grid: '#1F2742',
  },
  light: {
    bg: '#F5F6FB', card: '#FFFFFF', cardAlt: '#EEF0F8', border: '#DDE1EE',
    text: '#111629', textMuted: '#5B6480', accent: '#B87A00', accentText: '#FFFFFF',
    up: '#0E8A5A', down: '#D33A3A', neutral: '#6B7390', warn: '#A86400', info: '#2F6FD6',
    chartLine: '#B87A00', chartFill: 'rgba(184,122,0,0.12)', grid: '#E6E9F3',
  },
};

export type Theme = typeof palette.dark & { mode: 'dark' | 'light' };

export function useTheme(): Theme {
  const system = useColorScheme();
  const { themePref } = useSettings();
  const mode = themePref === 'system' ? (system === 'light' ? 'light' : 'dark') : themePref;
  return { ...palette[mode], mode };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const font = { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 };

export const changeColor = (t: Theme, v: number | null | undefined) => (v == null ? t.neutral : v > 0 ? t.up : v < 0 ? t.down : t.neutral);

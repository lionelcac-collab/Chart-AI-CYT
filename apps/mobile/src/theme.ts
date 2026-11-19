import { useColorScheme } from 'react-native';
import { useSettings } from './settings';

/** Chart-BoursafrikIA identity (from the logo): graphite black + Africa cyan. Positive/negative colours tuned for both modes (WCAG AA on cards). */
const palette = {
  dark: {
    bg: '#0F1315', card: '#161B1E', cardAlt: '#1E2528', border: '#2A3438',
    text: '#EEF4F5', textMuted: '#9AABAF', accent: '#6EECF2', accentText: '#04191B',
    up: '#2FCB8E', down: '#FF6B6B', neutral: '#8FA0A4', warn: '#F5A524', info: '#7CB4FF',
    chartLine: '#6EECF2', chartFill: 'rgba(110,236,242,0.14)', grid: '#1F282B',
  },
  light: {
    bg: '#F3F7F8', card: '#FFFFFF', cardAlt: '#E9F1F2', border: '#D5E1E3',
    text: '#0F1A1D', textMuted: '#52666B', accent: '#0A7C85', accentText: '#FFFFFF',
    up: '#0E8A5A', down: '#D33A3A', neutral: '#66787C', warn: '#A86400', info: '#2F6FD6',
    chartLine: '#0A7C85', chartFill: 'rgba(10,124,133,0.12)', grid: '#E3ECEE',
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

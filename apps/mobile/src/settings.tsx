import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CurrencyCode, Plan } from '@chart-boursafrikia/core';

export type Lang = 'fr' | 'en';
export type ThemePref = 'system' | 'dark' | 'light';

interface SettingsState {
  lang: Lang;
  themePref: ThemePref;
  displayCurrency: 'local' | CurrencyCode;
  plan: Plan;
  setLang(l: Lang): void;
  setThemePref(t: ThemePref): void;
  setDisplayCurrency(c: 'local' | CurrencyCode): void;
  setPlan(p: Plan): void;
}

const defaultLang = (): Lang => (getLocales()[0]?.languageCode === 'en' ? 'en' : 'fr');

const Ctx = createContext<SettingsState>({
  lang: 'fr', themePref: 'system', displayCurrency: 'local', plan: 'free',
  setLang() {}, setThemePref() {}, setDisplayCurrency() {}, setPlan() {},
});

const KEY = 'chart-boursafrikia.settings.v1';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(defaultLang);
  const [themePref, setThemePref] = useState<ThemePref>('system');
  const [displayCurrency, setDisplayCurrency] = useState<'local' | CurrencyCode>('local');
  const [plan, setPlan] = useState<Plan>('free');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        try {
          const s = JSON.parse(raw);
          if (s.lang) setLang(s.lang);
          if (s.themePref) setThemePref(s.themePref);
          if (s.displayCurrency) setDisplayCurrency(s.displayCurrency);
        } catch { /* ignore corrupted settings */ }
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify({ lang, themePref, displayCurrency })).catch(() => {});
  }, [lang, themePref, displayCurrency, loaded]);

  const value = useMemo(() => ({ lang, themePref, displayCurrency, plan, setLang, setThemePref, setDisplayCurrency, setPlan }), [lang, themePref, displayCurrency, plan]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TopNav, useIsDesktop } from '../components/Chrome';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { registerPush } from '../lib/notifications';
import { initPurchases, identify } from '../lib/purchases';
import { supabase, currentUser } from '../lib/supabase';
import { SettingsProvider, useSettings } from '../settings';
import { useTheme } from '../theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, gcTime: 24 * 3600_000, refetchOnWindowFocus: false,
    // Definitive errors (not found, auth, premium, quota) are not retried.
    retry: (n, e) => n < 2 && !/introuvable|NOT_FOUND|AUTH|PREMIUM|QUOTA|402|404/i.test(String((e as { code?: string })?.code ?? (e as Error)?.message ?? '')) } },
});

function Shell() {
  const t = useTheme();
  const { setPlan } = useSettings();
  const desktop = useIsDesktop();
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const user = await currentUser();
      await initPurchases(user?.id);
      setPlan(await api.plan());
      if (supabase) {
        const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
          // Sign-out / account change: drop every cached personal query (watchlist, alerts, basket…).
          if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'dashboard' && q.queryKey[0] !== 'search' });
          queryClient.invalidateQueries({ queryKey: ['user'] });
          if (session?.user) { await identify(session.user.id); registerPush(session.user.id).catch(() => {}); }
          if (event !== 'INITIAL_SESSION') setPlan(await api.plan());
        });
        unsub = () => data.subscription.unsubscribe();
      }
    })().catch(() => {});
    return () => unsub?.();
  }, [setPlan]);

  return (
    <>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      {desktop ? <TopNav /> : null}
      <View style={{ flex: 1 }}>
      <Stack screenOptions={{
        headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg }, headerShadowVisible: false,
        // Text arrow: no image asset needed (works in the single-file web demo too); falls back to home when there is no history.
        headerLeft: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ paddingRight: 12 }}>
            <Text style={{ color: t.text, fontSize: 28, lineHeight: 30 }}>‹</Text>
          </Pressable>
        ),
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="asset/[id]" options={{ title: '' }} />
        <Stack.Screen name="premium" options={{ presentation: 'modal', title: 'Premium' }} />
        <Stack.Screen name="track-record" options={{ title: '' }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal', title: '' }} />
        <Stack.Screen name="news" options={{ title: '' }} />
        <Stack.Screen name="admin" options={{ title: 'Administration' }} />
        <Stack.Screen name="profil" options={{ title: 'Profil investisseur' }} />
        <Stack.Screen name="calendrier" options={{ title: '' }} />
        <Stack.Screen name="alertes" options={{ title: '' }} />
        <Stack.Screen name="operations" options={{ title: '' }} />
        <Stack.Screen name="portefeuille-virtuel" options={{ title: '' }} />
        <Stack.Screen name="previsions" options={{ title: '' }} />
        <Stack.Screen name="panier" options={{ title: '' }} />
        <Stack.Screen name="legal/[doc]" options={{ title: '' }} />
      </Stack>
      </View>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <Shell />
        </SettingsProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Demo mode = no backend configured, or explicitly forced. Always shown with a visible banner. */
export const DEMO_MODE = !url || !anon || process.env.EXPO_PUBLIC_DEMO === '1';

export const supabase: SupabaseClient | null = DEMO_MODE ? null : createClient(url, anon, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/**
 * Signed-in user from the local session (no network round-trip; the token is refreshed automatically).
 * Server-side, every request is still authorised by RLS / the edge functions with the access token.
 */
export async function currentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

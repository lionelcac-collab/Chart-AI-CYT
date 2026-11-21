// Shared helpers for edge functions (Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const env = (k: string, required = true): string => {
  const v = Deno.env.get(k);
  if (!v && required) throw new Error(`Missing env ${k}`);
  return v ?? '';
};

/** Service-role client: bypasses RLS. Only for jobs and server-side checks. */
export const admin = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

/** Client acting as the calling user (RLS applies). */
export const asUser = (req: Request): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });

export async function currentUser(req: Request) {
  const { data } = await asUser(req).auth.getUser();
  return data.user ?? null;
}

export async function isPremium(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data } = await admin().from('profiles').select('plan, premium_until').eq('id', userId).maybeSingle();
  return !!data && data.plan === 'premium' && (!data.premium_until || new Date(data.premium_until) > new Date());
}

/**
 * Only pg_cron (service role) may call job endpoints. Accepts the function's own service key, a key
 * listed in SUPABASE_SECRET_KEYS, or a legacy JWT whose role is service_role. The JWT signature is
 * verified by the Supabase gateway before the function runs (verify_jwt is on for job functions).
 */
export function requireService(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Response('forbidden', { status: 403 });
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return;
  if ((Deno.env.get('SUPABASE_SECRET_KEYS') ?? '').includes(token)) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role === 'service_role' && (!payload.ref || Deno.env.get('SUPABASE_URL')?.includes(payload.ref))) return;
  } catch { /* not a JWT */ }
  throw new Response('forbidden', { status: 403 });
}

export async function audit(actor: string, action: string, entity: string, entityId: string | null, details: unknown) {
  await admin().from('audit_log').insert({ actor, action, entity, entity_id: entityId, details });
}

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  };
}

/** Reads every row of a query, 1 000 at a time (the API caps each response at 1 000 rows). */
export async function allRows<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

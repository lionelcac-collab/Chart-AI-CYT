import { MVP_MARKETS } from '../_shared/core/index.ts';
// POST /admin {action, ...} — back-office of Chart-BoursafrikIA.
// Every call: the caller must be signed in AND listed in `admins`; every write is written to audit_log.
import { admin, audit, currentUser, handler, json } from '../_shared/runtime.ts';
import { sendEmail } from '../_shared/email.ts';

type Body = Record<string, unknown> & { action?: string };

const JOBS = new Set(['ingest-market', 'post-close', 'ingest-news', 'ingest-macro', 'backfill', 'reports', 'enrich-companies', 'ingest-analysts']);
const ASSET_FIELDS = new Set(['name', 'isin', 'sector_id', 'description_fr', 'description_en', 'activity_fr', 'activity_en', 'website',
  'headquarters', 'employees', 'founded_year', 'listing_date', 'share_capital', 'shares_outstanding', 'free_float_pct', 'is_active', 'country']);

Deno.serve(handler(async (req) => {
  const user = await currentUser(req);
  if (!user) return json({ error: 'auth requise' }, 401);
  const db = admin();
  const { data: isAdmin } = await db.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!isAdmin) return json({ error: 'ADMIN_REQUIRED' }, 403);

  const body = (await req.json().catch(() => ({}))) as Body;
  const actor = `admin:${user.email ?? user.id}`;

  switch (body.action) {
    // ---------------------------------------------------------------- e-mail check (sent to the signed-in admin only)
    case 'test_email': {
      if (!user.email) return json({ error: 'pas d’adresse e-mail' }, 400);
      const r = await sendEmail({ email: user.email }, 'Test d’envoi Chart-BoursafrikIA',
        '<p>Cet e-mail confirme que les alertes de Chart-BoursafrikIA peuvent vous être envoyées.</p>', ['test']);
      return json(r);
    }
    // ---------------------------------------------------------------- overview
    case 'stats': {
      const count = async (table: string, f?: (q: any) => any) => {
        let q = db.from(table).select('*', { count: 'exact', head: true });
        if (f) q = f(q);
        return (await q).count ?? 0;
      };
      const [users, premium, admins, assets, bars, anomalies, pendingActions, pendingFundamentals, consensus] = await Promise.all([
        count('profiles'), count('profiles', (q) => q.eq('plan', 'premium')), count('admins'), count('assets', (q) => q.eq('is_active', true)),
        count('price_bars'), count('data_anomalies', (q) => q.is('resolved_at', null)), count('corporate_action_candidates', (q) => q.eq('status', 'pending')),
        count('fundamentals', (q) => q.eq('review_status', 'pending')), count('consensus_results'),
      ]);
      const { data: lastRuns } = await db.from('ingestion_runs').select('job, market, status, source_used, rows_written, error, started_at, finished_at').order('id', { ascending: false }).limit(12);
      const lastSession: Record<string, string> = {};
      await Promise.all(MVP_MARKETS.map(async (m) => {
        const { data } = await db.from('market_latest').select('session_date').eq('market', m).order('session_date', { ascending: false }).limit(1).maybeSingle();
        if (data) lastSession[m] = data.session_date;
      }));
      return json({ users, premium, admins, assets, bars, anomalies, pendingActions, pendingFundamentals, consensus, lastRuns, lastSession });
    }

    // ---------------------------------------------------------------- linked services (balances, usage)
    case 'services': {
      // Claude list prices, USD per million tokens (cache write = 5-min cache, 1.25 × input).
      const PRICES: Record<string, { in: number; out: number; cr: number; cw: number }> = {
        'claude-haiku-5-5': { in: 0.1, out: 0.5, cr: 0.01, cw: 0.125 },
        'claude-sonnet-5-5': { in: 2, out: 10, cr: 0.1, cw: 2.5 },
        'claude-sonnet-5': { in: 2, out: 10, cr: 0.2, cw: 2.5 },
        'claude-opus-5-5': { in: 4, out: 20, cr: 0.2, cw: 5 },
        'claude-opus-4-8': { in: 5, out: 25, cr: 0.5, cw: 6.25 },
      };
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const since = new Date(Math.min(monthStart.getTime(), now.getTime() - 31 * 86400_000));
      const { data: rows, error } = await db.rpc('admin_ai_usage', { p_since: since.toISOString() });
      if (error) throw error;
      const today = now.toISOString().slice(0, 10);
      const d7 = new Date(now.getTime() - 6 * 86400_000).toISOString().slice(0, 10);
      const mStr = monthStart.toISOString().slice(0, 10);
      const FEATURE: Record<string, string> = { chat: 'Assistant IA', generate: 'Analyses & synthèses', chart_vision: 'Lecture de graphiques', watchlist_import: 'Import de captures' };
      type Agg = { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; usd: number };
      const zero = (): Agg => ({ calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0 });
      const tot = { today: zero(), d7: zero(), month: zero(), d30: zero() };
      const byFeature: Record<string, Agg> = {}, byModel: Record<string, Agg> = {};
      const daily: Record<string, number> = {};
      const unknownModels = new Set<string>();
      for (const r of (rows ?? []) as { day: string; action: string; model: string; calls: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number }[]) {
        const p = PRICES[r.model];
        if (!p) unknownModels.add(r.model);
        const usd = p ? (Number(r.input_tokens) * p.in + Number(r.output_tokens) * p.out + Number(r.cache_read_tokens) * p.cr + Number(r.cache_write_tokens) * p.cw) / 1e6 : 0;
        const add = (a: Agg) => { a.calls += Number(r.calls); a.input += Number(r.input_tokens); a.output += Number(r.output_tokens); a.cacheRead += Number(r.cache_read_tokens); a.cacheWrite += Number(r.cache_write_tokens); a.usd += usd; };
        add(tot.d30);
        if (r.day >= mStr) { add(tot.month); add(byFeature[FEATURE[r.action] ?? r.action] ??= zero()); add(byModel[r.model] ??= zero()); }
        if (r.day >= d7) add(tot.d7);
        if (r.day === today) add(tot.today);
        daily[r.day] = (daily[r.day] ?? 0) + usd;
      }
      const daysElapsed = Math.max(1, (now.getTime() - monthStart.getTime()) / 86400_000);
      // Projection: recent daily average (last 7 days, or since the first logged day) over the rest of the month.
      const firstDay = Object.keys(daily).sort()[0];
      const activeDays = firstDay ? Math.min(7, Math.max(1, (now.getTime() - Date.parse(`${firstDay}T00:00:00Z`)) / 86400_000)) : 1;
      const dailyAvgUsd = tot.d7.usd / activeDays;
      const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

      // Real spend from Anthropic's Usage & Cost Analytics API (needs an Admin API key; the credit balance itself is not exposed by any API).
      const adminKey = Deno.env.get('ANTHROPIC_ADMIN_KEY');
      let real: Record<string, unknown> = { available: false, reason: adminKey ? null : 'no_admin_key' };
      if (adminKey) {
        const costFor = async (from: Date) => {
          const u = `https://api.anthropic.com/v1/organizations/analytics/cost?starting_at=${encodeURIComponent(from.toISOString().slice(0, 19) + 'Z')}&ending_at=${encodeURIComponent(now.toISOString().slice(0, 19) + 'Z')}`;
          const r = await fetch(u, { headers: { 'x-api-key': adminKey, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'analytics-usage-cost-2026-08-24' } });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(`${r.status} ${(j as { error?: { message?: string } }).error?.message ?? ''}`.trim());
          const rowsC = ((j as { data?: { cost?: { amount?: string } }[] }).data ?? []);
          return { usd: rowsC.reduce((s2, x) => s2 + Number(x.cost?.amount ?? 0), 0) / 100, refreshedAt: (j as { data_refreshed_at?: string }).data_refreshed_at ?? null };
        };
        try {
          const [m, t] = await Promise.all([costFor(monthStart), costFor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())))]);
          real = { available: true, monthUsd: m.usd, todayUsd: t.usd, refreshedAt: m.refreshedAt };
        } catch (e) { real = { available: false, reason: 'error', error: String((e as Error).message ?? e).slice(0, 200) }; }
      }

      // Mansa: no usage endpoint documented; a light authenticated call shows the key status and any quota headers it returns.
      const mansaKey = Deno.env.get('MANSA_API_KEY');
      let mansa: Record<string, unknown> = { configured: !!mansaKey, rpm: Number(Deno.env.get('MANSA_RPM') ?? 30) };
      if (mansaKey) {
        try {
          const t0 = Date.now();
          const r = await fetch('https://mansaapi.com/api/v1/markets/exchanges', { headers: { 'X-API-Key': mansaKey } });
          const quota: Record<string, string> = {};
          r.headers.forEach((v, k) => { if (/limit|quota|remain|credit|usage|plan|tier|reset/i.test(k)) quota[k] = v; });
          const body = await r.json().catch(() => null) as { error?: { code?: string } } | null;
          mansa = { ...mansa, status: r.status, ok: r.ok, latencyMs: Date.now() - t0, quotaHeaders: quota, errorCode: body?.error?.code ?? null };
        } catch (e) { mansa = { ...mansa, ok: false, error: String(e).slice(0, 200) }; }
      }
      const { count: mansaRunsToday } = await db.from('ingestion_runs').select('*', { count: 'exact', head: true }).eq('source_used', 'mansa').gte('started_at', `${today}T00:00:00Z`);
      mansa.runsToday = mansaRunsToday ?? 0;

      const { data: dbs } = await db.rpc('admin_db_stats');
      const dbRow = (dbs as { db_bytes: number; top_tables: { name: string; bytes: number }[] }[] | null)?.[0];
      const { count: aiCallsToday } = await db.from('ai_usage').select('*', { count: 'exact', head: true }).eq('day', today);

      return json({
        generatedAt: now.toISOString(),
        claude: {
          configured: !!Deno.env.get('ANTHROPIC_API_KEY'), adminKey: !!adminKey, prices: PRICES, unknownModels: [...unknownModels],
          estimate: { ...tot, byFeature, byModel, daily, dailyAvgUsd, projectedMonthUsd: tot.month.usd + dailyAvgUsd * Math.max(0, daysInMonth - daysElapsed) }, real, usersWithQuotaToday: aiCallsToday ?? 0,
        },
        mansa,
        supabase: { dbBytes: dbRow?.db_bytes ?? null, freePlanDbBytes: 500 * 1024 * 1024, topTables: dbRow?.top_tables ?? [] },
        payments: {
          revenuecat: { configured: !!(Deno.env.get('REVENUECAT_WEBHOOK_AUTH') || Deno.env.get('REVENUECAT_API_KEY')) },
          cinetpay: { configured: !!(Deno.env.get('CINETPAY_APIKEY') || Deno.env.get('CINETPAY_API_KEY')) },
          moneroo: { configured: !!Deno.env.get('MONEROO_SECRET_KEY'), webhookSigned: !!Deno.env.get('MONEROO_WEBHOOK_SECRET') },
        },
      });
    }

    // ---------------------------------------------------------------- jobs
    case 'run_job': {
      const job = String(body.job ?? '');
      if (!JOBS.has(job)) return json({ error: 'job inconnu' }, 400);
      // Same path as the scheduler: call_edge() posts with the service key kept in Vault (async, via pg_net).
      const { error } = await db.rpc('call_edge', { fn: job, body: body.payload ?? {} });
      if (error) throw error;
      const res = { status: 202 };
      const result = { started: true };
      await audit(actor, 'run_job', 'function', job, { payload: body.payload ?? {}, status: res.status });
      return json({ status: res.status, result });
    }
    case 'runs': {
      const { data } = await db.from('ingestion_runs').select('*').order('id', { ascending: false }).limit(Number(body.limit ?? 50));
      return json({ runs: data ?? [] });
    }

    // ---------------------------------------------------------------- anomalies
    case 'anomalies': {
      let q = db.from('data_anomalies').select('*').order('id', { ascending: false }).limit(200);
      if (!body.all) q = q.is('resolved_at', null);
      return json({ anomalies: (await q).data ?? [] });
    }
    case 'anomaly_resolve': {
      const ids = (body.ids as number[]) ?? [Number(body.id)];
      const { error } = await db.from('data_anomalies').update({ resolved_at: new Date().toISOString(), resolved_by: user.id }).in('id', ids);
      if (error) throw error;
      await audit(actor, 'anomaly_resolve', 'data_anomalies', ids.join(','), {});
      return json({ ok: true });
    }

    // ---------------------------------------------------------------- users
    case 'users': {
      const { data: list, error } = await db.auth.admin.listUsers({ page: Number(body.page ?? 1), perPage: 200 });
      if (error) throw error;
      const ids = list.users.map((u) => u.id);
      const [{ data: profiles }, { data: admins }] = await Promise.all([
        db.from('profiles').select('id, plan, premium_until, language, created_at').in('id', ids),
        db.from('admins').select('user_id').in('user_id', ids),
      ]);
      const adminSet = new Set((admins ?? []).map((a) => a.user_id));
      const prof = new Map((profiles ?? []).map((p) => [p.id, p]));
      return json({
        users: list.users.map((u) => ({
          id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, confirmed: !!u.email_confirmed_at,
          plan: prof.get(u.id)?.plan ?? 'free', premium_until: prof.get(u.id)?.premium_until ?? null, admin: adminSet.has(u.id),
        })),
      });
    }
    case 'user_update': {
      const id = String(body.userId ?? '');
      if (!id) return json({ error: 'userId requis' }, 400);
      if (body.plan !== undefined) {
        const plan = body.plan === 'premium' ? 'premium' : 'free';
        const until = plan === 'premium' ? ((body.premium_until as string | null) ?? null) : null;
        const { error } = await db.from('profiles').update({ plan, premium_until: until }).eq('id', id);
        if (error) throw error;
      }
      if (body.admin !== undefined) {
        if (body.admin) await db.from('admins').upsert({ user_id: id });
        else {
          if (id === user.id) return json({ error: 'Vous ne pouvez pas retirer votre propre rôle administrateur.' }, 400);
          await db.from('admins').delete().eq('user_id', id);
        }
      }
      await audit(actor, 'user_update', 'auth.users', id, { plan: body.plan, premium_until: body.premium_until, admin: body.admin });
      return json({ ok: true });
    }

    // ---------------------------------------------------------------- assets & reference data
    case 'assets': {
      let q = db.from('assets').select('*, sectors(code, name_fr)').order('market').order('ticker').limit(500);
      if (body.market) q = q.eq('market', String(body.market));
      if (body.q) q = q.or(`ticker.ilike.%${body.q}%,name.ilike.%${body.q}%`);
      const [{ data }, { data: sectors }] = await Promise.all([q, db.from('sectors').select('id, code, name_fr').order('name_fr')]);
      return json({ assets: data ?? [], sectors: sectors ?? [] });
    }
    case 'asset_update': {
      const id = String(body.id ?? '');
      const fields = Object.fromEntries(Object.entries((body.fields as Record<string, unknown>) ?? {}).filter(([k]) => ASSET_FIELDS.has(k)));
      if (!id || !Object.keys(fields).length) return json({ error: 'id et champs requis' }, 400);
      const { error } = await db.from('assets').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      await audit(actor, 'asset_update', 'assets', id, fields);
      return json({ ok: true });
    }

    // ---------------------------------------------------------------- corporate actions review
    case 'corporate_actions': {
      let q = db.from('corporate_action_candidates').select('*').order('action_date', { ascending: false }).limit(Number(body.limit ?? 200));
      q = q.eq('status', String(body.status ?? 'pending'));
      if (body.market) q = q.eq('market', String(body.market));
      return json({ items: (await q).data ?? [] });
    }
    case 'corporate_action_apply': {
      // Adjusts every bar strictly before the action date: adjusted price = close × factor.
      const id = Number(body.id);
      const factor = Number(body.factor);
      if (!id || !(factor > 0)) return json({ error: 'id et facteur > 0 requis' }, 400);
      const { data: ca } = await db.from('corporate_action_candidates').select('*').eq('id', id).maybeSingle();
      if (!ca) return json({ error: 'introuvable' }, 404);
      const { data: bars } = await db.from('price_bars').select('session_date, adjusted_factor').eq('asset_id', ca.asset_id).lt('session_date', ca.action_date);
      for (const b of bars ?? []) {
        await db.from('price_bars').update({ adjusted_factor: Number(b.adjusted_factor ?? 1) * factor }).eq('asset_id', ca.asset_id).eq('session_date', b.session_date);
      }
      await db.from('corporate_action_candidates').update({ status: 'applied', factor, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', id);
      await audit(actor, 'corporate_action_apply', 'price_bars', ca.asset_id, { date: ca.action_date, factor, bars: bars?.length ?? 0 });
      return json({ ok: true, adjustedBars: bars?.length ?? 0 });
    }
    case 'corporate_action_dismiss': {
      const ids = (body.ids as number[]) ?? [Number(body.id)];
      await db.from('corporate_action_candidates').update({ status: 'dismissed', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).in('id', ids);
      await audit(actor, 'corporate_action_dismiss', 'corporate_action_candidates', ids.join(','), {});
      return json({ ok: true });
    }

    // ---------------------------------------------------------------- analyst opinions (public research notes)
    case 'analysts': {
      const { data } = await db.from('analyst_opinions').select('*').order('published_at', { ascending: false }).limit(200);
      return json({ items: data ?? [] });
    }
    case 'analyst_add': {
      const row = {
        asset_id: String(body.asset_id ?? ''), broker: String(body.broker ?? '').trim(), recommendation: body.recommendation,
        target_price: body.target_price == null || body.target_price === '' ? null : Number(body.target_price),
        published_at: String(body.published_at ?? ''), source_url: body.source_url ? String(body.source_url) : null,
      };
      if (!row.asset_id || !row.broker || !['buy', 'hold', 'sell'].includes(String(row.recommendation)) || !/^\d{4}-\d{2}-\d{2}$/.test(row.published_at)) {
        return json({ error: 'titre, courtier, recommandation (buy/hold/sell) et date AAAA-MM-JJ requis' }, 400);
      }
      const { error } = await db.from('analyst_opinions').upsert(row, { onConflict: 'asset_id,broker,published_at' });
      if (error) throw error;
      await audit(actor, 'analyst_add', 'analyst_opinions', row.asset_id, row);
      return json({ ok: true });
    }
    case 'analyst_delete': {
      await db.from('analyst_opinions').delete().eq('id', Number(body.id));
      await audit(actor, 'analyst_delete', 'analyst_opinions', String(body.id), {});
      return json({ ok: true });
    }

    // ---------------------------------------------------------------- audit
    case 'audit': {
      const { data } = await db.from('audit_log').select('*').order('id', { ascending: false }).limit(Number(body.limit ?? 100));
      return json({ items: data ?? [] });
    }
  }
  return json({ error: 'action inconnue' }, 400);
}));

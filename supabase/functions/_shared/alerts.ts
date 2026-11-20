// Alert evaluation (after each session, and on demand for one user right after an alert is created).
// Targets: one asset (scope 'asset') or every stock of the user's watchlist (scope 'watchlist', i.e. the "global" alert).
// Data: verified closes (market_latest), supports/resistances (market_scans 3M), calendar (corporate_events, next 7 days).
// Each (alert, asset, session) fires once: alert_events is unique on it. Push is sent for new events only.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

type Alert = { id: string; user_id: string; asset_id: string | null; kind: string; threshold: number | null; direction: string; scope: string };
type Latest = { asset_id: string; ticker: string; name: string; market: string; currency: string; session_date: string; close: number; change_pct: number | null };
type Scan = { assetId: string; support: number | null; resistance: number | null; supportDistPct: number | null; resistanceDistPct: number | null };

const fmt = (v: number, cur: string) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 100 ? 2 : 0 })} ${cur === 'XOF' || cur === 'XAF' ? 'FCFA' : cur}`;
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
const d = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function sendPush(tokens: string[], title: string, body: string, data: Record<string, string>) {
  for (let i = 0; i < tokens.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.slice(i, i + 100).map((to) => ({ to, title, body, data, sound: 'default', channelId: 'alerts' }))),
    }).catch(() => null);
  }
}

export async function evaluateAlerts(db: SupabaseClient, opts: { userId?: string } = {}) {
  let aq = db.from('alerts').select('id, user_id, asset_id, kind, threshold, direction, scope').eq('active', true);
  if (opts.userId) aq = aq.eq('user_id', opts.userId);
  const { data: alerts } = await aq;
  if (!alerts?.length) return { checked: 0, fired: 0 };

  const [{ data: latest }, { data: scans }, { data: events }, { data: wl }] = await Promise.all([
    db.from('market_latest').select('asset_id, ticker, name, market, currency, session_date, close, change_pct'),
    db.from('market_scans').select('market, session_date, rows').eq('period', '3M').order('session_date', { ascending: false }).limit(10),
    db.from('corporate_events').select('asset_id, kind, event_date, title_fr, details').gte('event_date', new Date().toISOString().slice(0, 10))
      .lte('event_date', new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)),
    db.from('watchlist_items').select('asset_id, watchlists!inner(user_id)').in('watchlists.user_id', [...new Set(alerts.map((a) => a.user_id))]),
  ]);
  const L = new Map(((latest ?? []) as Latest[]).map((r) => [r.asset_id, { ...r, close: Number(r.close), change_pct: r.change_pct == null ? null : Number(r.change_pct) }]));
  const S = new Map<string, Scan>();
  const seenMarket = new Set<string>();
  for (const s of scans ?? []) { if (seenMarket.has(s.market)) continue; seenMarket.add(s.market); for (const r of (s.rows as Scan[])) S.set(r.assetId, r); }
  const watched = new Map<string, string[]>();
  for (const w of wl ?? []) { const u = (w.watchlists as unknown as { user_id: string }).user_id; watched.set(u, [...(watched.get(u) ?? []), w.asset_id as string]); }

  const rows: { alert_id: string; user_id: string; asset_id: string; kind: string; session_date: string; title: string; body: string; value: number | null }[] = [];
  for (const al of alerts as Alert[]) {
    const targets = al.scope === 'watchlist' ? watched.get(al.user_id) ?? [] : al.asset_id ? [al.asset_id] : [];
    const t = al.threshold == null ? null : Number(al.threshold);
    for (const id of targets) {
      const q = L.get(id);
      if (!q) continue;
      const push = (title: string, body: string, value: number | null, date = q.session_date) => rows.push({ alert_id: al.id, user_id: al.user_id, asset_id: id, kind: al.kind, session_date: date, title, body, value });
      if (al.kind === 'price_above' && t != null && q.close >= t) push(`${q.ticker} a dépassé ${fmt(t, q.currency)}`, `Clôture à ${fmt(q.close, q.currency)} le ${d(q.session_date)} (${q.name}).`, q.close);
      else if (al.kind === 'price_below' && t != null && q.close <= t) push(`${q.ticker} est passé sous ${fmt(t, q.currency)}`, `Clôture à ${fmt(q.close, q.currency)} le ${d(q.session_date)} (${q.name}).`, q.close);
      else if (al.kind === 'change_pct' && t != null && q.change_pct != null) {
        const c = q.change_pct;
        const ok = al.direction === 'up' ? c >= t : al.direction === 'down' ? c <= -t : Math.abs(c) >= t;
        if (ok) push(`${q.ticker} ${pct(c)} sur la séance`, `Clôture à ${fmt(q.close, q.currency)} le ${d(q.session_date)} — seuil ${al.direction === 'both' ? '±' : al.direction === 'up' ? '+' : '−'}${t} %.`, c);
      } else if ((al.kind === 'near_support' || al.kind === 'near_resistance') && t != null) {
        const s = S.get(id);
        const sup = al.kind === 'near_support';
        const dist = s ? (sup ? s.supportDistPct : s.resistanceDistPct) : null;
        const lvl = s ? (sup ? s.support : s.resistance) : null;
        if (dist != null && lvl != null && dist >= 0 && dist <= t) push(`${q.ticker} proche de sa ${sup ? 'zone de support' : 'résistance'}`, `Clôture à ${fmt(q.close, q.currency)} le ${d(q.session_date)}, ${sup ? 'support' : 'résistance'} à ${fmt(lvl, q.currency)} (écart ${dist.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %, période 3 mois).`, dist);
      } else if (al.kind === 'events') {
        for (const e of (events ?? []).filter((x) => x.asset_id === id)) {
          push(`${q.ticker} : ${e.title_fr ?? e.kind} le ${d(e.event_date)}`, `${q.name}${(e.details as { venue?: string } | null)?.venue ? ` — ${(e.details as { venue: string }).venue}` : ''}.`, null, e.event_date);
        }
      }
    }
  }
  if (!rows.length) return { checked: alerts.length, fired: 0 };
  const { data: inserted } = await db.from('alert_events').upsert(rows, { onConflict: 'alert_id,asset_id,session_date', ignoreDuplicates: true }).select('user_id, asset_id, title, body');
  const fresh = inserted ?? [];
  if (fresh.length) {
    await db.from('alerts').update({ last_triggered_at: new Date().toISOString() }).in('id', [...new Set(rows.map((r) => r.alert_id))]);
    const users = [...new Set(fresh.map((f) => f.user_id))];
    const { data: toks } = await db.from('push_tokens').select('user_id, token').in('user_id', users);
    for (const u of users) {
      const mine = fresh.filter((f) => f.user_id === u);
      const tk = (toks ?? []).filter((t) => t.user_id === u).map((t) => t.token);
      if (!tk.length) continue;
      if (mine.length === 1) await sendPush(tk, mine[0]!.title, mine[0]!.body, { assetId: mine[0]!.asset_id });
      else await sendPush(tk, `${mine.length} alertes déclenchées`, mine.slice(0, 3).map((m) => m.title).join(' · '), { screen: 'alertes' });
    }
  }
  return { checked: alerts.length, fired: fresh.length };
}

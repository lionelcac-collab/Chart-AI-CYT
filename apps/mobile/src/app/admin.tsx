// Back-office: visible only to admins. Every action goes through the `admin` edge function,
// which re-checks the admin role server-side and writes to the audit log.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { MVP_MARKETS } from '@chart-boursafrikia/core';
import { Button, Card, ErrorBox, KV, Loading, Pill, Row, Screen, Txt } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, fmtNum } from '../lib/format';
import { radius, space, useTheme } from '../theme';

type Tab = 'overview' | 'services' | 'jobs' | 'anomalies' | 'users' | 'assets' | 'actions' | 'analysts' | 'audit';
const TABS: [Tab, string][] = [
  ['overview', 'Vue d’ensemble'], ['services', 'Services & crédits'], ['jobs', 'Collecte'], ['anomalies', 'Anomalies'], ['users', 'Utilisateurs'],
  ['assets', 'Titres'], ['actions', 'Opérations sur titres'], ['analysts', 'Avis d’analystes'], ['audit', 'Journal'],
];

const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

function Field({ label, value, onChange, placeholder, numeric }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  const th = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Txt size="xs" muted>{label}</Txt>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={th.textMuted} keyboardType={numeric ? 'decimal-pad' : 'default'}
        accessibilityLabel={label} autoCapitalize="none"
        style={{ backgroundColor: th.cardAlt, color: th.text, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: th.border }} />
    </View>
  );
}

function StatusPill({ s }: { s: string }) {
  const th = useTheme();
  const bg = s === 'ok' || s === 'applied' ? th.up : s === 'failed' || s === 'block' ? th.down : s === 'partial' || s === 'warn' || s === 'pending' ? th.warn : th.cardAlt;
  return <Pill label={s} bg={bg} color="#0B0F1E" />;
}

// ------------------------------------------------------------------------------------------- tabs
function Overview() {
  const q = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.admin('stats') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const s = q.data!;
  return (
    <>
      <Card title="Indicateurs">
        <KV label="Utilisateurs" value={String(s.users)} />
        <KV label="Abonnés Premium" value={String(s.premium)} />
        <KV label="Administrateurs" value={String(s.admins)} />
        <KV label="Titres actifs" value={String(s.assets)} />
        <KV label="Séances en base (cours)" value={fmtNum(s.bars, 'fr', 0)} />
        <KV label="Consensus calculés" value={String(s.consensus)} />
      </Card>
      <Card title="À traiter">
        <KV label="Anomalies de données ouvertes" value={String(s.anomalies)} />
        <KV label="Opérations sur titres à vérifier" value={String(s.pendingActions)} />
        <KV label="Comptes financiers à valider" value={String(s.pendingFundamentals)} />
      </Card>
      <Card title="Dernière séance en base">
        {MVP_MARKETS.map((m) => <KV key={m} label={m} value={s.lastSession?.[m] ? fmtDate(s.lastSession[m], 'fr') : '—'} />)}
      </Card>
      <Card title="Dernières collectes">
        {(s.lastRuns ?? []).map((r: any, i: number) => (
          <Row key={i} style={{ justifyContent: 'space-between' }}>
            <Txt size="sm">{dt(r.started_at)} · {r.job} {r.market ?? ''}</Txt>
            <Row><Txt size="xs" muted>{r.rows_written ?? 0}</Txt><StatusPill s={r.status} /></Row>
          </Row>
        ))}
      </Card>
    </>
  );
}

const usd = (v: number | null | undefined, d = 2) => (v == null ? '—' : `${v < 0.01 && v > 0 ? '< 0,01' : fmtNum(v, 'fr', d)} $`);
const mb = (b: number | null | undefined) => (b == null ? '—' : `${fmtNum(b / 1024 / 1024, 'fr', 0)} Mo`);
const tok = (n: number) => (n >= 1e6 ? `${fmtNum(n / 1e6, 'fr', 2)} M` : n >= 1e3 ? `${fmtNum(n / 1e3, 'fr', 1)} k` : String(n));

function LinkBtn({ label, url }: { label: string; url: string }) {
  const th = useTheme();
  return <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)}><Txt size="sm" color={th.accent} weight="700">{label} ↗</Txt></Pressable>;
}
function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const th = useTheme();
  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ok ? th.up : warn ? th.warn : th.down }} />;
}

function Services() {
  const th = useTheme();
  const q = useQuery({ queryKey: ['admin', 'services'], queryFn: () => api.admin<any>('services') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const c = d.claude, e = c.estimate;
  const maxDay = Math.max(0.0001, ...Object.values(e.daily as Record<string, number>));
  const days = Object.entries(e.daily as Record<string, number>).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
  const dbPct = d.supabase.dbBytes != null ? (d.supabase.dbBytes / d.supabase.freePlanDbBytes) * 100 : null;
  return (
    <>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size="xs" muted>Mis à jour le {dt(d.generatedAt)}</Txt>
        <Pressable onPress={() => q.refetch()}><Txt size="sm" color={th.accent} weight="700">↻ Actualiser</Txt></Pressable>
      </Row>

      <Card title="✦ Claude (Anthropic) — IA">
        <Row><Dot ok={c.configured} /><Txt size="sm">{c.configured ? 'Clé API active sur le serveur' : 'Clé API absente'}</Txt></Row>
        <Txt weight="700" style={{ marginTop: space.sm }}>Dépense réelle (facturée par Anthropic)</Txt>
        {c.real.available ? (
          <>
            <KV label="Ce mois-ci" value={usd(c.real.monthUsd)} />
            <KV label="Aujourd’hui" value={usd(c.real.todayUsd)} />
            <Txt size="xs" muted>Données Anthropic au {dt(c.real.refreshedAt)} (délai de quelques heures). Montants avant déduction des crédits.</Txt>
          </>
        ) : c.real.reason === 'error' ? (
          <Txt size="sm" color={th.warn}>Lecture impossible : {c.real.error}</Txt>
        ) : (
          <Txt size="sm" color={th.info}>Pour afficher la dépense réelle : dans la console Anthropic, créez une clé « Admin » (commence par sk-ant-admin01-, nécessite une organisation et le rôle admin), puis ajoutez-la dans Supabase (Edge Functions → Secrets) sous le nom ANTHROPIC_ADMIN_KEY.</Txt>
        )}
        <Txt size="xs" muted>Le solde de crédits prépayés n’est fourni par aucune API Anthropic : il se consulte uniquement dans la console (lien ci-dessous).</Txt>

        <Txt weight="700" style={{ marginTop: space.sm }}>Consommation estimée (calcul de l’application)</Txt>
        <KV label="Aujourd’hui" value={`${usd(e.today.usd, 3)} · ${e.today.calls} appels`} />
        <KV label="7 derniers jours" value={`${usd(e.d7.usd)} · ${e.d7.calls} appels`} />
        <KV label="Ce mois-ci" value={`${usd(e.month.usd)} · ${e.month.calls} appels`} />
        <KV label="Moyenne par jour (récente)" value={usd(e.dailyAvgUsd, 3)} />
        <KV label="Projection fin de mois" value={usd(e.projectedMonthUsd)} />
        {days.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 70, marginTop: 6 }}>
            {days.map(([day, v]) => (
              <View key={day} style={{ flex: 1, maxWidth: 40, alignItems: 'center', gap: 2 }}>
                <View style={{ width: '80%', height: Math.max(2, (v / maxDay) * 52), backgroundColor: th.accent, borderRadius: 3 }} />
                <Txt size="xs" muted>{day.slice(8, 10)}</Txt>
              </View>
            ))}
          </View>
        ) : null}
        <Txt weight="700" style={{ marginTop: space.sm }}>Par fonction (ce mois)</Txt>
        {Object.entries(e.byFeature as Record<string, any>).sort(([, a], [, b]) => b.usd - a.usd).map(([k, v]) => (
          <KV key={k} label={`${k} · ${v.calls} appels`} value={`${usd(v.usd, 3)} · ${tok(v.input + v.cacheRead + v.cacheWrite)} entrée / ${tok(v.output)} sortie`} />
        ))}
        <Txt weight="700" style={{ marginTop: space.sm }}>Par modèle (ce mois)</Txt>
        {Object.entries(e.byModel as Record<string, any>).map(([k, v]) => <KV key={k} label={k} value={`${usd(v.usd, 3)} · ${v.calls} appels`} />)}
        {c.unknownModels.length ? <Txt size="xs" color={th.warn}>Prix inconnu pour : {c.unknownModels.join(', ')} (non compté).</Txt> : null}
        <Txt size="xs" muted>Estimation au prix public (Sonnet 5.5 : 2 $ / 10 $ par million de jetons en entrée / sortie ; Haiku 5.5 : 0,10 $ / 0,50 $), à partir des jetons enregistrés à chaque appel.</Txt>
        <Row style={{ flexWrap: 'wrap', gap: space.md, marginTop: 4 }}>
          <LinkBtn label="Solde & facturation" url="https://platform.claude.com/settings/billing" />
          <LinkBtn label="Coûts" url="https://platform.claude.com/cost" />
          <LinkBtn label="Limites de dépense" url="https://platform.claude.com/settings/limits" />
          <LinkBtn label="Clés Admin" url="https://platform.claude.com/settings/admin-keys" />
        </Row>
      </Card>

      <Card title="Mansa Markets — données de marché">
        <Row><Dot ok={!!d.mansa.ok} /><Txt size="sm">{!d.mansa.configured ? 'Clé API absente' : d.mansa.ok ? `Clé valide (réponse en ${d.mansa.latencyMs} ms)` : `Erreur ${d.mansa.status ?? ''} ${d.mansa.errorCode ?? d.mansa.error ?? ''}`}</Txt></Row>
        <KV label="Limite configurée" value={`${d.mansa.rpm} requêtes / minute`} />
        <KV label="Collectes Mansa aujourd’hui" value={String(d.mansa.runsToday)} />
        {Object.keys(d.mansa.quotaHeaders ?? {}).length ? Object.entries(d.mansa.quotaHeaders).map(([k, v]) => <KV key={k} label={k} value={String(v)} />)
          : <Txt size="xs" muted>Mansa ne publie pas de solde ni de quota restant par API : consultez votre tableau de bord Mansa.</Txt>}
        <Row style={{ flexWrap: 'wrap', gap: space.md }}><LinkBtn label="Compte Mansa" url="https://mansaapi.com" /><LinkBtn label="Offres" url="https://mansaapi.com/pricing" /></Row>
      </Card>

      <Card title="Supabase — base de données & serveur">
        <KV label="Taille de la base" value={`${mb(d.supabase.dbBytes)}${dbPct != null ? ` · ${fmtNum(dbPct, 'fr', 0)} % de 500 Mo` : ''}`} />
        {dbPct != null ? <View style={{ height: 6, backgroundColor: th.cardAlt, borderRadius: 3 }}><View style={{ width: `${Math.min(100, dbPct)}%`, height: 6, borderRadius: 3, backgroundColor: dbPct > 80 ? th.down : dbPct > 60 ? th.warn : th.up }} /></View> : null}
        {(d.supabase.topTables ?? []).slice(0, 4).map((t: any) => <KV key={t.name} label={t.name} value={mb(t.bytes)} />)}
        <Txt size="xs" muted>500 Mo = limite de l’offre gratuite Supabase (8 Go sur l’offre Pro).</Txt>
        <LinkBtn label="Utilisation & facturation Supabase" url="https://supabase.com/dashboard/project/kpevjemvmsdqqpyaizns/settings/billing/usage" />
      </Card>

      <Card title="Hébergement & paiements">
        <Row style={{ justifyContent: 'space-between' }}><Txt size="sm">Vercel (site web)</Txt><LinkBtn label="Utilisation" url="https://vercel.com/cyt-chart-ia/~/usage" /></Row>
        <Row style={{ justifyContent: 'space-between' }}><Row><Dot ok={d.payments.revenuecat.configured} warn /><Txt size="sm">RevenueCat (abonnements stores)</Txt></Row><LinkBtn label="Tableau de bord" url="https://app.revenuecat.com" /></Row>
        <Row style={{ justifyContent: 'space-between' }}><Row><Dot ok={d.payments.cinetpay.configured} warn /><Txt size="sm">CinetPay (mobile money)</Txt></Row><LinkBtn label="Tableau de bord" url="https://app.cinetpay.com" /></Row>
        <Txt size="xs" muted>Vercel, RevenueCat et CinetPay ne sont pas interrogés automatiquement : leurs soldes et revenus se consultent sur leurs tableaux de bord.</Txt>
      </Card>
    </>
  );
}

function Jobs() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const runs = useQuery({ queryKey: ['admin', 'runs'], queryFn: () => api.admin<{ runs: any[] }>('runs', { limit: 40 }) });
  const run = useMutation({
    mutationFn: (v: { job: string; payload?: Record<string, unknown> }) => api.admin('run_job', v),
    onSuccess: (_d, v) => { setMsg(`« ${v.job} » lancé. Rafraîchissez dans une minute.`); setTimeout(() => qc.invalidateQueries({ queryKey: ['admin'] }), 15000); },
    onError: (e) => setMsg((e as Error).message),
  });
  return (
    <>
      <Card title="Lancer une tâche">
        <Txt size="xs" muted>La collecte automatique tourne déjà chaque soir de séance. Ces boutons servent à relancer manuellement.</Txt>
        <Button label="Collecte de clôture (BRVM, BVMAC, NGX)" variant="secondary" onPress={() => run.mutate({ job: 'ingest-market', payload: { job: 'eod', force: true } })} />
        <Button label="Cours différés en séance" variant="secondary" onPress={() => run.mutate({ job: 'ingest-market', payload: { job: 'delayed' } })} />
        <Button label="Recalculer consensus, classements et scans" variant="secondary" onPress={() => run.mutate({ job: 'post-close' })} />
        <Button label="Actualités (flux + classement IA)" variant="secondary" onPress={() => run.mutate({ job: 'ingest-news' })} />
        <Button label="Macroéconomie (Banque mondiale)" variant="secondary" onPress={() => run.mutate({ job: 'ingest-macro' })} />
        {msg ? <Txt size="sm">{msg}</Txt> : null}
      </Card>
      <Card title="Historique des collectes" right={<Pill label="↻" onPress={() => runs.refetch()} />}>
        {runs.isLoading ? <Loading /> : (runs.data?.runs ?? []).map((r) => (
          <View key={r.id} style={{ gap: 2, paddingVertical: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt size="sm" weight="600">{dt(r.started_at)} · {r.job} {r.market ?? ''}</Txt>
              <StatusPill s={r.status} />
            </Row>
            <Txt size="xs" muted>source : {r.source_used ?? '—'} · lignes : {r.rows_written ?? 0}{r.error ? ` · ${r.error}` : ''}</Txt>
          </View>
        ))}
      </Card>
    </>
  );
}

function Anomalies() {
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'anomalies', all], queryFn: () => api.admin<{ anomalies: any[] }>('anomalies', { all }) });
  const resolve = useMutation({ mutationFn: (ids: number[]) => api.admin('anomaly_resolve', { ids }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }) });
  const items = q.data?.anomalies ?? [];
  return (
    <Card title={`Anomalies (${items.length})`}>
      <Row><Pill label="Ouvertes" active={!all} onPress={() => setAll(false)} /><Pill label="Toutes" active={all} onPress={() => setAll(true)} /></Row>
      <Txt size="xs" muted>Cours bloqués ou suspects détectés à la collecte (variation hors limite, écart avec le bulletin officiel, cotation périmée…). Un cours « block » n'a pas été publié.</Txt>
      {q.isLoading ? <Loading /> : items.length === 0 ? <Txt muted>Aucune anomalie.</Txt> : (
        <>
          {!all ? <Button label="Tout marquer comme traité" variant="ghost" onPress={() => resolve.mutate(items.map((a) => a.id))} /> : null}
          {items.map((a) => (
            <View key={a.id} style={{ gap: 2, paddingVertical: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Pressable onPress={() => a.asset_id && router.push(`/asset/${encodeURIComponent(a.asset_id)}`)}><Txt size="sm" weight="700">{a.asset_id ?? '—'} · {a.kind}</Txt></Pressable>
                <StatusPill s={a.resolved_at ? 'résolue' : a.severity} />
              </Row>
              <Txt size="xs" muted>{dt(a.created_at)} · {a.message}</Txt>
              {!a.resolved_at ? <Pill label="Marquer comme traitée" onPress={() => resolve.mutate([a.id])} /> : null}
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

function Users() {
  const th = useTheme();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const q = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.admin<{ users: any[] }>('users') });
  const upd = useMutation({ mutationFn: (v: Record<string, unknown>) => api.admin('user_update', v), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }), onError: (e) => alert((e as Error).message) });
  const users = (q.data?.users ?? []).filter((u) => !filter || String(u.email).toLowerCase().includes(filter.toLowerCase()));
  return (
    <Card title={`Utilisateurs (${users.length})`}>
      <Field label="Rechercher un e-mail" value={filter} onChange={setFilter} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox message={(q.error as Error).message} /> : users.map((u) => (
        <View key={u.id} style={{ gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: th.grid }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt size="sm" weight="700">{u.email}</Txt>
            <Row>{u.admin ? <Pill label="admin" bg={th.info} color="#0B0F1E" /> : null}<Pill label={u.plan} bg={u.plan === 'premium' ? th.accent : th.cardAlt} color={u.plan === 'premium' ? th.accentText : th.text} /></Row>
          </Row>
          <Txt size="xs" muted>Inscrit le {fmtDate(u.created_at, 'fr')} · dernière connexion {dt(u.last_sign_in_at)}{u.premium_until ? ` · Premium jusqu'au ${fmtDate(u.premium_until, 'fr')}` : ''}</Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            {u.plan === 'premium'
              ? <Pill label="Repasser en gratuit" onPress={() => upd.mutate({ userId: u.id, plan: 'free' })} />
              : <><Pill label="Offrir Premium 1 mois" onPress={() => upd.mutate({ userId: u.id, plan: 'premium', premium_until: new Date(Date.now() + 31 * 86400_000).toISOString() })} />
                  <Pill label="Premium illimité" onPress={() => upd.mutate({ userId: u.id, plan: 'premium', premium_until: null })} /></>}
            <Pill label={u.admin ? 'Retirer admin' : 'Nommer admin'} onPress={() => upd.mutate({ userId: u.id, admin: !u.admin })} />
          </Row>
        </View>
      ))}
    </Card>
  );
}

const ASSET_FORM: [string, string, boolean?][] = [
  ['name', 'Nom'], ['isin', 'ISIN'], ['website', 'Site web'], ['headquarters', 'Siège'], ['founded_year', 'Année de création', true],
  ['employees', 'Effectifs', true], ['listing_date', 'Date d’introduction (AAAA-MM-JJ)'], ['shares_outstanding', 'Nombre de titres', true],
  ['free_float_pct', 'Flottant (%)', true], ['share_capital', 'Capital social', true], ['activity_fr', 'Activité (FR)'], ['activity_en', 'Activité (EN)'],
  ['description_fr', 'Présentation (FR)'], ['description_en', 'Présentation (EN)'],
];

function Assets() {
  const th = useTheme();
  const qc = useQueryClient();
  const [market, setMarket] = useState<string>('BRVM');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin', 'assets', market, search], queryFn: () => api.admin<{ assets: any[]; sectors: any[] }>('assets', { market, q: search }) });
  const save = useMutation({
    mutationFn: () => {
      const fields: Record<string, unknown> = {};
      for (const [k, , num] of ASSET_FORM) {
        const v = form[k];
        if (v === undefined || v === String(edit?.[k] ?? '')) continue;
        fields[k] = v === '' ? null : num ? Number(v.replace(',', '.')) : v;
      }
      if (form.sector_id !== undefined && form.sector_id !== String(edit?.sector_id ?? '')) fields.sector_id = form.sector_id ? Number(form.sector_id) : null;
      return api.admin('asset_update', { id: edit.id, fields });
    },
    onSuccess: () => { setMsg('Enregistré.'); qc.invalidateQueries({ queryKey: ['admin', 'assets'] }); },
    onError: (e) => setMsg((e as Error).message),
  });
  if (edit) {
    return (
      <Card title={`${edit.ticker} · ${edit.market}`} right={<Pill label="← Liste" onPress={() => { setEdit(null); setMsg(null); }} />}>
        <Txt size="xs" muted>Ces informations alimentent l'onglet « Société » des fiches. Laissez vide si non publié : rien n'est inventé.</Txt>
        <Txt size="xs" muted>Secteur</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          {(q.data?.sectors ?? []).map((s) => <Pill key={s.id} label={s.name_fr} active={String(form.sector_id ?? edit.sector_id ?? '') === String(s.id)} onPress={() => setForm({ ...form, sector_id: String(s.id) })} />)}
        </Row>
        {ASSET_FORM.map(([k, label, num]) => (
          <Field key={k} label={label} numeric={num} value={form[k] ?? (edit[k] == null ? '' : String(edit[k]))} onChange={(v) => setForm({ ...form, [k]: v })} />
        ))}
        <Button label="Enregistrer" loading={save.isPending} onPress={() => save.mutate()} />
        {msg ? <Txt size="sm">{msg}</Txt> : null}
      </Card>
    );
  }
  return (
    <Card title="Titres">
      <Row>{MVP_MARKETS.map((m) => <Pill key={m} label={m} active={market === m} onPress={() => setMarket(m)} />)}</Row>
      <Field label="Rechercher" value={search} onChange={setSearch} placeholder="ticker ou nom" />
      {q.isLoading ? <Loading /> : (q.data?.assets ?? []).map((a) => (
        <Pressable key={a.id} onPress={() => { setEdit(a); setForm({}); }} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: th.grid }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt size="sm" weight="700">{a.ticker} <Txt size="xs" muted>{a.name}</Txt></Txt>
            <Txt size="xs" muted>{a.sectors?.name_fr ?? 'secteur ?'}{a.is_active ? '' : ' · inactif'}</Txt>
          </Row>
        </Pressable>
      ))}
    </Card>
  );
}

function Actions() {
  const th = useTheme();
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [factors, setFactors] = useState<Record<number, string>>({});
  const q = useQuery({ queryKey: ['admin', 'actions', status], queryFn: () => api.admin<{ items: any[] }>('corporate_actions', { status, limit: 150 }) });
  const apply = useMutation({ mutationFn: (v: { id: number; factor: number }) => api.admin('corporate_action_apply', v), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }) });
  const dismiss = useMutation({ mutationFn: (id: number) => api.admin('corporate_action_dismiss', { id }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }) });
  return (
    <Card title="Opérations sur titres">
      <Row style={{ flexWrap: 'wrap' }}>
        {[['pending', 'À vérifier'], ['applied', 'Appliquées'], ['auto_applied', 'Automatiques'], ['dismissed', 'Écartées']].map(([k, l]) => <Pill key={k} label={l} active={status === k} onPress={() => setStatus(k)} />)}
      </Row>
      <Txt size="xs" muted>
        Sauts de cours détectés dans l'historique. Si c'est une division, un regroupement ou une attribution gratuite, appliquez le facteur
        (cours après ÷ cours avant, proposé par défaut) : tout l'historique antérieur est ajusté. Sinon, écartez (vrai mouvement de marché).
      </Txt>
      {q.isLoading ? <Loading /> : (q.data?.items ?? []).map((c) => {
        const suggested = c.factor ?? Number(c.price_after) / Number(c.price_before);
        const change = (Number(c.price_after) / Number(c.price_before) - 1) * 100;
        return (
          <View key={c.id} style={{ gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: th.grid }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Pressable onPress={() => router.push(`/asset/${encodeURIComponent(c.asset_id)}`)}><Txt size="sm" weight="700">{c.asset_id} · {fmtDate(c.action_date, 'fr')}</Txt></Pressable>
              <Txt size="sm" weight="700" color={change >= 0 ? th.up : th.down}>{change >= 0 ? '+' : ''}{fmtNum(change, 'fr', 1)} %</Txt>
            </Row>
            <Txt size="xs" muted>{fmtNum(Number(c.price_before), 'fr')} → {fmtNum(Number(c.price_after), 'fr')} · {c.note ?? ''}{c.factor ? ` · facteur ${fmtNum(Number(c.factor), 'fr', 4)}` : ''}</Txt>
            {status === 'pending' ? (
              <Row style={{ flexWrap: 'wrap' }}>
                <TextInput value={factors[c.id] ?? fmtNum(suggested, 'en', 4).replace(/,/g, '')} onChangeText={(v) => setFactors({ ...factors, [c.id]: v })} keyboardType="decimal-pad"
                  accessibilityLabel="Facteur" style={{ width: 90, backgroundColor: th.cardAlt, color: th.text, borderRadius: radius.sm, padding: 6, borderWidth: 1, borderColor: th.border }} />
                <Pill label="Appliquer" onPress={() => apply.mutate({ id: c.id, factor: Number((factors[c.id] ?? String(suggested)).replace(',', '.')) })} />
                <Pill label="Écarter" onPress={() => dismiss.mutate(c.id)} />
              </Row>
            ) : null}
          </View>
        );
      })}
      <Txt size="xs" muted>Après des corrections, relancez « Recalculer consensus, classements et scans » (onglet Collecte).</Txt>
    </Card>
  );
}

function Analysts() {
  const th = useTheme();
  const qc = useQueryClient();
  const empty = { asset_id: '', broker: '', recommendation: 'buy', target_price: '', published_at: new Date().toISOString().slice(0, 10), source_url: '' };
  const [f, setF] = useState<Record<string, string>>(empty);
  const [msg, setMsg] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin', 'analysts'], queryFn: () => api.admin<{ items: any[] }>('analysts') });
  const add = useMutation({
    mutationFn: () => api.admin('analyst_add', { ...f, asset_id: f.asset_id.trim().toUpperCase() }),
    onSuccess: () => { setMsg('Avis ajouté.'); setF(empty); qc.invalidateQueries({ queryKey: ['admin', 'analysts'] }); },
    onError: (e) => setMsg((e as Error).message),
  });
  const del = useMutation({ mutationFn: (id: number) => api.admin('analyst_delete', { id }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'analysts'] }) });
  return (
    <>
      <Card title="Ajouter un avis public">
        <Txt size="xs" muted>Recommandations et objectifs de cours publiés par les SGI, courtiers et banques (notes de recherche publiques). Indiquez toujours la source.</Txt>
        <Field label="Titre (ex. BRVM:SNTS, NGX:DANGCEM)" value={f.asset_id!} onChange={(v) => setF({ ...f, asset_id: v })} />
        <Field label="Courtier / SGI" value={f.broker!} onChange={(v) => setF({ ...f, broker: v })} />
        <Row>{[['buy', 'Achat'], ['hold', 'Conserver'], ['sell', 'Vente']].map(([k, l]) => <Pill key={k} label={l} active={f.recommendation === k} onPress={() => setF({ ...f, recommendation: k })} />)}</Row>
        <Field label="Objectif de cours (devise locale, optionnel)" numeric value={f.target_price!} onChange={(v) => setF({ ...f, target_price: v })} />
        <Field label="Date de publication (AAAA-MM-JJ)" value={f.published_at!} onChange={(v) => setF({ ...f, published_at: v })} />
        <Field label="Lien vers la note (source)" value={f.source_url!} onChange={(v) => setF({ ...f, source_url: v })} />
        <Button label="Ajouter" loading={add.isPending} onPress={() => add.mutate()} />
        {msg ? <Txt size="sm">{msg}</Txt> : null}
      </Card>
      <Card title={`Avis enregistrés (${q.data?.items.length ?? 0})`}>
        {(q.data?.items ?? []).map((o) => (
          <Row key={o.id} style={{ justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: th.grid }}>
            <View style={{ flex: 1 }}>
              <Txt size="sm" weight="600">{o.asset_id} · {o.broker} · {o.recommendation}{o.target_price ? ` → ${fmtNum(Number(o.target_price), 'fr')}` : ''}</Txt>
              <Txt size="xs" muted>{fmtDate(o.published_at, 'fr')}{o.source_url ? ' · ' : ''}{o.source_url ? <Txt size="xs" color={th.info} onPress={() => Linking.openURL(o.source_url)}>source</Txt> : null}</Txt>
            </View>
            <Pill label="Supprimer" onPress={() => del.mutate(o.id)} />
          </Row>
        ))}
      </Card>
    </>
  );
}

function Audit() {
  const q = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => api.admin<{ items: any[] }>('audit', { limit: 100 }) });
  return (
    <Card title="Journal d'audit">
      <Txt size="xs" muted>Toutes les actions d'administration, générations IA et changements d'abonnement.</Txt>
      {q.isLoading ? <Loading /> : (q.data?.items ?? []).map((a) => (
        <View key={a.id} style={{ paddingVertical: 4 }}>
          <Txt size="sm">{dt(a.at)} · {a.action} · {a.entity}{a.entity_id ? ` ${String(a.entity_id).slice(0, 40)}` : ''}</Txt>
          <Txt size="xs" muted>{a.actor}</Txt>
        </View>
      ))}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------- screen
export default function AdminScreen() {
  const [tab, setTab] = useState<Tab>('overview');
  const allowed = useQuery({ queryKey: ['is-admin-screen'], queryFn: api.isAdmin });
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Administration' }} />
      {allowed.isLoading ? <Loading /> : !allowed.data ? (
        <Card><Txt>Accès réservé aux administrateurs. Connectez-vous avec un compte administrateur.</Txt>
          <Button label="Se connecter" onPress={() => router.push('/auth')} /></Card>
      ) : (
        <>
          <Row style={{ flexWrap: 'wrap', gap: space.sm }}>{TABS.map(([k, l]) => <Pill key={k} label={l} active={tab === k} onPress={() => setTab(k)} />)}</Row>
          {tab === 'overview' ? <Overview /> : tab === 'services' ? <Services /> : tab === 'jobs' ? <Jobs /> : tab === 'anomalies' ? <Anomalies /> : tab === 'users' ? <Users />
            : tab === 'assets' ? <Assets /> : tab === 'actions' ? <Actions /> : tab === 'analysts' ? <Analysts /> : <Audit />}
        </>
      )}
    </Screen>
  );
}

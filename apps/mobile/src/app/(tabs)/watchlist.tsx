import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, TextInput, View } from 'react-native';
import { ENTITLEMENTS } from '@chart-boursafrikia/core';
import { ImportReview } from '../../components/ImportReview';
import { ContributionBar, PERIOD_LABEL, PortfolioAsk, PortfolioPanel, PositionEditor, usePortfolio } from '../../components/Portfolio';
import { Button, Card, Loading, Pill, Row, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { ApiError, api, type ImportCandidate } from '../../lib/api';
import { prepImage } from '../../lib/imagePrep';
import { sectorLabel } from '../../lib/demo';
import { fmtDate, fmtNum, fmtPct, fmtPrice } from '../../lib/format';
import { DEMO_MODE, supabase } from '../../lib/supabase';
import { useSettings } from '../../settings';
import { changeColor, radius, space, useTheme } from '../../theme';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGES = 4;
type Picked = { key: string; base64: string; mediaType: string };

export default function Watchlist() {
  const th = useTheme();
  const { t, lang } = useT();
  const fr = lang === 'fr';
  const { plan, listCurrency, setListCurrency } = useSettings();
  const fx = useQuery({ queryKey: ['fx'], queryFn: api.fxRates, staleTime: 3600_000 });
  const money = (v: number | null | undefined, cur: string) => fmtPrice(v, cur as never, lang, listCurrency, fx.data);
  const qc = useQueryClient();
  const ids = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const all = useQuery({ queryKey: ['search', '', undefined], queryFn: () => api.search(''), enabled: !!ids.data?.length });
  const user = useQuery({ queryKey: ['user'], queryFn: async () => (supabase ? (await supabase.auth.getUser()).data.user : null) });
  const rows = (all.data ?? []).filter((a) => ids.data?.includes(a.id));
  const pos = useQuery({ queryKey: ['positions', ids.data?.length ?? 0], queryFn: api.positions, enabled: !!ids.data?.length });
  const [editing, setEditing] = useState<string | null>(null);
  const pf = usePortfolio(ids.data?.length ?? 0);
  const pd = pf.q.data && !pf.q.data.empty ? pf.q.data : null;
  const contrib = new Map((pd?.lines ?? []).map((l) => [l.assetId, l]));
  const maxAbs = Math.max(0.0001, ...(pd?.lines ?? []).map((l) => Math.abs(l.contributionPts ?? 0)));
  const staleCut = pd ? new Date(Date.parse(`${pd.end}T12:00:00Z`) - 10 * 86400_000).toISOString().slice(0, 10) : '';
  const periodLong = fr ? PERIOD_LABEL[pf.period].longFr : PERIOD_LABEL[pf.period].longEn;
  // Lines sorted by contribution over the period (largest first), then the others.
  const sortedRows = [...rows].sort((x, y) => (contrib.get(y.id)?.contributionPts ?? -1e9) - (contrib.get(x.id)?.contributionPts ?? -1e9));

  const [reading, setReading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [found, setFound] = useState<{ matched: ImportCandidate[]; unmatched: string[]; totalValue: number | null; totalCurrency: string | null } | null>(null);
  const [note, setNote] = useState('');
  const [tray, setTray] = useState<Picked[]>([]);

  const max = plan === 'premium' ? ENTITLEMENTS.premium.watchlistItems : ENTITLEMENTS.free.watchlistItems;

  async function pickImages() {
    setMsg(null);
    if (user.isFetched && !user.data) { router.push('/auth'); return; }
    const room = MAX_IMAGES - tray.length;
    if (room <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.6, allowsMultipleSelection: true, selectionLimit: room, orderedSelection: true });
    if (res.canceled || !res.assets.length) return;
    const added: Picked[] = [];
    let skipped = 0;
    for (const a of res.assets) {
      let b64 = a.base64 ?? null;
      let mt = a.mimeType ?? null;
      if ((!b64 || !mt) && a.uri.startsWith('data:')) { const m = /^data:([^;]+);base64,(.*)$/.exec(a.uri); if (m) { mt = mt ?? m[1]!; b64 = b64 ?? m[2]!; } }
      if (!b64) continue;
      mt = mt === 'image/jpg' ? 'image/jpeg' : mt ?? 'image/jpeg';
      if (!ALLOWED.includes(mt)) { skipped++; continue; }
      const p = await prepImage(b64, mt);
      added.push({ key: `${Date.now()}-${added.length}-${a.assetId ?? a.uri.slice(-12)}`, ...p });
    }
    const next = [...tray, ...added];
    if (next.length > MAX_IMAGES) setMsg(fr ? `4 images maximum : seules les 4 premières sont gardées.` : '4 images max: only the first 4 are kept.');
    else if (skipped) setMsg(fr ? 'Format non pris en charge pour certaines images : utilisez des captures PNG ou JPEG.' : 'Some images have an unsupported format: use PNG or JPEG.');
    setTray(next.slice(0, MAX_IMAGES));
  }

  async function importFromImages() {
    if (!tray.length) return;
    setMsg(null);
    const images = tray.map(({ base64, mediaType }) => ({ base64, mediaType }));
    setReading(true); setFound(null);
    try {
      const r = await api.importWatchlistFromImages(images, lang, note.trim() || undefined);
      setFound({ matched: r.matched, unmatched: r.unmatched, totalValue: r.totalValue, totalCurrency: r.totalCurrency });
      setTray([]); setNote('');
      if (!r.matched.length) setMsg(r.readable
        ? (fr ? 'Aucun titre de la BRVM, de la BVMAC ou de la NGX n’a été reconnu sur ces images.' : 'No BRVM, BVMAC or NGX stock was recognised on these images.')
        : (fr ? 'Aucune liste de titres lisible sur ces images. Essayez une capture plus nette.' : 'No readable list of stocks on these images. Try a sharper screenshot.'));
    } catch (e) {
      const code = (e as ApiError).code;
      setMsg(code === 'AUTH_REQUIRED' ? (fr ? 'Connectez-vous pour importer une capture.' : 'Sign in to import a screenshot.')
        : code === 'QUOTA_EXCEEDED' ? (fr ? `Limite de ${ENTITLEMENTS.free.aiAnalysesPerDay} lectures IA par jour atteinte. Passez à Premium pour continuer.` : `Daily limit of ${ENTITLEMENTS.free.aiAnalysesPerDay} AI readings reached.`)
        : code === 'IMAGE_TOO_LARGE' ? (fr ? 'Image trop lourde (5 Mo maximum).' : 'Image too large (5 MB max).')
        : t.common.error);
    } finally { setReading(false); }
  }

  const [organize, setOrganize] = useState<'contribution' | 'weight' | 'performance' | 'sector' | 'market'>('contribution');
  const [minWeight, setMinWeight] = useState<0 | 1 | 5 | 10>(0);
  const renderRow = (a: (typeof rows)[number]) => {
            const l = contrib.get(a.id);
            const c0 = l?.contributionPts ?? null;
            const c = c0 != null && Math.abs(c0) < 0.005 ? 0 : c0;
            const stale = !!(l?.lastDate && staleCut && l.lastDate < staleCut);
            const p = pos.data?.[a.id];
            const value = p?.quantity != null && a.last != null ? p.quantity * a.last : null;
            const pnl = value != null && p?.cost != null ? value - p.cost : null;
            return (
              <View key={a.id} style={{ borderBottomWidth: 1, borderBottomColor: th.grid }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, gap: space.sm }}>
                  <Pressable onPress={() => router.push(`/asset/${encodeURIComponent(a.id)}`)} style={{ flex: 1, flexDirection: 'row', borderRadius: radius.sm }}>
                    <View style={{ flex: 1 }}>
                      <Txt weight="700">{a.ticker} <Txt size="xs" muted>{a.market}</Txt></Txt>
                      <Txt size="xs" muted numberOfLines={1}>{a.name}</Txt>
                      {p?.quantity != null ? (
                        <Txt size="xs" color={th.textMuted}>
                          {fmtNum(p.quantity, lang, p.quantity % 1 ? 2 : 0)} {fr ? (p.quantity > 1 ? 'actions' : 'action') : p.quantity > 1 ? 'shares' : 'share'}{value != null ? ` · ${money(value, a.currency)}` : ''}
                          {pnl != null ? <Txt size="xs" weight="700" color={changeColor(th, pnl)}> · {pnl > 0 ? '+' : ''}{money(pnl, a.currency)} ({fmtPct(p!.cost ? (pnl / p!.cost) * 100 : null, lang)})</Txt> : null}
                        </Txt>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt size="sm">{money(a.last, a.currency)}</Txt>
                      <Txt size="xs" weight="700" color={changeColor(th, a.changePct)}>{fmtPct(a.changePct, lang)} {fr ? 'jour' : 'day'}</Txt>
                      {pd ? <Txt weight="800" color={changeColor(th, c)}>{c == null ? '—' : `${c > 0 ? '+' : ''}${fmtNum(c, lang, 2)} pt${Math.abs(c) >= 2 ? 's' : ''}`}</Txt> : null}
                    </View>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={fr ? `Modifier la position ${a.ticker}` : `Edit position ${a.ticker}`} hitSlop={8}
                    onPress={() => setEditing(editing === a.id ? null : a.id)}
                    style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: p?.quantity != null ? th.accent : th.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size="sm" color={p?.quantity != null ? th.accent : th.textMuted}>✎</Txt>
                  </Pressable>
                </View>
                {pd && l ? (
                  <View style={{ gap: 4, paddingBottom: space.sm }}>
                    <Txt size="xs" muted>
                      {fr ? 'Poids' : 'Weight'} {l.weightPct != null ? `${fmtNum(l.weightPct, lang, 1)} %` : (fr ? 'n.c. (quantité non renseignée)' : 'n/a (no shares)')} · {fr ? 'Var.' : 'Chg'} {periodLong} {fmtPct(l.returnPct, lang)}
                    </Txt>
                    <ContributionBar value={c} maxAbs={maxAbs} />
                    {stale ? <Txt size="xs" color={th.warn}>{fr ? `Dernière cotation le ${fmtDate(l.lastDate, lang)}` : `Last traded ${fmtDate(l.lastDate, lang)}`}</Txt> : null}
                  </View>
                ) : null}
                {editing === a.id ? <PositionEditor assetId={a.id} currency={a.currency} quantity={p?.quantity ?? null} cost={p?.cost ?? null} onDone={() => setEditing(null)} /> : null}
              </View>
            );
  };
  const num = (v: number | null | undefined) => (v == null ? -1e9 : v);
  const visible = sortedRows.filter((a) => minWeight === 0 || (contrib.get(a.id)?.weightPct ?? -1) >= minWeight);
  const hiddenByWeight = sortedRows.length - visible.length;
  const byKey = (a: (typeof rows)[number]) => (organize === 'weight' ? num(contrib.get(a.id)?.weightPct) : organize === 'performance' ? num(contrib.get(a.id)?.returnPct) : num(contrib.get(a.id)?.contributionPts));
  const ordered = [...visible].sort((x, y) => byKey(y) - byKey(x));
  type Group = { key: string; title: string | null; items: typeof rows; weight: number | null; contribution: number | null };
  const groups: Group[] = (() => {
    if (organize !== 'sector' && organize !== 'market') return [{ key: 'all', title: null, items: ordered, weight: null, contribution: null }];
    const m = new Map<string, typeof rows>();
    for (const a of ordered) {
      const k = organize === 'market' ? a.market : a.sector ?? '_none';
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    const sum = (items: typeof rows, f: (l: NonNullable<ReturnType<typeof contrib.get>>) => number | null | undefined) => {
      const vals = items.map((a) => { const l = contrib.get(a.id); return l ? f(l) : null; }).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((s2, v) => s2 + v, 0) : null;
    };
    const MARKET_NAME: Record<string, string> = { BRVM: 'BRVM · UEMOA', BVMAC: 'BVMAC · CEMAC', NGX: 'NGX · Nigeria' };
    return [...m.entries()].map(([k, items]) => ({
      key: k, items,
      title: organize === 'market' ? MARKET_NAME[k] ?? k : k === '_none' ? (fr ? 'Secteur non renseigné' : 'Sector not available') : sectorLabel(k, lang),
      weight: sum(items, (l) => l.weightPct), contribution: ((v) => (v != null && Math.abs(v) < 0.005 ? 0 : v))(sum(items, (l) => l.contributionPts)),
    })).sort((x, y) => num(y.contribution ?? (y.weight ?? null)) - num(x.contribution ?? (x.weight ?? null)));
  })();

  return (
    <Screen refreshing={ids.isRefetching} onRefresh={() => ids.refetch()}>
      <Txt size="xl" weight="800">{t.watchlist.title}</Txt>
      <View style={{ gap: 4 }}>
        <Txt size="xs" muted>{fr ? 'Devise d’affichage' : 'Display currency'}</Txt>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: space.sm }}>
          {([['XOF', 'FCFA', 'XOF · UEMOA'], ['XAF', 'FCFA', 'XAF · CEMAC'], ['EUR', '€', 'EUR'], ['USD', '$', 'USD']] as const).map(([c, sym, sub]) => {
            const on = listCurrency === c;
            return (
              <Pressable key={c} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setListCurrency(c)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: on ? th.accent : th.border, backgroundColor: on ? th.accent : th.card }}>
                <Txt weight="800" color={on ? th.accentText : th.text}>{sym}</Txt>
                <Txt size="xs" color={on ? th.accentText : th.textMuted}>{sub}</Txt>
              </Pressable>
            );
          })}
        </View>
        {listCurrency === 'USD' || rows.some((a) => a.currency === 'NGN') ? <Txt size="xs" muted>{fr ? 'Conversion au dernier taux de change disponible. FCFA ↔ euro : parité fixe (1 € = 655,957 FCFA).' : 'Converted at the latest available rate. FCFA ↔ euro: fixed parity.'}</Txt> : null}
      </View>
      {plan === 'free' ? <Txt size="xs" muted>{t.watchlist.limit}</Txt> : null}
      {DEMO_MODE ? <Txt size="sm" muted>{fr ? 'Les listes de suivi sont enregistrées dans votre compte (backend requis).' : 'Watchlists are saved to your account (backend required).'}</Txt> : null}

      <Card style={{ borderColor: th.accent, borderWidth: 1 }}>
        <Txt weight="800">📷 {fr ? 'Créer ou mettre à jour mon portefeuille par capture d’écran' : 'Build or update my portfolio from a screenshot'}</Txt>
        <Txt size="sm" muted>{fr
          ? 'Capture de votre application de courtier, d’un relevé de portefeuille ou d’une liste : l’IA lit les titres (BRVM, BVMAC, NGX), le nombre de titres, le PRU, la valorisation et les plus-values, puis vous proposez d’ajouter ou de mettre à jour vos lignes. Jusqu’à 4 images.'
          : 'Screenshot of your broker app, a portfolio, a newspaper or a list: the AI recognises BRVM, BVMAC and NGX stocks. Up to 4 images.'}</Txt>
        {tray.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {tray.map((im, i) => (
              <View key={im.key} style={{ width: 72, height: 96, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: th.border, backgroundColor: th.cardAlt }}>
                <Image source={{ uri: `data:${im.mediaType};base64,${im.base64}` }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={`${fr ? 'Image' : 'Image'} ${i + 1}`} />
                <Pressable accessibilityRole="button" accessibilityLabel={fr ? `Retirer l’image ${i + 1}` : `Remove image ${i + 1}`} hitSlop={8} disabled={reading}
                  onPress={() => setTray((tr) => tr.filter((x) => x.key !== im.key))}
                  style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size="xs" weight="900" color="#FFFFFF">✕</Txt>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <Txt size="xs" muted>{fr ? `${tray.length} / ${MAX_IMAGES} image(s) sélectionnée(s) — vous pouvez en choisir plusieurs à la fois.` : `${tray.length} / ${MAX_IMAGES} image(s) selected — you can pick several at once.`}</Txt>
        {tray.length < MAX_IMAGES ? (
          <Button label={tray.length ? (fr ? 'Ajouter d’autres images' : 'Add more images') : (fr ? 'Choisir jusqu’à 4 images' : 'Choose up to 4 images')} variant={tray.length ? 'secondary' : 'primary'} icon="📷" disabled={reading} onPress={pickImages} />
        ) : null}
        {tray.length ? (
          <View style={{ gap: 4 }}>
            <Txt size="xs" muted>{fr ? 'Message à l’IA (facultatif)' : 'Message to the AI (optional)'}</Txt>
            <TextInput value={note} onChangeText={setNote} multiline maxLength={600}
              placeholder={fr ? 'ex. : « Unités » = nombre de titres que je détiens ; la 2e colonne est le PRU ; ne garde que les titres BRVM…' : 'e.g. the 2nd column is the average cost; keep only BRVM stocks…'}
              placeholderTextColor={th.textMuted} accessibilityLabel={fr ? 'Message à l’IA' : 'Message to the AI'}
              style={{ backgroundColor: th.bg, color: th.text, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: th.border, minHeight: 60, maxHeight: 120, fontSize: 14 }} />
          </View>
        ) : null}
        {tray.length ? <Button label={fr ? `Lire ${tray.length > 1 ? `les ${tray.length} images` : 'l’image'} avec l’IA` : `Read ${tray.length} image(s) with AI`} icon="✦" loading={reading} onPress={importFromImages} /> : null}
        {reading ? <Txt size="sm" muted>✦ {fr ? 'L’IA lit vos images… (5 à 20 secondes)' : 'The AI is reading your images… (5 to 20 seconds)'}</Txt> : null}
        {msg ? <Txt size="sm" color={msg.startsWith('✓') ? th.up : th.warn}>{msg}</Txt> : null}
      </Card>

      {found && found.matched.length ? (
        <ImportReview matched={found.matched} unmatched={found.unmatched} totalValue={found.totalValue} totalCurrency={found.totalCurrency}
          watched={ids.data ?? []} positions={pos.data ?? {}} max={max} plan={plan}
          onDone={(m) => { setFound(null); setMsg(m); }} onCancel={() => setFound(null)} />
      ) : null}

      <PortfolioPanel count={ids.data?.length ?? 0} pf={pf} />
      {ids.data?.length ? <PortfolioAsk hasQuantities={Object.values(pos.data ?? {}).some((p) => p.quantity != null)} /> : null}

      {ids.isLoading ? <Loading /> : !ids.data?.length ? <Card><Txt muted>{fr ? 'Votre liste est vide. Ajoutez des titres depuis leur fiche (☆) ou importez une capture d’écran ci-dessus.' : t.watchlist.empty}</Txt></Card> : (
        <Card title={fr ? `Mes titres & contributions (${rows.length})` : `My stocks & contributions (${rows.length})`}>
          <Txt size="xs" muted>{fr
            ? `${{ contribution: 'Classés par contribution', weight: 'Classés par poids', performance: 'Classés par performance', sector: 'Regroupés par secteur d’activité', market: 'Regroupés par bourse' }[organize]} — contribution à la performance ${periodLong} en points de % (la somme donne la performance totale). Touchez ✎ pour indiquer le nombre d’actions et le montant investi (facultatif).`
            : `Sorted by contribution to performance ${periodLong} (in % points). Tap ✎ to enter shares and amount invested (optional).`}</Txt>
          <View style={{ gap: 6 }}>
            <Txt size="xs" muted>{fr ? 'Organiser par' : 'Organise by'}</Txt>
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              {([['contribution', fr ? 'Contribution' : 'Contribution'], ['weight', fr ? 'Poids' : 'Weight'], ['performance', fr ? 'Performance' : 'Performance'], ['sector', fr ? 'Secteur' : 'Sector'], ['market', fr ? 'Bourse' : 'Exchange']] as const)
                .map(([k, l]) => <Pill key={k} label={l} active={organize === k} onPress={() => setOrganize(k)} />)}
            </Row>
            <Txt size="xs" muted>{fr ? 'Poids minimum dans le portefeuille' : 'Minimum weight in portfolio'}</Txt>
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              {([0, 1, 5, 10] as const).map((w) => <Pill key={w} label={w === 0 ? (fr ? 'Tous' : 'All') : `≥ ${w} %`} active={minWeight === w} onPress={() => setMinWeight(w)} />)}
            </Row>
            {minWeight > 0 && pd?.mode === 'equal' ? <Txt size="xs" color={th.info}>{fr ? 'Sans nombre d’actions renseigné, chaque titre pèse le même poids.' : 'Without share counts, every stock has the same weight.'}</Txt> : null}
            {minWeight > 0 && hiddenByWeight ? <Txt size="xs" muted>{fr ? `${hiddenByWeight} titre(s) masqué(s) (poids inférieur ou non renseigné).` : `${hiddenByWeight} stock(s) hidden.`}</Txt> : null}
          </View>
          {groups.map((g) => (
            <View key={g.key} style={{ gap: 0 }}>
              {g.title ? (
                <View style={{ marginTop: space.md, paddingVertical: 6, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: th.cardAlt, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm }}>
                  <Txt weight="800" style={{ flex: 1 }} numberOfLines={2}>{g.title} <Txt size="xs" muted>({g.items.length})</Txt></Txt>
                  <View style={{ alignItems: 'flex-end' }}>
                    {g.weight != null ? <Txt size="xs" muted>{fr ? 'Poids' : 'Weight'} {fmtNum(g.weight, lang, 1)} %</Txt> : null}
                    {g.contribution != null ? <Txt size="sm" weight="800" color={changeColor(th, g.contribution)}>{g.contribution > 0 ? '+' : ''}{fmtNum(g.contribution, lang, 2)} pt{Math.abs(g.contribution) >= 2 ? 's' : ''}</Txt> : null}
                  </View>
                </View>
              ) : null}
              {g.items.map((a) => renderRow(a))}
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

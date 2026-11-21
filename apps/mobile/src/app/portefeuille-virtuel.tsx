// Virtual portfolio (simulation): virtual cash, buy/sell at the last verified close, positions and performance.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { convert, formatMoney, type CurrencyCode, marketLabel } from '@chart-boursafrikia/core';
import { Button, Card, ErrorBox, KV, Loading, Row, Screen, Txt } from '../components/ui';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { supabase, currentUser } from '../lib/supabase';
import { fmtDate, fmtNum, fmtPct } from '../lib/format';
import { changeColor, radius, space, useTheme } from '../theme';

export default function VirtualPortfolioScreen() {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const user = useQuery({ queryKey: ['user'], queryFn: currentUser, staleTime: Infinity });
  const pf = useQuery({ queryKey: ['vportfolio'], queryFn: api.virtualPortfolio, enabled: !!user.data });
  const all = useQuery({ queryKey: ['search', '', undefined], queryFn: () => api.search('') });
  const fx = useQuery({ queryKey: ['fx'], queryFn: api.fxRates, staleTime: 3600_000 });
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const base = (pf.data?.currency ?? 'XOF') as CurrencyCode;
  const byId = useMemo(() => new Map((all.data ?? []).map((a) => [a.id, a])), [all.data]);
  const toBase = (v: number, cur: string) => convert(v, cur as CurrencyCode, base, fx.data) ?? v;
  const money = (v: number | null | undefined) => (v == null ? '—' : formatMoney(v, base, lang));

  // Positions and cash from the transaction log (amounts converted to the portfolio currency at today's rate).
  const book = useMemo(() => {
    const pos = new Map<string, { qty: number; cost: number }>();
    let cash = pf.data?.startingCash ?? 0;
    for (const t of pf.data?.tx ?? []) {
      const a = byId.get(t.asset_id); const cur = a?.currency ?? 'XOF';
      const p = pos.get(t.asset_id) ?? { qty: 0, cost: 0 };
      const amt = toBase(t.quantity * t.price, cur);
      if (t.side === 'buy') { p.cost += amt; p.qty += t.quantity; cash -= amt + t.fees; }
      else if (t.side === 'sell') { const avg = p.qty ? p.cost / p.qty : 0; p.cost -= avg * t.quantity; p.qty -= t.quantity; cash += amt - t.fees; }
      pos.set(t.asset_id, p);
    }
    const lines = [...pos.entries()].filter(([, p]) => p.qty > 1e-9).map(([id, p]) => {
      const a = byId.get(id);
      const value = a?.last != null ? toBase(p.qty * a.last, a.currency) : null;
      return { id, a, qty: p.qty, cost: p.cost, value, pnl: value != null ? value - p.cost : null };
    }).sort((x, y) => (y.value ?? 0) - (x.value ?? 0));
    const invested = lines.reduce((s, l) => s + (l.value ?? l.cost), 0);
    const total = cash + invested;
    return { cash, lines, total, perf: pf.data ? (total / pf.data.startingCash - 1) * 100 : null };
  }, [pf.data, byId, fx.data]);

  const results = query.trim().length >= 2 ? (all.data ?? []).filter((a) => `${a.ticker} ${a.name}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : [];
  const asset = sel ? byId.get(sel) : null;
  const held = sel ? book.lines.find((l) => l.id === sel)?.qty ?? 0 : 0;
  const q = Number(qty.replace(',', '.'));
  const orderValue = asset?.last != null && q > 0 ? toBase(q * asset.last, asset.currency) : null;

  async function trade(side: 'buy' | 'sell') {
    setMsg(null);
    if (!pf.data || !asset || asset.last == null) return;
    if (!(q > 0) || !Number.isInteger(q)) { setMsg(fr ? 'Indiquez un nombre entier d’actions.' : 'Enter a whole number of shares.'); return; }
    if (side === 'buy' && orderValue! > book.cash + 1e-6) { setMsg(fr ? `Liquidités insuffisantes (${money(book.cash)} disponibles).` : 'Not enough cash.'); return; }
    if (side === 'sell' && q > held) { setMsg(fr ? `Vous ne détenez que ${fmtNum(held, lang, 0)} action(s).` : `You only hold ${held} share(s).`); return; }
    setBusy(true);
    try {
      await api.virtualTrade(pf.data.id, asset.id, side, q, asset.last);
      await qc.invalidateQueries({ queryKey: ['vportfolio'] });
      setMsg(`✓ ${side === 'buy' ? (fr ? 'Achat' : 'Bought') : (fr ? 'Vente' : 'Sold')} : ${q} ${asset.ticker} à ${fmtNum(asset.last, lang, asset.last < 100 ? 2 : 0)} ${asset.currency === 'XOF' || asset.currency === 'XAF' ? 'FCFA' : asset.currency}`);
      setQty('');
    } catch { setMsg(fr ? 'Ordre impossible.' : 'Order failed.'); } finally { setBusy(false); }
  }
  async function reset() {
    if (!pf.data) return;
    setBusy(true);
    try { await api.virtualReset(pf.data.id); await qc.invalidateQueries({ queryKey: ['vportfolio'] }); setMsg(fr ? '✓ Portefeuille virtuel réinitialisé.' : '✓ Virtual portfolio reset.'); } finally { setBusy(false); }
  }

  if (user.isFetched && !user.data) return (
    <Screen edges={[]}><Stack.Screen options={{ title: fr ? 'Portefeuille virtuel' : 'Virtual portfolio' }} />
      <Card><Txt weight="700">{fr ? 'Connectez-vous pour utiliser le portefeuille virtuel.' : 'Sign in to use the virtual portfolio.'}</Txt><Button label={fr ? 'Se connecter' : 'Sign in'} onPress={() => router.push('/auth')} /></Card>
    </Screen>
  );
  if (pf.isLoading || all.isLoading) return <Screen edges={[]}><Loading /></Screen>;
  if (pf.error || !pf.data) return <Screen edges={[]}><ErrorBox message={fr ? 'Portefeuille indisponible.' : 'Portfolio unavailable.'} onRetry={() => pf.refetch()} /></Screen>;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: fr ? 'Portefeuille virtuel' : 'Virtual portfolio' }} />
      <Card style={{ borderColor: th.accent, borderWidth: 1 }}>
        <Txt size="xs" muted>{fr ? `Simulation · capital de départ ${money(pf.data.startingCash)}` : `Simulation · starting capital ${money(pf.data.startingCash)}`}</Txt>
        <Txt size="xxl" weight="800">{money(book.total)}</Txt>
        <Txt weight="700" color={changeColor(th, book.perf)}>{fmtPct(book.perf, lang)} {fr ? 'depuis le début' : 'since start'}</Txt>
        <KV label={fr ? 'Liquidités disponibles' : 'Available cash'} value={money(book.cash)} />
        <KV label={fr ? 'Valeur des titres' : 'Stocks value'} value={money(book.total - book.cash)} />
        <Txt size="xs" muted>{fr ? 'Ordres exécutés au dernier cours de clôture vérifié, sans frais. Titres NGX convertis au taux du jour. Aucun argent réel n’est engagé.' : 'Orders filled at the last verified close, no fees. NGX stocks converted at today’s rate. No real money involved.'}</Txt>
      </Card>

      <Card title={fr ? 'Passer un ordre' : 'Place an order'}>
        <TextInput value={query} onChangeText={(v) => { setQuery(v); setSel(null); }} placeholder={fr ? 'Rechercher un titre (ex. SONATEL, MTNN)…' : 'Search a stock…'} placeholderTextColor={th.textMuted} autoCapitalize="characters"
          style={{ backgroundColor: th.bg, color: th.text, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: th.border }} accessibilityLabel={fr ? 'Rechercher un titre' : 'Search a stock'} />
        {!sel ? results.map((a) => (
          <Pressable key={a.id} onPress={() => { setSel(a.id); setQuery(`${a.ticker} · ${a.name}`); }} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: th.grid }}>
            <Txt weight="700">{a.ticker} <Txt size="xs" muted>{marketLabel(a.market)} · {a.name}</Txt></Txt>
          </Pressable>
        )) : null}
        {asset ? (
          <View style={{ gap: space.sm }}>
            <KV label={fr ? 'Dernier cours' : 'Last price'} value={asset.last != null ? `${fmtNum(asset.last, lang, asset.last < 100 ? 2 : 0)} ${asset.currency === 'XOF' || asset.currency === 'XAF' ? 'FCFA' : asset.currency}${asset.asOf ? ` (${fmtDate(asset.asOf, lang)})` : ''}` : '—'} />
            {held ? <KV label={fr ? 'Détenu' : 'Held'} value={`${fmtNum(held, lang, 0)}`} /> : null}
            <TextInput value={qty} onChangeText={setQty} keyboardType="number-pad" placeholder={fr ? 'Nombre d’actions' : 'Number of shares'} placeholderTextColor={th.textMuted}
              style={{ backgroundColor: th.bg, color: th.text, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: th.border }} accessibilityLabel={fr ? 'Nombre d’actions' : 'Number of shares'} />
            {orderValue != null ? <Txt size="sm" muted>{fr ? 'Montant de l’ordre' : 'Order amount'} : {money(orderValue)}</Txt> : null}
            <Row gap={space.sm}>
              <View style={{ flex: 1 }}><Button label={fr ? 'Acheter' : 'Buy'} loading={busy} disabled={asset.last == null} onPress={() => trade('buy')} /></View>
              <View style={{ flex: 1 }}><Button label={fr ? 'Vendre' : 'Sell'} variant="secondary" disabled={!held || busy} onPress={() => trade('sell')} /></View>
            </Row>
          </View>
        ) : null}
        {msg ? <Txt size="sm" color={msg.startsWith('✓') ? th.up : th.warn}>{msg}</Txt> : null}
      </Card>

      <Card title={fr ? `Positions (${book.lines.length})` : `Positions (${book.lines.length})`}>
        {!book.lines.length ? <Txt muted>{fr ? 'Aucune position. Achetez un titre ci-dessus pour démarrer la simulation.' : 'No position yet.'}</Txt> : book.lines.map((l) => (
          <Pressable key={l.id} onPress={() => router.push(`/asset/${encodeURIComponent(l.id)}`)} style={{ flexDirection: 'row', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: th.grid }}>
            <View style={{ flex: 1 }}>
              <Txt weight="700">{l.a?.ticker ?? l.id} <Txt size="xs" muted>{marketLabel(l.a?.market)}</Txt></Txt>
              <Txt size="xs" muted>{fmtNum(l.qty, lang, 0)} {fr ? 'actions' : 'shares'} · {fr ? 'investi' : 'cost'} {money(l.cost)}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt size="sm" weight="700">{money(l.value)}</Txt>
              <Txt size="xs" weight="700" color={changeColor(th, l.pnl)}>{l.pnl != null ? `${l.pnl > 0 ? '+' : ''}${money(l.pnl)} (${fmtPct(l.cost ? (l.pnl / l.cost) * 100 : null, lang)})` : '—'}</Txt>
            </View>
          </Pressable>
        ))}
      </Card>

      {pf.data.tx.length ? (
        <Card title={fr ? 'Historique des ordres' : 'Order history'} collapsible defaultOpen={false} badge={pf.data.tx.length}>
          {[...pf.data.tx].reverse().map((t) => (
            <Row key={t.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Txt size="sm">{fmtDate(t.executed_on, lang)} · {t.side === 'buy' ? (fr ? 'Achat' : 'Buy') : (fr ? 'Vente' : 'Sell')} {fmtNum(t.quantity, lang, 0)} {byId.get(t.asset_id)?.ticker ?? t.asset_id}</Txt>
              <Txt size="sm" muted>{fmtNum(t.price, lang, t.price < 100 ? 2 : 0)}</Txt>
            </Row>
          ))}
          <Button label={fr ? 'Réinitialiser le portefeuille virtuel' : 'Reset virtual portfolio'} variant="ghost" onPress={reset} />
        </Card>
      ) : null}
      <Txt size="xs" muted>{fr ? 'Outil pédagogique de simulation : les performances passées ou simulées ne préjugent pas des performances futures.' : 'Educational simulation tool: past or simulated performance is no guide to future performance.'}</Txt>
    </Screen>
  );
}

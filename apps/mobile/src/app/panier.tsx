// « Mon panier » : stocks to buy / sell today, as a checklist the user ticks off and can print (PDF).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { BasketForm, basketHtml, useBasket } from '../components/Basket';
import { Button, Card, Disclaimer, Loading, Row, Screen, Txt } from '../components/ui';
import { useT } from '../i18n';
import { api, type BasketItem } from '../lib/api';
import { formatMoney } from '@chart-boursafrikia/core';
import { fmtDate, fmtPct } from '../lib/format';
import { printHtml } from '../lib/printDoc';
import { changeColor, radius, space, useTheme } from '../theme';

export default function BasketScreen() {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const { user, data, isLoading, isFetched } = useBasket();
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['basket'] });
  const toggle = useMutation({ mutationFn: (i: BasketItem) => api.basketUpdate(i.id, { done: !i.done }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (ids: string[]) => api.basketDelete(ids), onSuccess: refresh });
  const items = data ?? [];
  const title = fr ? 'Mon panier' : 'My basket';

  if (!user && isFetched !== false) return (
    <Screen edges={[]}><Stack.Screen options={{ title }} />
      <Card><Txt weight="700">{fr ? 'Connectez-vous pour préparer votre panier d’achats et de ventes.' : 'Sign in to use the basket.'}</Txt><Button label={fr ? 'Se connecter' : 'Sign in'} onPress={() => router.push('/auth')} /></Card>
    </Screen>
  );

  const print = () => {
    setMsg(null);
    // Called synchronously from the tap (pop-up allowed).
    printHtml(basketHtml(items, lang), { title: fr ? 'Panier du jour' : 'Daily basket', fr })
      .then((how) => setMsg(how === 'tab' ? (fr ? '✓ Check-list ouverte dans un nouvel onglet : touchez « Imprimer / Enregistrer en PDF ».' : '✓ Checklist opened in a new tab.') : how === 'native' ? null : (fr ? '✓ Aperçu ouvert : touchez « Imprimer / Enregistrer en PDF ».' : '✓ Preview opened.')))
      .catch(() => setMsg(fr ? 'Impression impossible.' : 'Printing failed.'));
  };

  const section = (side: 'buy' | 'sell') => {
    const list = items.filter((i) => i.side === side);
    const totals = new Map<string, number>();
    list.forEach((i) => { const px = i.limit_price ?? i.last; if (i.quantity != null && px != null) totals.set(i.currency, (totals.get(i.currency) ?? 0) + i.quantity * px); });
    const col = side === 'buy' ? th.up : th.down;
    return (
      <Card title={`${side === 'buy' ? (fr ? '🟢 À acheter' : '🟢 To buy') : (fr ? '🔴 À vendre' : '🔴 To sell')} (${list.length})`}>
        {!list.length ? <Txt size="sm" muted>{fr ? 'Aucun titre. Ajoutez-en depuis la fiche d’un titre (bouton « 🛒 Panier »).' : 'Nothing yet. Add from a stock page.'}</Txt> : list.map((i) => {
          const px = i.limit_price ?? i.last;
          const amt = i.quantity != null && px != null ? i.quantity * px : null;
          const gap = i.limit_price != null && i.last ? (i.limit_price / i.last - 1) * 100 : null;
          return (
            <View key={i.id} style={{ borderTopWidth: 1, borderTopColor: th.grid, paddingVertical: space.sm, gap: 6, opacity: i.done ? 0.55 : 1 }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Pressable onPress={() => toggle.mutate(i)} accessibilityRole="checkbox" accessibilityState={{ checked: i.done }} hitSlop={8}
                  style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: col, backgroundColor: i.done ? col : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                  {i.done ? <Txt weight="800" color="#fff">✓</Txt> : null}
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/asset/${encodeURIComponent(i.asset_id)}`)}>
                  <Txt weight="800" style={{ textDecorationLine: i.done ? 'line-through' : 'none' }}>{i.ticker} <Txt size="xs" muted>{i.name} · {i.market}</Txt></Txt>
                  <Txt size="xs" muted>
                    {fr ? 'Dernier cours' : 'Last'} {i.last != null ? formatMoney(i.last, i.currency as never, lang) : '—'}{i.lastDate ? ` (${fmtDate(i.lastDate, lang)})` : ''}
                    {i.changePct != null ? <Txt size="xs" color={changeColor(th, i.changePct)}> {fmtPct(i.changePct, lang)}</Txt> : null}
                  </Txt>
                </Pressable>
                <Pressable onPress={() => setEditing(editing === i.id ? null : i.id)} hitSlop={8}><Txt color={th.info} size="sm">{editing === i.id ? (fr ? 'Fermer' : 'Close') : (fr ? 'Modifier' : 'Edit')}</Txt></Pressable>
              </Row>
              <Row style={{ flexWrap: 'wrap', paddingLeft: 36 }} gap={space.md}>
                <Txt size="sm">{fr ? 'Qté' : 'Qty'} : <Txt size="sm" weight="700">{i.quantity ?? '—'}</Txt></Txt>
                <Txt size="sm">{fr ? 'Limite' : 'Limit'} : <Txt size="sm" weight="700">{i.limit_price != null ? formatMoney(i.limit_price, i.currency as never, lang) : (fr ? 'au marché' : 'market')}</Txt>{gap != null ? <Txt size="xs" muted> ({fmtPct(gap, lang, 1)} {fr ? 'vs cours' : 'vs price'})</Txt> : null}</Txt>
                {amt != null ? <Txt size="sm">≈ <Txt size="sm" weight="700">{formatMoney(amt, i.currency as never, lang)}</Txt></Txt> : null}
              </Row>
              {i.note ? <Txt size="xs" muted style={{ paddingLeft: 36 }}>📝 {i.note}</Txt> : null}
              {editing === i.id ? (
                <View style={{ backgroundColor: th.cardAlt, borderRadius: radius.md, padding: space.md }}>
                  <BasketForm asset={{ id: i.asset_id, ticker: i.ticker, last: i.last, currency: i.currency }} onDone={() => setEditing(null)} />
                </View>
              ) : null}
            </View>
          );
        })}
        {totals.size ? <Txt size="sm" weight="700" color={col}>{fr ? 'Total estimé' : 'Estimated total'} : {[...totals].map(([c, v]) => formatMoney(v, c as never, lang)).join(' · ')}</Txt> : null}
      </Card>
    );
  };

  const done = items.filter((i) => i.done);
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title }} />
      <Card title={fr ? '🛒 Panier du jour' : '🛒 Daily basket'}>
        <Txt size="sm" muted>{fr ? 'Préparez vos arbitrages : titres à acheter et à vendre, quantité, prix limite et note. Cochez au fur et à mesure, puis imprimez la check-list pour votre SGI / courtier. Aucun ordre n’est transmis par l’application.' : 'Prepare your trades, tick them off, print the checklist. No order is sent.'}</Txt>
        <Button label={fr ? '🖨 Imprimer la check-list (PDF)' : '🖨 Print checklist (PDF)'} disabled={!items.length} onPress={print} />
        {msg ? <Txt size="sm" color={th.up}>{msg}</Txt> : null}
        {done.length ? <Button label={fr ? `Retirer les ${done.length} ligne(s) cochée(s)` : `Remove ${done.length} done`} variant="secondary" loading={del.isPending} onPress={() => del.mutate(done.map((i) => i.id))} /> : null}
      </Card>
      {isLoading ? <Loading /> : (<>{section('buy')}{section('sell')}</>)}
      {items.length ? <Pressable onPress={() => { if (confirmEmpty) { del.mutate(items.map((i) => i.id)); setConfirmEmpty(false); } else setConfirmEmpty(true); }} style={{ alignSelf: 'center', padding: space.sm }}>
        <Txt size="sm" weight={confirmEmpty ? '800' : '400'} color={th.down}>{confirmEmpty ? (fr ? `Confirmer : supprimer les ${items.length} lignes ?` : 'Confirm: empty the basket?') : (fr ? 'Vider le panier' : 'Empty basket')}</Txt>
      </Pressable> : null}
      <Disclaimer text={fr ? 'Aide-mémoire personnel, pas un conseil en investissement. Montants estimés hors frais de courtage et taxes.' : 'Personal memo, not investment advice.'} />
    </Screen>
  );
}

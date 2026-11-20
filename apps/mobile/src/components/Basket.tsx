// Trade basket (« panier ») : stocks the user plans to buy or sell, as a printable daily checklist.
// No order is sent anywhere: it is a personal memo to take to the broker (SGI / stockbroker).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useT } from '../i18n';
import { api, type BasketItem } from '../lib/api';
import { formatMoney } from '@chart-boursafrikia/core';
import { supabase } from '../lib/supabase';
import { radius, space, useTheme } from '../theme';
import { Button, Row, Txt } from './ui';

export const parseNum = (v: string): number | null => {
  const s = v.replace(/\s| | /g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function useBasket() {
  const user = useQuery({ queryKey: ['user'], queryFn: async () => (supabase ? (await supabase.auth.getUser()).data.user : null) });
  const q = useQuery({ queryKey: ['basket'], queryFn: api.basket, enabled: !!user.data });
  return { user: user.data, ...q };
}

/** Header icon with the number of pending lines. */
export function BasketIcon({ size = 16 }: { size?: number }) {
  const th = useTheme();
  const { user, data } = useBasket();
  if (!user) return null;
  const n = (data ?? []).filter((i) => !i.done).length;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={n ? `Panier : ${n} ligne(s)` : 'Panier'} onPress={() => router.push('/panier')} hitSlop={8} style={{ paddingHorizontal: 4 }}>
      <Text style={{ fontSize: size }}>🛒</Text>
      {n ? (
        <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: th.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
          <Text style={{ color: th.accentText, fontSize: 10, fontWeight: '800' }}>{n > 99 ? '99+' : n}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Field({ label, value, onChange, placeholder, numeric = true }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  const th = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 120, gap: 4 }}>
      <Txt size="xs" muted>{label}</Txt>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={th.textMuted} keyboardType={numeric ? 'decimal-pad' : 'default'} accessibilityLabel={label}
        style={{ backgroundColor: th.bg, color: th.text, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, borderWidth: 1, borderColor: th.border }} />
    </View>
  );
}

/** Add / edit a basket line for one stock. */
export function BasketForm({ asset, onDone }: { asset: { id: string; ticker: string; last: number | null; currency: string }; onDone?: () => void }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const { user, data } = useBasket();
  const existing = (data ?? []).filter((i) => i.asset_id === asset.id);
  const [side, setSide] = useState<'buy' | 'sell'>(existing[0]?.side ?? 'buy');
  const cur = existing.find((i) => i.side === side);
  const [qty, setQty] = useState(cur?.quantity != null ? String(cur.quantity) : '');
  const [limit, setLimit] = useState(cur?.limit_price != null ? String(cur.limit_price) : '');
  const [note, setNote] = useState(cur?.note ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.basketSave({ assetId: asset.id, side, quantity: parseNum(qty), limitPrice: parseNum(limit), note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['basket'] }); setMsg(fr ? `✓ Ajouté au panier (${side === 'buy' ? 'à acheter' : 'à vendre'}).` : '✓ Added to basket.'); onDone?.(); },
    onError: (e: Error & { code?: string }) => setMsg(e.code === 'BASKET_LIMIT' ? (fr ? 'Panier plein (100 lignes maximum).' : 'Basket full (100 lines).') : (fr ? 'Enregistrement impossible.' : 'Could not save.')),
  });
  const remove = useMutation({ mutationFn: () => api.basketDelete(cur ? [cur.id] : []), onSuccess: () => { qc.invalidateQueries({ queryKey: ['basket'] }); setMsg(fr ? 'Retiré du panier.' : 'Removed.'); } });
  if (!user) return (
    <View style={{ gap: space.sm }}>
      <Txt size="sm" muted>{fr ? 'Connectez-vous pour préparer votre panier d’achats et de ventes.' : 'Sign in to use the basket.'}</Txt>
      <Button label={fr ? 'Se connecter' : 'Sign in'} variant="secondary" onPress={() => router.push('/auth')} />
    </View>
  );
  const amount = parseNum(qty) != null ? parseNum(qty)! * (parseNum(limit) ?? asset.last ?? 0) : null;
  const pick = (s: 'buy' | 'sell') => {
    setSide(s);
    const e = existing.find((i) => i.side === s);
    setQty(e?.quantity != null ? String(e.quantity) : ''); setLimit(e?.limit_price != null ? String(e.limit_price) : ''); setNote(e?.note ?? '');
  };
  return (
    <View style={{ gap: space.sm }}>
      <Row>
        {(['buy', 'sell'] as const).map((s) => (
          <Pressable key={s} onPress={() => pick(s)} accessibilityRole="button" accessibilityState={{ selected: side === s }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: s === 'buy' ? th.up : th.down, backgroundColor: side === s ? (s === 'buy' ? th.up : th.down) : 'transparent' }}>
            <Txt weight="800" color={side === s ? '#fff' : s === 'buy' ? th.up : th.down}>{s === 'buy' ? (fr ? 'À acheter' : 'To buy') : (fr ? 'À vendre' : 'To sell')}{existing.some((i) => i.side === s) ? ' ✓' : ''}</Txt>
          </Pressable>
        ))}
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        <Field label={fr ? 'Nombre de titres (facultatif)' : 'Quantity (optional)'} value={qty} onChange={setQty} placeholder="ex. 50" />
        <Field label={fr ? `Prix limite (facultatif)` : 'Limit price (optional)'} value={limit} onChange={setLimit} placeholder={asset.last != null ? `${fr ? 'dernier' : 'last'} ${asset.last}` : ''} />
      </Row>
      <Field label={fr ? 'Note (facultatif)' : 'Note (optional)'} value={note} onChange={setNote} numeric={false} placeholder={fr ? 'ex. renforcer avant le détachement du dividende' : 'e.g. reason'} />
      {amount ? <Txt size="sm" muted>{fr ? 'Montant estimé' : 'Estimated amount'} : <Txt size="sm" weight="700">{formatMoney(amount, asset.currency as never, lang)}</Txt>{parseNum(limit) ? '' : (fr ? ' (au dernier cours)' : ' (at last price)')}</Txt> : null}
      <Row>
        <View style={{ flex: 1 }}><Button label={cur ? (fr ? 'Mettre à jour' : 'Update') : (fr ? '🛒 Ajouter au panier' : '🛒 Add to basket')} loading={save.isPending} onPress={() => save.mutate()} /></View>
        {cur ? <View style={{ flex: 1 }}><Button label={fr ? 'Retirer' : 'Remove'} variant="secondary" loading={remove.isPending} onPress={() => remove.mutate()} /></View> : null}
      </Row>
      {msg ? <Txt size="sm" color={msg.startsWith('✓') ? th.up : th.textMuted}>{msg}</Txt> : null}
      {existing.length ? <Pressable onPress={() => router.push('/panier')}><Txt size="xs" color={th.info}>{fr ? 'Voir mon panier →' : 'See my basket →'}</Txt></Pressable> : null}
    </View>
  );
}

const ccy = (c: string) => (c === 'XOF' || c === 'XAF' ? 'FCFA' : c);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Printable checklist (A4 portrait). */
export function basketHtml(items: BasketItem[], lang: 'fr' | 'en', owner?: string | null) {
  const fr = lang === 'fr';
  const n = (v: number | null, d = 2) => (v == null ? '—' : v.toLocaleString(fr ? 'fr-FR' : 'en-GB', { maximumFractionDigits: d }));
  const date = new Date().toLocaleDateString(fr ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const section = (side: 'buy' | 'sell') => {
    const list = items.filter((i) => i.side === side);
    if (!list.length) return '';
    const totals = new Map<string, number>();
    const rows = list.map((i) => {
      const px = i.limit_price ?? i.last;
      const amt = i.quantity != null && px != null ? i.quantity * px : null;
      if (amt != null) totals.set(i.currency, (totals.get(i.currency) ?? 0) + amt);
      return `<tr><td class="ck">${i.done ? '☑' : '☐'}</td><td><b>${esc(i.ticker)}</b><br><span class="m">${esc(i.name)} · ${esc(i.market)}</span></td>
        <td class="r">${n(i.last)}<br><span class="m">${i.lastDate ? new Date(i.lastDate).toLocaleDateString(fr ? 'fr-FR' : 'en-GB') : ''}${i.changePct != null ? ` · ${i.changePct >= 0 ? '+' : ''}${n(i.changePct, 2)} %` : ''}</span></td>
        <td class="r">${n(i.quantity, 0)}</td><td class="r">${i.limit_price != null ? n(i.limit_price) : (fr ? 'au marché' : 'market')}</td>
        <td class="r">${amt != null ? `${n(amt, 0)} ${ccy(i.currency)}` : '—'}</td><td>${i.note ? esc(i.note) : ''}</td><td class="w"></td><td class="w"></td></tr>`;
    }).join('');
    const tot = [...totals].map(([c, v]) => `${n(v, 0)} ${ccy(c)}`).join(' · ') || '—';
    return `<h2 class="${side}">${side === 'buy' ? (fr ? '🟢 À acheter' : '🟢 To buy') : (fr ? '🔴 À vendre' : '🔴 To sell')} (${list.length})</h2>
      <div class="sc"><table><thead><tr><th></th><th>${fr ? 'Titre' : 'Stock'}</th><th class="r">${fr ? 'Dernier cours' : 'Last price'}</th><th class="r">${fr ? 'Qté' : 'Qty'}</th><th class="r">${fr ? 'Limite' : 'Limit'}</th><th class="r">${fr ? 'Montant est.' : 'Est. amount'}</th><th>Note</th><th>${fr ? 'Qté exécutée' : 'Qty done'}</th><th>${fr ? 'Prix obtenu' : 'Price'}</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td></td><td colspan="4"><b>${fr ? 'Total estimé' : 'Estimated total'}</b></td><td class="r"><b>${tot}</b></td><td colspan="3"></td></tr></tfoot></table></div>`;
  };
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${fr ? 'Panier du jour' : 'Daily basket'} — Chart-BoursafrikIA</title>
<style>@page{size:A4 portrait;margin:12mm}body{font:12px -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:0;padding:16px}
h1{font-size:19px;margin:0}h2{font-size:15px;margin:18px 0 6px}h2.buy{color:#138a5b}h2.sell{color:#c53030}.m{color:#666;font-size:10px}
table{width:100%;border-collapse:collapse}.sc{overflow-x:auto}@media screen and (max-width:700px){table{min-width:640px}}th,td{border-bottom:1px solid #ddd;padding:6px 5px;vertical-align:top;text-align:left}th{font-size:10px;color:#555;text-transform:uppercase}
.r{text-align:right}.ck{font-size:18px;width:22px}.w{width:70px;border-bottom:1px solid #999}tfoot td{border-top:2px solid #333;border-bottom:0}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0B6E73;padding-bottom:8px}.ft{margin-top:22px;color:#666;font-size:10px}</style></head><body>
<div class="hd"><div><h1>${fr ? 'Panier du jour — check-list d’arbitrages' : 'Daily basket — trading checklist'}</h1><div class="m">${date}${owner ? ` · ${esc(owner)}` : ''}</div></div><div><b>Chart-BoursafrikIA</b></div></div>
${section('buy')}${section('sell')}
${!items.length ? `<p>${fr ? 'Panier vide.' : 'Empty basket.'}</p>` : ''}
<p class="ft">${fr ? 'Derniers cours vérifiés à la date indiquée (clôture officielle ou cours différé). Les montants sont estimés au prix limite, ou au dernier cours à défaut, hors frais de courtage et taxes. Ce document est un aide-mémoire personnel : aucun ordre n’est transmis par Chart-BoursafrikIA. Ceci n’est pas un conseil en investissement.' : 'Last verified prices at the date shown. Estimated amounts exclude fees. Personal memo: no order is transmitted. Not investment advice.'}</p>
</body></html>`;
}

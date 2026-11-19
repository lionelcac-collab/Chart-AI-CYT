import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { formatMoney, type CurrencyCode } from '@chart-boursafrikia/core';
import { useT } from '../i18n';
import { api, type ImportCandidate } from '../lib/api';
import { fmtNum } from '../lib/format';
import { radius, space, useTheme } from '../theme';
import { Button, Card, Row, Txt } from './ui';

type Position = { quantity: number | null; cost: number | null };
type Draft = { on: boolean; qty: string; cost: string };

const toStr = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v * 100) / 100));
const parse = (s: string) => { const t = s.replace(/\s| | /g, '').replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const cur = (c: string) => (c === 'XOF' || c === 'XAF' ? 'FCFA' : c);
const money = (v: number | null | undefined, c: string, lang: 'fr' | 'en') => (v == null ? '—' : formatMoney(v, (c === 'FCFA' ? 'XOF' : c) as CurrencyCode, lang));

/**
 * Review of what the AI read on the screenshots: new stocks to add, existing lines to update
 * (shares / amount invested, editable), optional removal of stocks absent from the captures.
 */
export function ImportReview({ matched, unmatched, totalValue, totalCurrency, watched, positions, max, plan, onDone, onCancel }: {
  matched: ImportCandidate[]; unmatched: string[]; totalValue: number | null; totalCurrency: string | null;
  watched: string[]; positions: Record<string, Position>; max: number; plan: 'free' | 'premium';
  onDone: (message: string) => void; onCancel: () => void;
}) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const inList = new Set(watched);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(matched.map((c) => {
    const existing = inList.has(c.assetId);
    const p = positions[c.assetId];
    const hasNew = c.quantity != null || c.costAmount != null;
    const differs = hasNew && (c.quantity !== (p?.quantity ?? null) || (c.costAmount != null && c.costAmount !== (p?.cost ?? null)));
    return [c.assetId, { on: existing ? differs : c.confidence >= 0.6, qty: toStr(c.quantity ?? (existing ? p?.quantity : null)), cost: toStr(c.costAmount ?? (existing ? p?.cost : null)) }];
  })));
  const absent = watched.filter((id) => !matched.some((c) => c.assetId === id));
  const [removeAbsent, setRemoveAbsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id]!, ...patch } }));
  const selected = matched.filter((c) => drafts[c.assetId]?.on);
  const adds = selected.filter((c) => !inList.has(c.assetId));
  const updates = selected.filter((c) => inList.has(c.assetId));
  const room = Math.max(0, max - (watched.length - (removeAbsent ? absent.length : 0)));

  async function apply() {
    setErr(null);
    for (const c of selected) {
      const d = drafts[c.assetId]!;
      const q = parse(d.qty), a = parse(d.cost);
      if (Number.isNaN(q) || (q != null && q <= 0)) { setErr(fr ? `${c.ticker} : nombre de titres invalide.` : `${c.ticker}: invalid number of shares.`); return; }
      if (Number.isNaN(a) || (a != null && a < 0)) { setErr(fr ? `${c.ticker} : montant invalide.` : `${c.ticker}: invalid amount.`); return; }
    }
    setBusy(true);
    let added = 0, updated = 0, removed = 0, skipped = 0;
    try {
      if (removeAbsent) for (const id of absent) { await api.toggleWatch(id, false); removed++; }
      for (const c of selected) {
        const d = drafts[c.assetId]!;
        const q = parse(d.qty) as number | null, a = parse(d.cost) as number | null;
        if (!inList.has(c.assetId)) {
          if (added >= room) { skipped++; continue; }
          await api.toggleWatch(c.assetId, true); added++;
          if (q != null || a != null) await api.updatePosition(c.assetId, q, a);
        } else {
          // Existing line: only overwrite what is filled in (an empty field keeps the current value).
          const p = positions[c.assetId];
          await api.updatePosition(c.assetId, q ?? p?.quantity ?? null, a ?? p?.cost ?? null); updated++;
        }
      }
      await Promise.all(['watchlist', 'positions', 'portfolio'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      const parts = [added ? (fr ? `${added} ajouté(s)` : `${added} added`) : '', updated ? (fr ? `${updated} mis à jour` : `${updated} updated`) : '', removed ? (fr ? `${removed} retiré(s)` : `${removed} removed`) : ''].filter(Boolean);
      onDone(`✓ ${parts.join(' · ') || (fr ? 'Aucun changement' : 'No change')}${skipped ? (fr ? ` — ${skipped} non ajouté(s) : limite de ${max} titres${plan === 'free' ? ' (offre gratuite)' : ''}` : ` — ${skipped} not added (limit ${max})`) : ''}.`);
    } catch { setErr(fr ? 'Une erreur est survenue pendant l’enregistrement.' : 'An error occurred while saving.'); } finally { setBusy(false); }
  }

  const input = { width: '100%', minWidth: 0, backgroundColor: th.bg, color: th.text, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 6, borderWidth: 1, borderColor: th.border, fontSize: 14 } as const;

  return (
    <Card title={fr ? `Lu sur vos captures (${matched.length})` : `Read on your screenshots (${matched.length})`}>
      {totalValue != null ? <Txt size="sm">{fr ? 'Valorisation totale affichée' : 'Total value shown'} : <Txt weight="800">{money(totalValue, totalCurrency ?? 'XOF', lang)}</Txt></Txt> : null}
      {!matched.some((c) => c.quantity != null) ? (
        <Txt size="xs" color={th.warn}>{fr
          ? 'Aucun nombre de titres n’a été lu sur ces captures. Vous pouvez le saisir ci-dessous, ou relancer la lecture avec un message à l’IA, par ex. : « la colonne Unités est le nombre de titres que je détiens ».'
          : 'No number of shares was read. Enter it below, or retry with a message to the AI, e.g. “the Units column is the number of shares I hold”.'}</Txt>
      ) : null}
      <Txt size="xs" muted>{fr
        ? 'Cochez les lignes à appliquer. Nombre de titres et montant investi sont modifiables ; un champ vide ne change rien sur une ligne déjà suivie.'
        : 'Tick the lines to apply. Shares and amount invested are editable; an empty field leaves an existing line unchanged.'}</Txt>
      {matched.map((c) => {
        const d = drafts[c.assetId]!;
        const existing = inList.has(c.assetId);
        const p = positions[c.assetId];
        const readBits = [
          c.quantity != null ? `${fmtNum(c.quantity, lang, c.quantity % 1 ? 2 : 0)} ${fr ? 'titres' : 'shares'}` : null,
          c.avgCostPrice != null ? `PRU ${fmtNum(c.avgCostPrice, lang, c.avgCostPrice < 100 ? 2 : 0)}` : null,
          c.marketValue != null ? `${fr ? 'valo.' : 'value'} ${fmtNum(c.marketValue, lang, 0)}` : null,
          c.pnl != null ? `${c.pnl > 0 ? '+' : ''}${fmtNum(c.pnl, lang, 0)}` : null,
          c.pnlPct != null ? `${c.pnlPct > 0 ? '+' : ''}${fmtNum(c.pnlPct, lang, 2)} %` : null,
        ].filter(Boolean);
        return (
          <View key={c.assetId} style={{ paddingVertical: space.sm, gap: 6, borderBottomWidth: 1, borderBottomColor: th.grid }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: d.on }} onPress={() => set(c.assetId, { on: !d.on })} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: th.accent, backgroundColor: d.on ? th.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {d.on ? <Txt size="xs" weight="900" color={th.accentText}>✓</Txt> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="700">{c.ticker} <Txt size="xs" muted>{c.market}</Txt></Txt>
                <Txt size="xs" muted numberOfLines={1}>{c.name}</Txt>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: existing ? th.cardAlt : th.accent }}>
                <Txt size="xs" weight="700" color={existing ? th.text : th.accentText}>{existing ? (fr ? 'Mise à jour' : 'Update') : (fr ? 'Nouveau' : 'New')}</Txt>
              </View>
            </Pressable>
            {readBits.length ? <Txt size="xs" muted>{fr ? 'Lu' : 'Read'} : {readBits.join(' · ')}{c.readCurrency ? ` ${cur(c.readCurrency)}` : ''}</Txt> : null}
            {existing && (p?.quantity != null || p?.cost != null) ? <Txt size="xs" muted>{fr ? 'Actuel' : 'Current'} : {p?.quantity != null ? `${fmtNum(p.quantity, lang, 0)} ${fr ? 'titres' : 'shares'}` : '—'}{p?.cost != null ? ` · ${money(p.cost, c.currency, lang)}` : ''}</Txt> : null}
            {c.currencyMismatch ? <Txt size="xs" color={th.warn}>{fr ? `Montants lus en ${cur(c.readCurrency ?? '')}, alors que le titre cote en ${cur(c.currency)} : montant investi non repris, saisissez-le dans la devise du titre.` : 'Amounts read in another currency than the stock’s: amount not used.'}</Txt> : null}
            {d.on ? (
              <Row gap={space.sm}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Txt size="xs" muted>{fr ? 'Nombre de titres' : 'Shares'}</Txt><TextInput value={d.qty} onChangeText={(v) => set(c.assetId, { qty: v })} keyboardType="decimal-pad" placeholder={fr ? 'Nb de titres' : 'Shares'} placeholderTextColor={th.textMuted} style={input} accessibilityLabel={`${c.ticker} ${fr ? 'nombre de titres' : 'shares'}`} /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Txt size="xs" muted>{fr ? `Montant investi (${cur(c.currency)})` : `Invested (${cur(c.currency)})`}</Txt><TextInput value={d.cost} onChangeText={(v) => set(c.assetId, { cost: v })} keyboardType="decimal-pad" placeholder={fr ? `Investi (${cur(c.currency)})` : `Invested (${cur(c.currency)})`} placeholderTextColor={th.textMuted} style={input} accessibilityLabel={`${c.ticker} ${fr ? 'montant investi' : 'amount invested'}`} /></View>
              </Row>
            ) : null}
            {d.on && c.qtySource === 'value_div_price' ? <Txt size="xs" muted>{fr ? 'Nombre de titres déduit : valeur ÷ cours affichés.' : 'Shares deduced: value ÷ price shown.'}</Txt> : null}
            {d.on && c.costSource ? <Txt size="xs" muted>{fr ? { total: 'Montant investi lu sur la capture.', pru: 'Montant investi = nombre de titres × PRU.', value_minus_pnl: 'Montant investi = valorisation − plus/moins-value.', value_div_pnl_pct: 'Montant investi = valorisation ÷ (1 + plus/moins-value en %).' }[c.costSource] : ''}</Txt> : null}
          </View>
        );
      })}
      {unmatched.length ? <Txt size="xs" muted>{fr ? 'Non reconnus ou hors BRVM / BVMAC / NGX' : 'Not recognised or outside BRVM / BVMAC / NGX'} : {unmatched.join(', ')}</Txt> : null}
      {absent.length ? (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: removeAbsent }} onPress={() => setRemoveAbsent((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: th.down, backgroundColor: removeAbsent ? th.down : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {removeAbsent ? <Txt size="xs" weight="900" color="#FFFFFF">✓</Txt> : null}
          </View>
          <Txt size="sm" style={{ flex: 1 }}>{fr ? `Retirer de ma liste les ${absent.length} titre(s) absent(s) de ces captures (mise à jour complète du portefeuille)` : `Remove the ${absent.length} stock(s) not on these screenshots`}</Txt>
        </Pressable>
      ) : null}
      {adds.length > room ? <Txt size="xs" color={th.warn}>{fr ? `Votre liste est limitée à ${max} titres${plan === 'free' ? ' (offre gratuite)' : ''} : ${room} ajout(s) possible(s).` : `Your list is limited to ${max} stocks.`}</Txt> : null}
      {err ? <Txt size="xs" color={th.warn}>{err}</Txt> : null}
      <Button label={fr ? `Appliquer (${adds.length} ajout(s), ${updates.length} mise(s) à jour${removeAbsent && absent.length ? `, ${absent.length} retrait(s)` : ''})` : `Apply (${adds.length} add, ${updates.length} update${removeAbsent ? `, ${absent.length} remove` : ''})`}
        disabled={!selected.length && !(removeAbsent && absent.length)} loading={busy} onPress={apply} />
      <Button label={fr ? 'Annuler' : 'Cancel'} variant="ghost" onPress={onCancel} />
    </Card>
  );
}

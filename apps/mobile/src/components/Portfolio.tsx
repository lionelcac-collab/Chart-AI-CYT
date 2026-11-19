import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { formatMoney, type CurrencyCode } from '@chart-boursafrikia/core';
import { useT } from '../i18n';
import { api, type PortfolioLine } from '../lib/api';
import { fmtDate, fmtNum, fmtPct } from '../lib/format';
import { useSettings } from '../settings';
import { changeColor, radius, space, useTheme } from '../theme';
import { LineChart } from './LineChart';
import { Rich } from './Rich';
import { Button, Card, ErrorBox, Loading, Pill, Row, Txt } from './ui';

export const PERIODS = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y'] as const;
export type PfPeriod = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<(typeof PERIODS)[number], { fr: string; en: string; longFr: string; longEn: string }> = {
  '1W': { fr: '1S', en: '1W', longFr: 'sur 1 semaine', longEn: 'over 1 week' },
  '1M': { fr: '1M', en: '1M', longFr: 'sur 1 mois', longEn: 'over 1 month' },
  '3M': { fr: '3M', en: '3M', longFr: 'sur 3 mois', longEn: 'over 3 months' },
  '6M': { fr: '6M', en: '6M', longFr: 'sur 6 mois', longEn: 'over 6 months' },
  YTD: { fr: 'Janv.', en: 'YTD', longFr: 'depuis le 1er janvier', longEn: 'year to date' },
  '1Y': { fr: '1A', en: '1Y', longFr: 'sur 1 an', longEn: 'over 1 year' },
  '3Y': { fr: '3A', en: '3Y', longFr: 'sur 3 ans', longEn: 'over 3 years' },
};

const money = (v: number | null | undefined, cur: string, lang: 'fr' | 'en') => (v == null ? '—' : formatMoney(v, (cur === 'XAF' ? 'XAF' : cur) as CurrencyCode, lang));
const signed = (s: string, v: number | null | undefined) => (v != null && v > 0 ? `+${s}` : s);

/** Portfolio query (shared by the evolution card and the merged "Mes titres & contributions" list). */
export function usePortfolio(count: number) {
  const { listCurrency: base } = useSettings();
  const [period, setPeriod] = useState<PfPeriod>('3M');
  const q = useQuery({ queryKey: ['portfolio', period, base, count], queryFn: () => api.portfolio(period, base), enabled: count > 0 });
  return { period, setPeriod, q };
}

/** Portfolio evolution over a period. */
export function PortfolioPanel({ count, pf }: { count: number; pf: ReturnType<typeof usePortfolio> }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const { period, setPeriod, q } = pf;
  const d = q.data;
  const lbl = PERIOD_LABEL[period];

  if (!count) return null;
  return (
    <>
      <Card title={fr ? 'Mon portefeuille' : 'My portfolio'}>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {PERIODS.map((p) => <Pill key={p} label={fr ? PERIOD_LABEL[p].fr : PERIOD_LABEL[p].en} active={period === p} onPress={() => setPeriod(p)} />)}
        </Row>
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox message={fr ? 'Calcul du portefeuille impossible.' : 'Could not compute the portfolio.'} onRetry={() => q.refetch()} /> : !d || d.empty ? (
          <Txt muted>{fr ? 'Donnée indisponible' : 'Data unavailable'}</Txt>
        ) : (
          <View style={{ gap: space.sm }}>
            {d.mode === 'value' ? (
              <View>
                <Txt size="xs" muted>{fr ? 'Valeur actuelle' : 'Current value'}{d.summary.linesHeld != null && d.summary.linesHeld < count ? (fr ? ` (${d.summary.linesHeld} titre(s) avec quantité)` : ` (${d.summary.linesHeld} line(s) with shares)`) : ''}</Txt>
                <Txt size="xxl" weight="800">{money(d.summary.valueEnd, d.currency, lang)}</Txt>
                <Txt weight="700" color={changeColor(th, d.summary.change)}>
                  {signed(money(d.summary.change, d.currency, lang), d.summary.change)} ({fmtPct(d.summary.changePct, lang)}) {fr ? lbl.longFr : lbl.longEn}
                </Txt>
                {d.summary.pnl != null ? (
                  <Txt size="sm" color={changeColor(th, d.summary.pnl)}>
                    {fr ? 'Plus/moins-value latente' : 'Unrealised gain/loss'} : {signed(money(d.summary.pnl, d.currency, lang), d.summary.pnl)} ({fmtPct(d.summary.pnlPct, lang)})
                    <Txt size="xs" muted> {fr ? `sur ${money(d.summary.cost, d.currency, lang)} investis` : `on ${money(d.summary.cost, d.currency, lang)} invested`}{d.summary.linesWithCost != null && d.summary.linesHeld != null && d.summary.linesWithCost < d.summary.linesHeld ? (fr ? ` (${d.summary.linesWithCost} titre(s) avec montant)` : '') : ''}</Txt>
                  </Txt>
                ) : null}
              </View>
            ) : (
              <View>
                <Txt size="xs" muted>{fr ? 'Évolution moyenne de vos titres (pondération égale)' : 'Average change of your stocks (equal weight)'}</Txt>
                <Txt size="xxl" weight="800" color={changeColor(th, d.summary.changePct)}>{fmtPct(d.summary.changePct, lang)}</Txt>
                <Txt size="sm" muted>{fr ? lbl.longFr : lbl.longEn}</Txt>
              </View>
            )}
            <LineChart points={d.series} baseline={d.series[0]?.v} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt size="xs" muted>{fmtDate(d.start, lang)}</Txt>
              <Txt size="xs" muted>{fr ? 'Clôture du' : 'Close of'} {fmtDate(d.end, lang)}</Txt>
            </Row>
            {d.mode === 'equal' ? (
              <Txt size="xs" color={th.info}>{fr ? '✎ Renseignez le nombre d’actions (et si vous voulez le montant investi) sur vos titres ci-dessous pour suivre la valeur réelle et la plus-value. Facultatif.' : '✎ Enter the number of shares (and optionally the amount invested) on your stocks below to track the real value and gain. Optional.'}</Txt>
            ) : null}
            {d.lines.some((l) => l.currency === 'NGN') ? (
              <Txt size="xs" muted>{fr ? `Titres NGX convertis en ${d.currency === 'XOF' ? 'FCFA' : d.currency} au dernier taux disponible${d.fx.asOf ? ` (${fmtDate(d.fx.asOf, lang)})` : ''}, appliqué à tout l’historique.` : `NGX stocks converted at the latest available rate, applied to the whole history.`}</Txt>
            ) : null}
            <Txt size="xs" muted>{fr ? 'Cours de clôture ajustés des opérations sur titres. Dividendes non inclus.' : 'Closing prices adjusted for corporate actions. Dividends not included.'}</Txt>
          </View>
        )}
      </Card>

    </>
  );
}

/** Contribution bar centred on zero (green right / red left), scaled on the largest absolute contribution. */
export function ContributionBar({ value, maxAbs }: { value: number | null | undefined; maxAbs: number }) {
  const th = useTheme();
  const w = Math.min(100, (Math.abs(value ?? 0) / Math.max(0.0001, maxAbs)) * 100);
  return (
    <View style={{ flexDirection: 'row', height: 6 }}>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{value != null && value < 0 ? <View style={{ width: `${w}%`, height: 6, borderRadius: 3, backgroundColor: th.down }} /> : null}</View>
      <View style={{ width: 1, backgroundColor: th.border }} />
      <View style={{ flex: 1 }}>{value != null && value > 0 ? <View style={{ width: `${w}%`, height: 6, borderRadius: 3, backgroundColor: th.up }} /> : null}</View>
    </View>
  );
}

/** Inline editor for the optional position details of a line. */
export function PositionEditor({ assetId, currency, quantity, cost, lastPrice, onDone }: { assetId: string; currency: string; quantity: number | null; cost: number | null; lastPrice?: number | null; onDone: () => void }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const [qty, setQty] = useState(quantity != null ? String(quantity) : '');
  const [amt, setAmt] = useState(cost != null ? String(cost) : '');
  const [pct, setPct] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const parse = (s: string) => { const t = s.replace(/\s| | /g, '').replace(',', '.'); return t === '' ? null : Number(t); };
  const cur = currency === 'XOF' || currency === 'XAF' ? 'FCFA' : currency;

  // Amount invested deduced from a gain/loss in %: current value (shares × last close) ÷ (1 + %/100).
  const qNow = parse(qty), pNow = parse(pct);
  const derived = qNow != null && qNow > 0 && pNow != null && Number.isFinite(pNow) && pNow > -100 && lastPrice ? (qNow * lastPrice) / (1 + pNow / 100) : null;
  const onPct = (v: string) => { setPct(v); };

  async function save(clear = false) {
    const q = clear ? null : parse(qty);
    const a = clear ? null : (amt.trim() === '' && derived != null ? Math.round(derived * 100) / 100 : parse(amt));
    if (q != null && (!Number.isFinite(q) || q <= 0)) { setErr(fr ? 'Nombre d’actions invalide.' : 'Invalid number of shares.'); return; }
    if (a != null && (!Number.isFinite(a) || a < 0)) { setErr(fr ? 'Montant invalide.' : 'Invalid amount.'); return; }
    setBusy(true); setErr(null);
    try {
      await api.updatePosition(assetId, q, a);
      await Promise.all([qc.invalidateQueries({ queryKey: ['positions'] }), qc.invalidateQueries({ queryKey: ['portfolio'] })]);
      onDone();
    } catch { setErr(fr ? 'Enregistrement impossible.' : 'Could not save.'); } finally { setBusy(false); }
  }
  const input = { backgroundColor: th.bg, color: th.text, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: th.border, fontSize: 15 } as const;
  return (
    <View style={{ gap: space.sm, paddingVertical: space.sm }}>
      <Row gap={space.sm}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt size="xs" muted>{fr ? 'Nombre d’actions' : 'Number of shares'}</Txt>
          <TextInput value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder={fr ? 'ex. 100' : 'e.g. 100'} placeholderTextColor={th.textMuted} style={input} accessibilityLabel={fr ? 'Nombre d’actions' : 'Number of shares'} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt size="xs" muted>{fr ? `Montant investi (${cur})` : `Amount invested (${cur})`}</Txt>
          <TextInput value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder={fr ? 'facultatif' : 'optional'} placeholderTextColor={th.textMuted} style={input} accessibilityLabel={fr ? 'Montant investi' : 'Amount invested'} />
        </View>
      </Row>
      <View style={{ gap: 4 }}>
        <Txt size="xs" muted>{fr ? 'ou plus/moins-value en % (calcule le montant investi)' : 'or gain/loss in % (computes the amount invested)'}</Txt>
        <TextInput value={pct} onChangeText={onPct} keyboardType="numbers-and-punctuation" placeholder={fr ? 'ex. +12,5 ou -8' : 'e.g. +12.5 or -8'} placeholderTextColor={th.textMuted} style={input} accessibilityLabel={fr ? 'Plus ou moins-value en pourcentage' : 'Gain or loss in percent'} />
        {pct.trim() !== '' ? (
          derived != null ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt size="xs" color={th.info}>{fr ? 'Montant investi calculé' : 'Computed amount invested'} : {fmtNum(derived, lang, currency === 'XOF' || currency === 'XAF' ? 0 : 2)} {cur}</Txt>
              <Pressable onPress={() => setAmt(String(Math.round(derived * 100) / 100))}><Txt size="xs" weight="700" color={th.accent}>{fr ? 'Utiliser' : 'Use'}</Txt></Pressable>
            </Row>
          ) : <Txt size="xs" color={th.warn}>{fr ? (lastPrice ? 'Indiquez d’abord le nombre d’actions.' : 'Cours indisponible : calcul impossible.') : 'Enter the number of shares first.'}</Txt>
        ) : null}
        {pct.trim() !== '' && derived != null && amt.trim() !== '' ? <Txt size="xs" muted>{fr ? 'Le montant saisi ci-dessus sera conservé ; touchez « Utiliser » pour le remplacer.' : 'The amount typed above is kept; tap “Use” to replace it.'}</Txt> : null}
        {lastPrice ? <Txt size="xs" muted>{fr ? `Calcul : nombre d’actions × dernier cours (${fmtNum(lastPrice, lang, lastPrice < 100 ? 2 : 0)} ${cur}) ÷ (1 + % ÷ 100).` : 'Shares × last price ÷ (1 + % ÷ 100).'}</Txt> : null}
      </View>
      <Txt size="xs" muted>{fr ? 'Facultatif. Montant total payé pour ces actions (frais compris si vous le souhaitez), dans la devise du titre.' : 'Optional. Total amount paid for these shares, in the stock’s currency.'}</Txt>
      {err ? <Txt size="xs" color={th.warn}>{err}</Txt> : null}
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}><Button label={fr ? 'Enregistrer' : 'Save'} loading={busy} onPress={() => save(false)} /></View>
        {quantity != null || cost != null ? <View style={{ flex: 1 }}><Button label={fr ? 'Effacer' : 'Clear'} variant="secondary" onPress={() => save(true)} /></View> : null}
        <View style={{ flex: 1 }}><Button label={fr ? 'Annuler' : 'Cancel'} variant="ghost" onPress={onDone} /></View>
      </Row>
    </View>
  );
}

type Msg = { role: 'user' | 'assistant'; content: string; auth?: boolean };

/** Ask the AI about the user's real portfolio (the assistant reads it with get_my_portfolio). */
export function PortfolioAsk({ hasQuantities }: { hasQuantities: boolean }) {
  const th = useTheme();
  const { lang, t } = useT();
  const fr = lang === 'fr';
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const suggestions = fr
    ? ['Fais le bilan de mon portefeuille', 'Quels sont mes principaux risques et ma concentration ?', 'Qu’est-ce qui a le plus pesé ce mois-ci ?', 'Lesquels de mes titres sont proches d’un support ou d’une résistance ?', 'Quelle est mon exposition au naira et à chaque marché ?']
    : ['Review my portfolio', 'What are my main risks and concentration?', 'What weighed most this month?', 'Which of my stocks are near a support or resistance?', 'What is my exposure to the naira and to each market?'];

  async function ask(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const reply = await api.chat(next.map(({ role, content }) => ({ role, content })), lang, 'portfolio');
      setMsgs([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      const code = (e as { code?: string }).code;
      const txt = code === 'AUTH_REQUIRED' ? (fr ? 'Connectez-vous pour interroger l’IA sur votre portefeuille.' : 'Sign in to ask the AI about your portfolio.')
        : code === 'QUOTA_EXCEEDED' ? (fr ? 'Limite quotidienne de questions atteinte. Passez à Premium pour continuer.' : 'Daily question limit reached.')
        : t.common.error;
      setMsgs([...next, { role: 'assistant', content: `⚠ ${txt}`, auth: code === 'AUTH_REQUIRED' }]);
    } finally { setBusy(false); }
  }

  return (
    <Card style={{ borderColor: th.accent, borderWidth: 2 }}>
      <Txt weight="800" color={th.accent}>✦ {fr ? 'Interroger l’IA sur mon portefeuille' : 'Ask the AI about my portfolio'}</Txt>
      <Txt size="sm" muted>{fr
        ? 'L’IA analyse votre situation réelle : vos titres, leurs poids, vos plus-values, la concentration, les risques et les niveaux techniques de vos lignes.'
        : 'The AI analyses your real situation: your stocks, weights, gains, concentration, risks and technical levels of your holdings.'}</Txt>
      {!hasQuantities ? <Txt size="xs" color={th.info}>{fr ? 'Astuce : renseignez le nombre d’actions (✎) pour une analyse en valeur réelle.' : 'Tip: enter the number of shares (✎) for a real-value analysis.'}</Txt> : null}
      {!msgs.length ? (
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {suggestions.map((s) => <Pill key={s} label={s} onPress={() => ask(s)} />)}
        </Row>
      ) : null}
      {msgs.map((m, i) => (
        <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '88%' : '100%', backgroundColor: m.role === 'user' ? th.accent : th.cardAlt, borderRadius: radius.lg, padding: space.md }}>
          {m.role === 'user' ? <Txt size="sm" color={th.accentText}>{m.content}</Txt> : <Rich text={m.content} color={th.text} />}
          {m.auth ? <View style={{ marginTop: space.sm }}><Button label={fr ? 'Se connecter' : 'Sign in'} onPress={() => router.push('/auth')} /></View> : null}
        </View>
      ))}
      {busy ? <Txt size="sm" muted>✦ {fr ? 'L’IA analyse votre portefeuille… (15 à 40 secondes)' : 'The AI is analysing your portfolio… (15 to 40 seconds)'}</Txt> : null}
      <Row gap={space.sm}>
        <TextInput value={input} onChangeText={setInput} placeholder={fr ? 'Votre question sur votre portefeuille…' : 'Your question about your portfolio…'} placeholderTextColor={th.textMuted} multiline
          accessibilityLabel={fr ? 'Question sur le portefeuille' : 'Portfolio question'}
          style={{ flex: 1, backgroundColor: th.bg, color: th.text, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: th.border, maxHeight: 120, fontSize: 15 }} />
        <Button label="➤" onPress={() => ask()} disabled={!input.trim()} loading={busy} />
      </Row>
      {msgs.length ? <Pressable onPress={() => setMsgs([])}><Txt size="xs" color={th.accent}>{fr ? '↺ Nouvelle conversation' : '↺ New conversation'}</Txt></Pressable> : null}
      <Txt size="xs" muted>{fr ? 'Analyse informative de votre situation, pas un conseil en investissement personnalisé.' : 'Informative analysis of your situation, not personalised investment advice.'}</Txt>
    </Card>
  );
}

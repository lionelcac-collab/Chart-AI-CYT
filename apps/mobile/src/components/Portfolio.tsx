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

const PERIODS = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y'] as const;
const PERIOD_LABEL: Record<(typeof PERIODS)[number], { fr: string; en: string; longFr: string; longEn: string }> = {
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

/** Portfolio evolution over a period + contribution of each line. */
export function PortfolioPanel({ count }: { count: number }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const { listCurrency: base } = useSettings();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('3M');
  const q = useQuery({ queryKey: ['portfolio', period, base, count], queryFn: () => api.portfolio(period, base), enabled: count > 0 });
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

      {d && !d.empty && d.lines.length ? <ContributionCard lines={d.lines} mode={d.mode} end={d.end} period={fr ? lbl.longFr : lbl.longEn} currency={d.currency} /> : null}
    </>
  );
}

function ContributionCard({ lines, mode, end, period, currency }: { lines: PortfolioLine[]; mode: 'value' | 'equal'; end: string; period: string; currency: string }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const maxAbs = Math.max(0.0001, ...lines.map((l) => Math.abs(l.contributionPts ?? 0)));
  const staleCut = new Date(Date.parse(`${end}T12:00:00Z`) - 10 * 86400_000).toISOString().slice(0, 10);
  return (
    <Card title={fr ? 'Contribution par titre' : 'Contribution by stock'} collapsible badge={lines.length}>
      <Txt size="xs" muted>{fr
        ? `Part de chaque titre dans le portefeuille et sa contribution à la performance ${period}, en points de % (la somme donne la performance totale).`
        : `Weight of each stock and its contribution to the performance ${period}, in % points (they add up to the total).`}</Txt>
      {lines.map((l) => {
        const c = l.contributionPts;
        const wPct = Math.min(100, (Math.abs(c ?? 0) / maxAbs) * 100);
        const stale = l.lastDate != null && l.lastDate < staleCut;
        return (
          <Pressable key={l.assetId} onPress={() => router.push(`/asset/${encodeURIComponent(l.assetId)}`)} style={{ paddingVertical: 6, gap: 4, borderBottomWidth: 1, borderBottomColor: th.grid }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Txt weight="700">{l.ticker} <Txt size="xs" muted>{l.market}</Txt></Txt>
                <Txt size="xs" muted numberOfLines={1}>
                  {fr ? 'Poids' : 'Weight'} {l.weightPct != null ? `${fmtNum(l.weightPct, lang, 1)} %` : (fr ? 'n.c. (quantité non renseignée)' : 'n/a (no shares)')} · {fr ? 'Var.' : 'Chg'} {fmtPct(l.returnPct, lang)}
                  {mode === 'value' && l.valueEnd != null ? ` · ${money(l.valueEnd, currency, lang)}` : ''}
                </Txt>
                {stale ? <Txt size="xs" color={th.warn}>{fr ? `Dernière cotation le ${fmtDate(l.lastDate, lang)}` : `Last traded ${fmtDate(l.lastDate, lang)}`}</Txt> : null}
              </View>
              <Txt weight="800" color={changeColor(th, c)}>{c == null ? '—' : `${c > 0 ? '+' : ''}${fmtNum(c, lang, 2)} pt${Math.abs(c) >= 2 ? 's' : ''}`}</Txt>
            </Row>
            <View style={{ flexDirection: 'row', height: 6 }}>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>{c != null && c < 0 ? <View style={{ width: `${wPct}%`, height: 6, borderRadius: 3, backgroundColor: th.down }} /> : null}</View>
              <View style={{ width: 1, backgroundColor: th.border }} />
              <View style={{ flex: 1 }}>{c != null && c > 0 ? <View style={{ width: `${wPct}%`, height: 6, borderRadius: 3, backgroundColor: th.up }} /> : null}</View>
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

/** Inline editor for the optional position details of a line. */
export function PositionEditor({ assetId, currency, quantity, cost, onDone }: { assetId: string; currency: string; quantity: number | null; cost: number | null; onDone: () => void }) {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const qc = useQueryClient();
  const [qty, setQty] = useState(quantity != null ? String(quantity) : '');
  const [amt, setAmt] = useState(cost != null ? String(cost) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const parse = (s: string) => { const t = s.replace(/\s| | /g, '').replace(',', '.'); return t === '' ? null : Number(t); };
  const cur = currency === 'XOF' || currency === 'XAF' ? 'FCFA' : currency;

  async function save(clear = false) {
    const q = clear ? null : parse(qty), a = clear ? null : parse(amt);
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

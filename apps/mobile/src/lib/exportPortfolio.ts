// Portfolio export: CSV (Excel-friendly: ";" separator, decimal comma in French, UTF-8 BOM) and PDF report.
// Web: CSV is downloaded, PDF goes through the browser print dialog ("Save as PDF").
// iOS / Android: files are written to the cache and handed to the system share sheet.
import { convert, formatMoney, type CurrencyCode } from '@chart-boursafrikia/core';
import { Platform } from 'react-native';

export type ExportLine = {
  ticker: string; name: string; market: string; sector: string | null; currency: string;
  quantity: number | null; cost: number | null; last: number | null; lastDate: string | null; dayChangePct: number | null;
  weightPct: number | null; periodReturnPct: number | null; contributionPts: number | null;
};
export type ExportInput = {
  lang: 'fr' | 'en'; displayCurrency: string; usdRates?: Partial<Record<CurrencyCode, number>>;
  periodLabel: string; mode: 'value' | 'equal' | null;
  summary: { valueEnd?: number | null; change?: number | null; changePct?: number | null; cost?: number | null; pnl?: number | null; pnlPct?: number | null } | null;
  lines: ExportLine[]; generatedAt: Date;
};

const cur = (c: string) => (c === 'XOF' || c === 'XAF' ? 'FCFA' : c);
const r2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

function computed(inp: ExportInput) {
  return inp.lines.map((l) => {
    const value = l.quantity != null && l.last != null ? l.quantity * l.last : null;
    const pnl = value != null && l.cost != null ? value - l.cost : null;
    const valueDisp = value != null ? convert(value, l.currency as CurrencyCode, inp.displayCurrency as CurrencyCode, inp.usdRates) : null;
    return { ...l, value, pnl, pnlPct: pnl != null && l.cost ? (pnl / l.cost) * 100 : null, valueDisp };
  });
}

export function portfolioCsv(inp: ExportInput): string {
  const fr = inp.lang === 'fr';
  const sep = fr ? ';' : ',';
  const num = (v: number | null | undefined) => { const x = r2(v); return x == null ? '' : fr ? String(x).replace('.', ',') : String(x); };
  const esc = (s: string | null | undefined) => { const t = s ?? ''; return /[";,\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = fr
    ? ['Ticker', 'Société', 'Bourse', 'Secteur', 'Devise', 'Nombre d’actions', 'Montant investi', 'Dernier cours', 'Date du cours', 'Variation du jour %', 'Valeur', `Valeur (${cur(inp.displayCurrency)})`, '+/- value', '+/- value %', 'Poids %', `Variation ${inp.periodLabel} %`, 'Contribution (pts)']
    : ['Ticker', 'Company', 'Exchange', 'Sector', 'Currency', 'Shares', 'Amount invested', 'Last price', 'Price date', 'Day change %', 'Value', `Value (${inp.displayCurrency})`, 'Gain/loss', 'Gain/loss %', 'Weight %', `Change ${inp.periodLabel} %`, 'Contribution (pts)'];
  const rows = computed(inp).map((l) => [
    esc(l.ticker), esc(l.name), l.market, esc(l.sector), cur(l.currency), num(l.quantity), num(l.cost), num(l.last), l.lastDate ?? '', num(l.dayChangePct),
    num(l.value), num(l.valueDisp), num(l.pnl), num(l.pnlPct), num(l.weightPct), num(l.periodReturnPct), num(l.contributionPts),
  ].join(sep));
  const meta = fr
    ? [`# Chart-BoursafrikIA — Portefeuille exporté le ${inp.generatedAt.toLocaleString('fr-FR')}`, '# Cours de clôture vérifiés (bulletins officiels / fournisseur licencié). Estimations, pas un conseil en investissement.']
    : [`# Chart-BoursafrikIA — Portfolio exported on ${inp.generatedAt.toLocaleString('en-GB')}`, '# Verified closing prices. Estimates, not investment advice.'];
  return '﻿' + [...meta, head.join(sep), ...rows].join('\r\n') + '\r\n';
}

export function portfolioHtml(inp: ExportInput): string {
  const fr = inp.lang === 'fr';
  const L = computed(inp);
  const loc = fr ? 'fr-FR' : 'en-GB';
  const n = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString(loc, { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const pct = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${n(v)} %`);
  const money = (v: number | null | undefined, c: string) => (v == null ? '—' : formatMoney(v, c as CurrencyCode, inp.lang));
  const cls = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '');
  const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const s = inp.summary;
  const held = L.filter((l) => l.quantity != null);
  const totalCost = held.reduce((a, l) => a + (l.cost != null ? convert(l.cost, l.currency as CurrencyCode, inp.displayCurrency as CurrencyCode, inp.usdRates) ?? 0 : 0), 0);
  const rows = L.map((l) => `<tr>
    <td><b>${esc(l.ticker)}</b><br><span class="m">${esc(l.name)}</span></td><td>${l.market}<br><span class="m">${esc(l.sector ?? '')}</span></td>
    <td class="r">${n(l.quantity, 0)}</td><td class="r">${money(l.cost, l.currency)}</td><td class="r">${money(l.last, l.currency)}<br><span class="m">${l.lastDate ?? ''}</span></td>
    <td class="r">${money(l.value, l.currency)}</td><td class="r ${cls(l.pnl)}">${money(l.pnl, l.currency)}<br>${pct(l.pnlPct)}</td>
    <td class="r">${l.weightPct != null ? `${n(l.weightPct, 1)} %` : '—'}</td><td class="r ${cls(l.periodReturnPct)}">${pct(l.periodReturnPct)}</td>
    <td class="r ${cls(l.contributionPts)}">${l.contributionPts != null ? (Math.abs(l.contributionPts) < 0.005 ? '0,00' : `${l.contributionPts > 0 ? '+' : ''}${l.contributionPts.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`) : '—'}</td></tr>`).join('');
  const T = fr
    ? { title: 'Mon portefeuille', gen: 'Édité le', lines: 'Lignes', value: 'Valeur actuelle', change: `Variation ${inp.periodLabel}`, invested: 'Montant investi (lignes renseignées)', pnl: 'Plus/moins-value latente',
      cols: ['Titre', 'Bourse · secteur', 'Actions', 'Investi', 'Dernier cours', 'Valeur', '+/- value', 'Poids', `Var. ${inp.periodLabel}`, 'Contrib. (pts)'],
      equal: 'Aucun nombre d’actions renseigné : poids et contributions calculés à pondération égale.',
      foot: 'Cours de clôture vérifiés (bulletins officiels des bourses / fournisseur licencié), ajustés des opérations sur titres ; dividendes non inclus. Titres en naira convertis au dernier taux disponible. Document d’information : estimations statistiques, pas une garantie ni un conseil en investissement.' }
    : { title: 'My portfolio', gen: 'Generated on', lines: 'Lines', value: 'Current value', change: `Change ${inp.periodLabel}`, invested: 'Amount invested (filled lines)', pnl: 'Unrealised gain/loss',
      cols: ['Stock', 'Exchange · sector', 'Shares', 'Invested', 'Last price', 'Value', 'Gain/loss', 'Weight', `Chg ${inp.periodLabel}`, 'Contrib. (pts)'],
      equal: 'No share counts entered: weights and contributions are equal-weighted.',
      foot: 'Verified closing prices (official exchange bulletins / licensed provider), adjusted for corporate actions; dividends not included. Information document: statistical estimates, not a guarantee nor investment advice.' };
  const D = inp.displayCurrency;
  return `<!doctype html><html lang="${inp.lang}"><head><meta charset="utf-8"><title>${T.title} — Chart-BoursafrikIA</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #10181b; font-size: 11px; margin: 0; }
  h1 { font-size: 20px; margin: 0; } .brand { color: #0a7c85; font-weight: 800; font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0a7c85; padding-bottom: 6px; margin-bottom: 10px; }
  .kpis { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .kpi { border: 1px solid #d5e1e3; border-radius: 8px; padding: 6px 10px; min-width: 150px; } .kpi .l { color: #52666b; font-size: 10px; } .kpi .v { font-size: 15px; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; } th { background: #e9f1f2; text-align: left; font-size: 10px; padding: 5px; } td { border-bottom: 1px solid #e3ecee; padding: 5px; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; } .m { color: #52666b; font-size: 9px; } .up { color: #0e8a5a; } .down { color: #d33a3a; }
  .foot { margin-top: 10px; color: #52666b; font-size: 9px; } .note { color: #2f6fd6; font-size: 10px; margin-bottom: 6px; }
</style></head><body>
<div class="head"><div><div class="brand">✦ Chart-BoursafrikIA · ${fr ? 'Analyse IA des bourses africaines' : 'AI analysis of African stock markets'}</div><h1>${T.title}</h1></div>
<div class="m">${T.gen} ${inp.generatedAt.toLocaleString(loc)}<br>${fr ? 'Devise d’affichage' : 'Display currency'} : ${cur(D)}</div></div>
<div class="kpis">
  <div class="kpi"><div class="l">${T.value}</div><div class="v">${s?.valueEnd != null ? money(s.valueEnd, D) : '—'}</div></div>
  <div class="kpi"><div class="l">${T.change}</div><div class="v ${cls(s?.changePct)}">${pct(s?.changePct)}${s?.change != null ? ` (${money(s.change, D)})` : ''}</div></div>
  <div class="kpi"><div class="l">${T.invested}</div><div class="v">${totalCost ? money(totalCost, D) : '—'}</div></div>
  <div class="kpi"><div class="l">${T.pnl}</div><div class="v ${cls(s?.pnl)}">${s?.pnl != null ? `${money(s.pnl, D)} (${pct(s.pnlPct)})` : '—'}</div></div>
  <div class="kpi"><div class="l">${T.lines}</div><div class="v">${L.length}${held.length < L.length ? ` <span class="m">(${held.length} ${fr ? 'avec quantité' : 'with shares'})</span>` : ''}</div></div>
</div>
${inp.mode === 'equal' ? `<div class="note">${T.equal}</div>` : ''}
<table><thead><tr>${T.cols.map((c, i) => `<th class="${i >= 2 ? 'r' : ''}">${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
<div class="foot">${T.foot}<br>chart-boursafrikia.com</div>
</body></html>`;
}

const stamp = (d: Date) => d.toISOString().slice(0, 10);

export async function exportCsv(inp: ExportInput) {
  const csv = portfolioCsv(inp);
  const name = `portefeuille-chart-boursafrikia-${stamp(inp.generatedAt)}.csv`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(csv);
  await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', dialogTitle: name, UTI: 'public.comma-separated-values-text' });
}

export async function exportPdf(inp: ExportInput) {
  const html = portfolioHtml(inp);
  if (Platform.OS === 'web') {
    // Print a standalone document (the browser offers "Save as PDF").
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0'; iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow!.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { iframe.contentWindow!.focus(); iframe.contentWindow!.print(); setTimeout(() => iframe.remove(), 60_000); }, 300);
    return;
  }
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Portefeuille', UTI: 'com.adobe.pdf' });
}

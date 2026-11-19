// Pure portfolio computation (no I/O) — see index.ts for the modes.
export type Period = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y';
export type Line = { assetId: string; ticker: string; name: string; market: string; currency: string; quantity: number | null; cost: number | null };
export type PBar = { date: string; close: number };
const DAYS: Record<Exclude<Period, 'YTD'>, number> = { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365, '3Y': 1095 };

export function startDate(period: Period, last: string): string {
  const d = new Date(`${last}T12:00:00Z`);
  if (period === 'YTD') return `${d.getUTCFullYear() - 1}-12-31`;
  d.setUTCDate(d.getUTCDate() - DAYS[period]);
  return d.toISOString().slice(0, 10);
}

export function computePortfolio(lines: Line[], bars: PBar[][], period: Period, conv: (v: number, from: string) => number | null) {
  const last = bars.flatMap((b) => (b.length ? [b[b.length - 1]!.date] : [])).sort().pop();
  if (!last) return null;
  const start = startDate(period as Period, last);

  // Union of session dates in the period (+ the start reference).
  const dates = [...new Set(bars.flatMap((b) => b.filter((x) => x.date > start && x.date <= last).map((x) => x.date)))].sort();
  const priceAt = (b: { date: string; close: number }[], d: string) => {
    let lo = 0, hi = b.length - 1, ans: number | null = null;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m]!.date <= d) { ans = b[m]!.close; lo = m + 1; } else hi = m - 1; }
    return ans;
  };
  const startPrice = (b: { date: string; close: number }[]) => priceAt(b, start) ?? b.find((x) => x.date > start)?.close ?? null;

  const valueMode = lines.some((l) => l.quantity);
  const rows = lines.map((l, i) => {
    const b = bars[i]!;
    const p0 = startPrice(b), p1 = priceAt(b, last);
    const ret = p0 && p1 ? (p1 / p0 - 1) * 100 : null;
    const v0 = valueMode && l.quantity && p0 != null ? conv(l.quantity * p0, l.currency) : null;
    const v1 = valueMode && l.quantity && p1 != null ? conv(l.quantity * p1, l.currency) : null;
    const costBase = l.cost != null ? conv(l.cost, l.currency) : null;
    return { ...l, priceStart: p0, priceEnd: p1, returnPct: ret, valueStart: v0, valueEnd: v1, costBase, lastDate: b.length ? b[b.length - 1]!.date : null };
  });

  let series: { date: string; v: number }[] = [];
  let summary: Record<string, unknown>;
  if (valueMode) {
    const held = rows.filter((r) => r.quantity && r.valueStart != null);
    const pt = (d: string) => held.reduce((s, r) => { const p = priceAt(bars[lines.indexOf(lines.find((l) => l.assetId === r.assetId)!)]!, d) ?? r.priceStart!; return s + (conv(r.quantity! * p, r.currency) ?? 0); }, 0);
    series = [{ date: start, v: held.reduce((s, r) => s + r.valueStart!, 0) }, ...dates.map((d) => ({ date: d, v: pt(d) }))];
    const V0 = series[0]!.v, V1 = series[series.length - 1]!.v;
    const withCost = held.filter((r) => r.costBase != null);
    const cost = withCost.reduce((s, r) => s + r.costBase!, 0);
    const valueWithCost = withCost.reduce((s, r) => s + (r.valueEnd ?? 0), 0);
    summary = { valueStart: V0, valueEnd: V1, change: V1 - V0, changePct: V0 > 0 ? (V1 / V0 - 1) * 100 : null,
      cost: withCost.length ? cost : null, pnl: withCost.length ? valueWithCost - cost : null, pnlPct: withCost.length && cost > 0 ? (valueWithCost / cost - 1) * 100 : null,
      linesWithCost: withCost.length, linesHeld: held.length };
    for (const r of rows) Object.assign(r, {
      weightPct: r.valueEnd != null && V1 > 0 ? (r.valueEnd / V1) * 100 : null,
      contributionPts: r.valueEnd != null && r.valueStart != null && V0 > 0 ? ((r.valueEnd - r.valueStart) / V0) * 100 : null,
      pnl: r.costBase != null && r.valueEnd != null ? r.valueEnd - r.costBase : null,
      pnlPct: r.costBase && r.valueEnd != null ? (r.valueEnd / r.costBase - 1) * 100 : null,
    });
  } else {
    const ok = rows.filter((r) => r.priceStart);
    const n = ok.length || 1;
    const idx = (d: string) => ok.reduce((s, r) => { const b = bars[lines.findIndex((l) => l.assetId === r.assetId)]!; return s + ((priceAt(b, d) ?? r.priceStart!) / r.priceStart!) * 100; }, 0) / n;
    series = [{ date: start, v: 100 }, ...dates.map((d) => ({ date: d, v: idx(d) }))];
    const I1 = series[series.length - 1]!.v;
    summary = { indexEnd: I1, changePct: I1 - 100 };
    for (const r of rows) Object.assign(r, { weightPct: r.priceStart ? 100 / n : null, contributionPts: r.returnPct != null ? r.returnPct / n : null });
  }
  // Downsample to ≤ 260 points (keep first and last).
  if (series.length > 260) { const step = (series.length - 1) / 259; series = Array.from({ length: 260 }, (_, k) => series[Math.round(k * step)]!); }

  return { mode: valueMode ? 'value' : 'equal', start, end: last, series, summary, rows };
}

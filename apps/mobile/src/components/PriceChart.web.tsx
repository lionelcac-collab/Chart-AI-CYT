// Web chart: TradingView Lightweight Charts (v5 API, Apache-2.0 — attribution link required by its licence).
import { useEffect, useRef, type ComponentRef } from 'react';
import { View } from 'react-native';
import { AreaSeries, ColorType, LineSeries, LineStyle, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { sma } from '@nyota/core';
import { useTheme } from '../theme';
import type { PriceChartProps } from './PriceChart';

const ts = (d: string) => (Date.parse(`${d}T00:00:00Z`) / 1000) as UTCTimestamp;

export default function PriceChart({ bars, height = 260, showSma = true, levels = [] }: PriceChartProps) {
  const t = useTheme();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el || bars.length < 2) return;
    const chart = createChart(el, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: t.textMuted, attributionLogo: true },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border },
      timeScale: { borderColor: t.border },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;
    const area = chart.addSeries(AreaSeries, { lineColor: t.chartLine, topColor: t.chartFill, bottomColor: 'rgba(0,0,0,0)', lineWidth: 2 });
    area.setData(bars.map((b) => ({ time: ts(b.date), value: b.close })));
    levels.forEach((l) => area.createPriceLine({ price: l.price, color: l.kind === 'support' ? t.up : t.down, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: '' }));
    if (showSma) {
      const closes = bars.map((b) => b.close);
      for (const [period, color, style] of [[50, t.info, LineStyle.Solid], [200, t.textMuted, LineStyle.Dashed]] as const) {
        const s = sma(closes, period);
        const series = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: style, priceLineVisible: false, lastValueVisible: false });
        series.setData(bars.flatMap((b, i) => (s[i] == null ? [] : [{ time: ts(b.date), value: s[i] as number }])));
      }
    }
    chart.timeScale().fitContent();
    return () => { chart.remove(); chartRef.current = null; };
  }, [bars, height, showSma, levels, t]);

  return <View ref={ref} style={{ height, width: '100%' }} />;
}

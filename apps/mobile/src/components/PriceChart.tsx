// Native chart (iOS/Android): lightweight SVG area chart with SMA overlays.
// Daily data (≤ 800 points) renders fast with react-native-svg; the web build
// uses TradingView Lightweight Charts instead (PriceChart.web.tsx).
import { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Path, Stop, Text as SvgText } from 'react-native-svg';
import { sma, type Bar } from '@chart-boursafrikia/core';
import { useTheme } from '../theme';

export interface PriceChartProps { bars: Bar[]; height?: number; showSma?: boolean; levels?: { price: number; kind: 'support' | 'resistance' }[] }

export default function PriceChart({ bars, height = 220, showSma = true, levels = [] }: PriceChartProps) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const paths = useMemo(() => {
    if (!w || bars.length < 2) return null;
    const closes = bars.map((b) => b.close);
    const s50 = showSma ? sma(closes, 50) : [];
    const s200 = showSma ? sma(closes, 200) : [];
    const all = [...closes, ...levels.map((l) => l.price)];
    const min = Math.min(...all), max = Math.max(...all);
    const pad = (max - min) * 0.08 || 1;
    const lo = min - pad, hi = max + pad;
    const x = (i: number) => (i / (bars.length - 1)) * w;
    const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
    const line = closes.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join('');
    const area = `${line}L${w},${height}L0,${height}Z`;
    const toPath = (s: (number | null)[]) => s.map((v, i) => (v == null ? '' : `${s[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join('');
    return { line, area, s50: toPath(s50), s200: toPath(s200), y, lo, hi };
  }, [bars, w, height, showSma, levels]);

  return (
    <View onLayout={onLayout} style={{ height }} accessibilityLabel="Graphique des cours" accessible>
      {paths ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={t.chartLine} stopOpacity={0.28} />
              <Stop offset="1" stopColor={t.chartLine} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[0.25, 0.5, 0.75].map((f) => <Line key={f} x1={0} x2={w} y1={height * f} y2={height * f} stroke={t.grid} strokeWidth={1} />)}
          <Path d={paths.area} fill="url(#fill)" />
          <Path d={paths.line} stroke={t.chartLine} strokeWidth={2} fill="none" />
          {paths.s50 ? <Path d={paths.s50} stroke={t.info} strokeWidth={1.2} fill="none" opacity={0.9} /> : null}
          {paths.s200 ? <Path d={paths.s200} stroke={t.textMuted} strokeWidth={1.2} strokeDasharray="4 3" fill="none" /> : null}
          {levels.map((l, i) => (
            <Line key={i} x1={0} x2={w} y1={paths.y(l.price)} y2={paths.y(l.price)} stroke={l.kind === 'support' ? t.up : t.down} strokeWidth={1} strokeDasharray="6 4" opacity={0.7} />
          ))}
          <SvgText x={w - 4} y={12} fill={t.textMuted} fontSize={10} textAnchor="end">{paths.hi.toFixed(paths.hi < 100 ? 2 : 0)}</SvgText>
          <SvgText x={w - 4} y={height - 4} fill={t.textMuted} fontSize={10} textAnchor="end">{paths.lo.toFixed(paths.lo < 100 ? 2 : 0)}</SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

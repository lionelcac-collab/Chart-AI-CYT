import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

/** Light line chart (web + native) for a value series; colour follows the period result. */
export function LineChart({ points, height = 160, baseline }: { points: { date: string; v: number }[]; height?: number; baseline?: number }) {
  const th = useTheme();
  const [w, setW] = useState(0);
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals, baseline ?? Infinity), max = Math.max(...vals, baseline ?? -Infinity);
  const pad = (max - min) * 0.08 || 1;
  const lo = min - pad, hi = max + pad;
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * w : 0);
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const up = vals.length > 1 && vals[vals.length - 1]! >= vals[0]!;
  const col = up ? th.up : th.down;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }} accessibilityRole="image">
      {w > 0 && points.length > 1 ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="pf" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={col} stopOpacity={0.25} />
              <Stop offset="1" stopColor={col} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {baseline != null ? <Line x1={0} x2={w} y1={y(baseline)} y2={y(baseline)} stroke={th.textMuted} strokeDasharray="4 4" strokeWidth={1} /> : null}
          <Path d={`${d} L${w},${height} L0,${height} Z`} fill="url(#pf)" />
          <Path d={d} stroke={col} strokeWidth={2} fill="none" />
        </Svg>
      ) : null}
    </View>
  );
}

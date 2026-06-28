import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { fontSize, fontWeight, spacing } from '../tokens';

type Point = { value: number; label: string };

const CHART_HEIGHT = 120;
const CHART_PADDING_X = 10;

function buildPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((acc, p, i) => `${acc}${i === 0 ? 'M' : 'L'} ${p.x} ${p.y} `, '');
}

export function VitalsTrendChart({
  title,
  unit,
  data,
  color,
  emptyLabel = 'Aún no hay suficientes datos para una tendencia.',
}: {
  title: string;
  unit: string;
  data: Point[];
  color: string;
  emptyLabel?: string;
}) {
  const { colors } = useTheme();

  const chart = useMemo(() => {
    const values = data.map((d) => d.value).filter((v) => Number.isFinite(v));
    if (values.length < 2) return null;

    const width = 280;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const usableWidth = width - CHART_PADDING_X * 2;
    const step = usableWidth / Math.max(data.length - 1, 1);

    const points = data.map((d, i) => {
      const x = CHART_PADDING_X + i * step;
      const normalized = (d.value - min) / range;
      const y = CHART_HEIGHT - 20 - normalized * (CHART_HEIGHT - 40);
      return { x, y, value: d.value, label: d.label };
    });

    const linePath = buildPath(points);
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${CHART_HEIGHT} L ${points[0].x} ${CHART_HEIGHT} Z`;

    return { points, linePath, areaPath, width, min, max };
  }, [data]);

  const latest = data[data.length - 1];
  const first = data[0];
  const trendDelta = latest && first ? latest.value - first.value : 0;

  return (
    <View>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: colors.muted }]}>{title}</Text>
          <Text style={[styles.value, { color: colors.text }]}>
            {latest ? `${latest.value}` : '--'}
            <Text style={[styles.unit, { color: colors.muted }]}> {unit}</Text>
          </Text>
        </View>
        {data.length >= 2 && (
          <View style={styles.trendTag}>
            <Text style={[styles.trendText, { color: trendDelta === 0 ? colors.muted : trendDelta > 0 ? color : colors.info }]}>
              {trendDelta > 0 ? '↑' : trendDelta < 0 ? '↓' : '·'} {Math.abs(trendDelta).toFixed(1)}
            </Text>
          </View>
        )}
      </View>

      {chart ? (
        <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${chart.width} ${CHART_HEIGHT}`}>
          <Defs>
            <LinearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.22} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Line x1="0" y1={CHART_HEIGHT - 20} x2={chart.width} y2={CHART_HEIGHT - 20} stroke={colors.border} strokeWidth={1} />
          <Path d={chart.areaPath} fill="url(#fillGrad)" stroke="none" />
          <Path d={chart.linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {chart.points.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === chart.points.length - 1 ? 4.5 : 2.5}
              fill={i === chart.points.length - 1 ? color : colors.card}
              stroke={color}
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>{emptyLabel}</Text>
        </View>
      )}

      {data.length >= 2 && (
        <View style={styles.axisRow}>
          <Text style={[styles.axisLabel, { color: colors.muted }]}>{first?.label}</Text>
          <Text style={[styles.axisLabel, { color: colors.muted }]}>{latest?.label}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  title: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  value: { fontSize: fontSize.xl, fontWeight: fontWeight.black, marginTop: 2 },
  unit: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  trendTag: { paddingTop: 6 },
  trendText: { fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  emptyWrap: { height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center' },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  axisLabel: { fontSize: 10, fontWeight: fontWeight.medium },
});

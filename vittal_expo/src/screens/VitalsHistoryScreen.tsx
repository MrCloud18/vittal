import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getVitalsHistory, supabase, VitalSign } from '../lib/supabase';
import { useTheme } from '../ui/theme';
import { Card, EmptyState, TopBar } from '../ui/components';
import { VitalsTrendChart } from '../ui/components/VitalsTrendChart';
import { spacing, fontSize, fontWeight } from '../ui/tokens';

export type VitalsHistoryParams = {
  patientId: string;
  patientName: string;
};

function formatTimeLabel(value: string | null): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

export function VitalsHistoryScreen({
  patientId,
  patientName,
  onBack,
}: VitalsHistoryParams & { onBack: () => void }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vitals, setVitals] = useState<VitalSign[]>([]);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    const data = await getVitalsHistory(patientId, 30);
    setVitals(data);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(() => {
    const channel = supabase
      .channel(`vitals-history-${patientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vital_signs', filter: `patient_id=eq.${patientId}` }, () => {
        void load(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Los datos llegan ordenados desc (más nuevo primero); los invertimos
  // para que el gráfico se lea de izquierda (antiguo) a derecha (reciente).
  const chronological = useMemo(() => [...vitals].reverse(), [vitals]);

  const hrSeries = useMemo(
    () => chronological.filter((v) => v.heart_rate !== null).map((v) => ({ value: v.heart_rate as number, label: formatTimeLabel(v.recorded_at) })),
    [chronological],
  );
  const spo2Series = useMemo(
    () => chronological.filter((v) => v.oxygen_level !== null).map((v) => ({ value: v.oxygen_level as number, label: formatTimeLabel(v.recorded_at) })),
    [chronological],
  );
  const tempSeries = useMemo(
    () => chronological.filter((v) => v.temperature !== null).map((v) => ({ value: v.temperature as number, label: formatTimeLabel(v.recorded_at) })),
    [chronological],
  );

  return (
    <View style={[styles.bg, { backgroundColor: colors.bg }]}>
      <TopBar title="Tendencias" onBack={onBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <Text style={[styles.patientName, { color: colors.muted }]}>{patientName}</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : vitals.length === 0 ? (
          <Card>
            <EmptyState
              title="Sin registros todavía"
              subtitle="En cuanto el smartwatch envíe datos, vas a ver la evolución de frecuencia cardiaca, oxígeno y temperatura aquí."
            />
          </Card>
        ) : (
          <>
            <Card>
              <VitalsTrendChart title="Frecuencia cardiaca" unit="bpm" data={hrSeries} color={colors.primary} />
            </Card>
            <Card>
              <VitalsTrendChart title="Saturación de oxígeno" unit="%" data={spo2Series} color={colors.accent} />
            </Card>
            <Card>
              <VitalsTrendChart title="Temperatura" unit="°C" data={tempSeries} color={colors.warning} />
            </Card>

            <Card>
              <Text style={[styles.logTitle, { color: colors.text }]}>Registros recientes</Text>
              {vitals.slice(0, 10).map((v) => (
                <View key={v.id} style={[styles.logRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.logDate, { color: colors.text }]}>{formatTimeLabel(v.recorded_at)}</Text>
                  <Text style={[styles.logDetail, { color: colors.muted }]}>
                    {v.heart_rate ?? '--'} bpm · {v.oxygen_level ?? '--'}% · {v.temperature ?? '--'}°C · {v.blood_pressure ?? '--'}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.lg },
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  patientName: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  logTitle: { fontSize: fontSize.base, fontWeight: fontWeight.black, marginBottom: spacing.sm },
  logRow: { paddingVertical: spacing.sm, borderTopWidth: 1, gap: 2 },
  logDate: { fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  logDetail: { fontSize: fontSize.sm },
});

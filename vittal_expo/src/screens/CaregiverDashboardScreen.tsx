import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertItem,
  Caregiver,
  notifyAlertStatusChanged,
  Patient,
  VitalSign,
  acknowledgeAlert,
  backendUrl,
  getCurrentCaregiver,
  resolveAlert,
  supabase,
} from '../lib/supabase';
import { CaregiverStackParamList } from './CaregiverHomeScreen';
import { useTheme } from '../ui/theme';
import { Badge, Button, Card, EmptyState, ProgressBar, TopBar } from '../ui/components';
import { severityMeta, spacing, fontSize, fontWeight } from '../ui/tokens';

type Props = NativeStackScreenProps<CaregiverStackParamList, 'CaregiverDashboard'>;

export function CaregiverDashboardScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [vitals, setVitals] = useState<VitalSign[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);

  const patientId = patient?.id ?? null;

  const canRefresh = useMemo(() => Boolean(patientId) && !saving, [patientId, saving]);
  const latest = vitals[0] ?? null;
  const pendingAlerts = useMemo(() => alerts.filter((a) => a.status !== 'resolved'), [alerts]);

  function pct(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) return 0;
    const clamped = Math.max(min, Math.min(max, value));
    return ((clamped - min) / (max - min)) * 100;
  }

  function colorForMetric(type: 'hr' | 'spo2' | 'temp', value: number | null): string {
    if (value === null) return colors.muted;
    if (type === 'spo2') {
      if (value < 90) return colors.danger;
      if (value < 94) return colors.warning;
      return colors.success;
    }
    if (type === 'temp') {
      if (value >= 39) return colors.danger;
      if (value >= 38) return colors.warning;
      return colors.success;
    }
    if (value < 50 || value > 120) return colors.warning;
    return colors.success;
  }

  async function loadAll() {
    setLoading(true);
    const caregiverRes = await getCurrentCaregiver();
    setCaregiver(caregiverRes);
    if (caregiverRes?.id) {
      const { data: pats } = await supabase.from('patients').select('*').eq('caregiver_id', caregiverRes.id).order('created_at', { ascending: false }).limit(1);
      const p = (pats?.[0] as Patient) ?? null;
      setPatient(p);
      if (p?.id) {
        const { data: vit } = await supabase.from('vital_signs').select('*').eq('patient_id', p.id).order('recorded_at', { ascending: false }).limit(10);
        setVitals((vit as VitalSign[]) ?? []);
        const { data: al } = await supabase.from('alerts').select('*').eq('patient_id', p.id).order('triggered_at', { ascending: false }).limit(10);
        setAlerts((al as AlertItem[]) ?? []);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function onAcknowledge(alertId: string) {
    setBusyAlertId(alertId);
    const { error } = await acknowledgeAlert(alertId);
    setBusyAlertId(null);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    await notifyAlertStatusChanged(alertId, 'acknowledged');
    loadAll();
  }

  function onResolve(alertId: string) {
    Alert.alert('Marcar como resuelta', '¿Confirmas que esta alerta ya fue atendida?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          setBusyAlertId(alertId);
          const { error } = await resolveAlert(alertId);
          setBusyAlertId(null);
          if (error) {
            Alert.alert('Error', error);
            return;
          }
          await notifyAlertStatusChanged(alertId, 'resolved');
          loadAll();
        },
      },
    ]);
  }

  async function generateSmartwatchToken() {
    if (!backendUrl) {
      Alert.alert('Smartwatch', 'Falta configurar EXPO_PUBLIC_BACKEND_URL.');
      return;
    }
    if (!patientId) {
      Alert.alert('Smartwatch', 'Primero crea/selecciona un paciente.');
      return;
    }
    setBindingBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        Alert.alert('Smartwatch', 'No hay sesión activa.');
        return;
      }
      const res = await fetch(`${backendUrl}/api/devices/bindings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ patientId, deviceName: 'Smartwatch' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        Alert.alert('Smartwatch', json?.message ?? `Error ${res.status}`);
        return;
      }
      const token = json?.data?.deviceToken;
      if (!token) {
        Alert.alert('Smartwatch', 'No se recibió token.');
        return;
      }
      Alert.alert(
        'Token del smartwatch',
        `Configura el reloj para enviar vitals a Render usando este token:\n\nx-device-token:\n${token}\n\nEndpoint:\n${backendUrl}/api/ingest/vitals`,
      );
    } finally {
      setBindingBusy(false);
    }
  }

  return (
    <View style={[styles.bg, { backgroundColor: colors.bg }]}>
      <TopBar title="Dashboard" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <Card>
              <View style={styles.topRow}>
                <View style={styles.topLeft}>
                  <Text style={[styles.title, { color: colors.text }]}>{patient?.full_name ?? 'Sin paciente'}</Text>
                  <Text style={[styles.subRow, { color: colors.muted }]}>
                    {pendingAlerts.length > 0
                      ? `${pendingAlerts.length} alerta${pendingAlerts.length === 1 ? '' : 's'} por revisar`
                      : 'Todo en orden por ahora'}
                  </Text>
                </View>
                <Badge
                  label={pendingAlerts.length > 0 ? 'Atención' : 'OK'}
                  color={pendingAlerts.length > 0 ? colors.danger : colors.success}
                  soft={pendingAlerts.length > 0 ? colors.dangerSoft : colors.successSoft}
                />
              </View>

              <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
                {patientId && (
                  <Button
                    label="Ver tendencias"
                    onPress={() => navigation.navigate('VitalsHistory', { patientId, patientName: patient?.full_name ?? '' })}
                    variant="secondary"
                  />
                )}
                <Button
                  label="Conectar Hello Watch 3+"
                  onPress={() => patientId && navigation.navigate('Smartwatch', { patientId, patientName: patient?.full_name ?? '' })}
                  disabled={!patientId || bindingBusy}
                  loading={bindingBusy}
                  variant="secondary"
                />
                <Button
                  label={bindingBusy ? 'Generando…' : 'Solo generar token'}
                  onPress={generateSmartwatchToken}
                  disabled={!patientId || bindingBusy}
                  loading={bindingBusy}
                  variant="ghost"
                />
                <Button
                  label={saving ? 'Actualizando…' : 'Actualizar datos'}
                  onPress={async () => {
                    setSaving(true);
                    try {
                      await loadAll();
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={!canRefresh}
                  loading={saving}
                />
              </View>
            </Card>

            <View style={styles.grid}>
              <Card style={styles.metricCard}>
                <Text style={[styles.metricTitle, { color: colors.muted }]}>Frecuencia</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{latest?.heart_rate ?? '--'} bpm</Text>
                <ProgressBar percent={pct(latest?.heart_rate ?? 0, 40, 140)} color={colorForMetric('hr', latest?.heart_rate ?? null)} trackColor={colors.bgAlt} />
              </Card>
              <Card style={styles.metricCard}>
                <Text style={[styles.metricTitle, { color: colors.muted }]}>Oxígeno</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{latest?.oxygen_level ?? '--'}%</Text>
                <ProgressBar percent={pct(latest?.oxygen_level ?? 0, 80, 100)} color={colorForMetric('spo2', latest?.oxygen_level ?? null)} trackColor={colors.bgAlt} />
              </Card>
            </View>
            <View style={styles.grid}>
              <Card style={styles.metricCard}>
                <Text style={[styles.metricTitle, { color: colors.muted }]}>Temperatura</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{latest?.temperature ?? '--'}°C</Text>
                <ProgressBar percent={pct(latest?.temperature ?? 0, 35, 40)} color={colorForMetric('temp', latest?.temperature ?? null)} trackColor={colors.bgAlt} />
              </Card>
              <Card style={styles.metricCard}>
                <Text style={[styles.metricTitle, { color: colors.muted }]}>Presión</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{latest?.blood_pressure ?? '--'}</Text>
                <ProgressBar percent={60} color={colors.accent} trackColor={colors.bgAlt} />
              </Card>
            </View>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Signos vitales recientes</Text>
              {vitals.length === 0 ? (
                <EmptyState title="Sin datos todavía" subtitle="En cuanto el smartwatch envíe lecturas, las vas a ver aquí." />
              ) : (
                vitals.map((v) => (
                  <View key={v.id} style={[styles.item, { borderTopColor: colors.border }]}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>{v.recorded_at ?? ''}</Text>
                    <Text style={[styles.itemRow, { color: colors.muted }]}>
                      HR: {v.heart_rate ?? '-'} · SpO2: {v.oxygen_level ?? '-'} · Temp: {v.temperature ?? '-'}
                    </Text>
                    <Text style={[styles.itemRow, { color: colors.muted }]}>PA: {v.blood_pressure ?? '-'}</Text>
                  </View>
                ))
              )}
            </Card>

            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Emergencias / alertas</Text>
              {alerts.length === 0 ? (
                <EmptyState title="Sin alertas" subtitle="Aquí aparecerán las alertas que genere el monitoreo del paciente." />
              ) : (
                alerts.map((a) => {
                  const meta = severityMeta(a.severity, colors);
                  const isResolved = a.status === 'resolved';
                  return (
                    <View key={a.id} style={[styles.alertItem, { borderTopColor: colors.border }]}>
                      <View style={styles.alertHead}>
                        <Badge label={meta.label} color={meta.color} soft={meta.soft} size="sm" />
                        <Text style={[styles.alertStatus, { color: isResolved ? colors.success : colors.muted }]}>
                          {isResolved ? 'Resuelta' : a.status === 'acknowledged' ? 'Atendida' : 'Pendiente'}
                        </Text>
                      </View>
                      <Text style={[styles.itemTitle, { color: colors.text, marginTop: spacing.xs }]}>{a.triggered_at ?? ''}</Text>
                      <Text style={[styles.itemRow, { color: colors.muted }]}>{a.message ?? '-'}</Text>
                      {!isResolved && (
                        <View style={styles.alertActions}>
                          {a.status !== 'acknowledged' && (
                            <Button
                              label="Marcar vista"
                              onPress={() => onAcknowledge(a.id)}
                              variant="secondary"
                              size="sm"
                              fullWidth={false}
                              loading={busyAlertId === a.id}
                              disabled={busyAlertId === a.id}
                            />
                          )}
                          <Button
                            label="Resolver"
                            onPress={() => onResolve(a.id)}
                            variant="accent"
                            size="sm"
                            fullWidth={false}
                            loading={busyAlertId === a.id}
                            disabled={busyAlertId === a.id}
                          />
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.md },
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  title: { fontSize: fontSize.base, fontWeight: fontWeight.black },
  subRow: { marginTop: spacing.xs, fontWeight: fontWeight.medium, fontSize: fontSize.sm },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  topLeft: { flex: 1, paddingRight: spacing.md },
  grid: { flexDirection: 'row', gap: spacing.md },
  metricCard: { flex: 1, padding: spacing.lg },
  metricTitle: { fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  metricValue: { marginTop: spacing.sm, fontSize: fontSize.lg, fontWeight: fontWeight.black },
  cardTitle: { fontSize: fontSize.base, fontWeight: fontWeight.black, marginBottom: spacing.sm },
  item: { paddingTop: spacing.md, borderTopWidth: 1, marginTop: spacing.md },
  itemTitle: { fontWeight: fontWeight.black, fontSize: fontSize.sm },
  itemRow: { marginTop: spacing.xs, fontSize: fontSize.sm },
  alertItem: { paddingTop: spacing.md, borderTopWidth: 1, marginTop: spacing.md },
  alertHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  alertStatus: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  alertActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});

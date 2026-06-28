import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { emitAppEvent, onAppEvent } from '../lib/appEvents';
import { AlertItem, AppUser, Doctor, Patient, VitalSign, countUnreadNotifications, getCurrentAppUser, getCurrentDoctor, supabase } from '../lib/supabase';
import { VittalLogo } from '../ui/VittalLogo';
import { useTheme } from '../ui/theme';
import { Badge, Button, Card, EmptyState, IconCircle } from '../ui/components';
import { spacing, fontSize, fontWeight, radius } from '../ui/tokens';

export type DoctorStackParamList = {
  DoctorHome: undefined;
  PatientSearch: undefined;
  VitalsHistory: { patientId: string; patientName: string };
  DoctorNotes: { patientId: string; patientName: string; doctorId: string };
  Notifications: undefined;
  Account: undefined;
};

type Props = NativeStackScreenProps<DoctorStackParamList, 'DoctorHome'>;

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function byMostRecent(a: string | null, b: string | null): number {
  return String(b ?? '').localeCompare(String(a ?? ''));
}

export function DoctorHomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [latestVitals, setLatestVitals] = useState<Record<string, VitalSign>>({});
  const [pendingAlerts, setPendingAlerts] = useState<Record<string, number>>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const patientIdsRef = useRef<string[]>([]);

  function getPatientState(patient: Patient): { label: string; color: string; soft: string } {
    const pending = pendingAlerts[patient.id] ?? 0;
    if (pending > 0) return { label: `${pending} alerta${pending === 1 ? '' : 's'}`, color: colors.danger, soft: colors.dangerSoft };
    if (latestVitals[patient.id]?.recorded_at) return { label: 'Monitoreado', color: colors.success, soft: colors.successSoft };
    return { label: 'Sin vitals aún', color: colors.muted, soft: colors.border };
  }

  function formatWhen(value: string | null): string {
    if (!value) return 'Sin registros';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  async function loadDashboard(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [doctorRes, appUserRes] = await Promise.all([getCurrentDoctor(), getCurrentAppUser()]);
    setDoctor(doctorRes);
    setAppUser(appUserRes);
    setUnreadCount(await countUnreadNotifications());

    if (!doctorRes?.id) {
      setPatients([]);
      setLatestVitals({});
      setPendingAlerts({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: pats } = await supabase
      .from('patients')
      .select('*')
      .eq('assigned_doctor_id', doctorRes.id)
      .order('assigned_at', { ascending: false })
      .order('created_at', { ascending: false });

    const patientRows = (pats as Patient[]) ?? [];
    setPatients(patientRows);
    patientIdsRef.current = patientRows.map((item) => item.id);

    if (patientRows.length === 0) {
      setLatestVitals({});
      setPendingAlerts({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const ids = patientRows.map((item) => item.id);

    const { data: vitalsRows } = await supabase
      .from('vital_signs')
      .select('*')
      .in('patient_id', ids)
      .order('recorded_at', { ascending: false })
      .limit(Math.max(ids.length * 10, 20));

    const vitalsMap: Record<string, VitalSign> = {};
    ((vitalsRows as VitalSign[]) ?? []).forEach((item) => {
      if (!vitalsMap[item.patient_id]) vitalsMap[item.patient_id] = item;
    });
    setLatestVitals(vitalsMap);

    const { data: alertRows } = await supabase
      .from('alerts')
      .select('*')
      .in('patient_id', ids)
      .eq('status', 'pending')
      .order('triggered_at', { ascending: false })
      .limit(Math.max(ids.length * 10, 20));

    const alertMap: Record<string, number> = {};
    ((alertRows as AlertItem[]) ?? []).forEach((item) => {
      alertMap[item.patient_id] = (alertMap[item.patient_id] ?? 0) + 1;
    });
    setPendingAlerts(alertMap);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useEffect(() => {
    const channel = supabase
      .channel('doctor-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vital_signs' }, (payload) => {
        const patientId = (payload.new as any)?.patient_id ?? (payload.old as any)?.patient_id;
        if (patientId && patientIdsRef.current.includes(patientId)) loadDashboard(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
        const patientId = (payload.new as any)?.patient_id ?? (payload.old as any)?.patient_id;
        if (patientId && patientIdsRef.current.includes(patientId)) loadDashboard(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, (payload) => {
        const assignedDoctorId = (payload.new as any)?.assigned_doctor_id ?? (payload.old as any)?.assigned_doctor_id;
        if (doctor?.id && assignedDoctorId === doctor.id) loadDashboard(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_inbox' }, () => {
        emitAppEvent('notificationsUpdated');
      })
      .subscribe();

    const unsubscribeEvent = onAppEvent('notificationsUpdated', () => {
      void countUnreadNotifications().then((count) => setUnreadCount(count));
      void loadDashboard(true);
    });

    return () => {
      unsubscribeEvent();
      supabase.removeChannel(channel);
    };
  }, [doctor?.id]);

  const totalAlerts = useMemo(() => Object.values(pendingAlerts).reduce((sum, value) => sum + value, 0), [pendingAlerts]);
  const monitoredPatients = useMemo(
    () => patients.filter((patient) => Boolean(latestVitals[patient.id]?.recorded_at)).length,
    [patients, latestVitals],
  );
  const sortedPatients = useMemo(
    () =>
      [...patients].sort((a, b) => {
        const alertDiff = (pendingAlerts[b.id] ?? 0) - (pendingAlerts[a.id] ?? 0);
        if (alertDiff !== 0) return alertDiff;
        return byMostRecent(a.assigned_at, b.assigned_at);
      }),
    [patients, pendingAlerts],
  );
  const latestActivity = useMemo(() => {
    const timestamps = Object.values(latestVitals)
      .map((item) => item.recorded_at)
      .filter(Boolean)
      .map((value) => new Date(String(value)).getTime())
      .filter((value) => Number.isFinite(value));
    if (timestamps.length === 0) return 'Sin registros';
    const mostRecent = new Date(Math.max(...timestamps));
    return mostRecent.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }, [latestVitals]);

  return (
    <ScrollView
      style={[styles.bg, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDashboard(true)} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <VittalLogo />
          <Text style={[styles.headerEyebrow, { color: colors.muted }]}>Panel clínico</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Dr. {appUser?.name?.split(' ')[0] ?? 'Médico'}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            {doctor?.specialty ? `${doctor.specialty} · CMP ${doctor.cmp}` : 'Seguimiento de pacientes asignados'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate('Notifications')} style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.bellIcon, { color: colors.text }]}>🔔</Text>
            {unreadCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Account')} style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <IconCircle size={28} bg={colors.primarySoft}>
              <Text style={{ color: colors.primaryDark, fontWeight: fontWeight.black, fontSize: 13 }}>{initials(appUser?.name)}</Text>
            </IconCircle>
          </Pressable>
        </View>
      </View>

      <Card style={[styles.heroCard, { backgroundColor: colors.primary }]} withShadow={false}>
        <Text style={styles.heroEyebrow}>Dashboard profesional</Text>
        <Text style={styles.heroTitle}>Tus pacientes asignados aparecen aquí automáticamente</Text>
        <Text style={styles.heroSubtitle}>
          El flujo quedó unificado para que la asignación del paciente al doctor alimente directamente este panel y sus vistas clínicas.
        </Text>
        <View style={styles.heroPills}>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>{patients.length} pacientes</Text>
          </View>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>{totalAlerts} alertas activas</Text>
          </View>
        </View>
      </Card>

      <View style={styles.statsGrid}>
        <Card style={styles.statCard} withShadow={false}>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Asignados</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>{patients.length}</Text>
          <Text style={[styles.statMeta, { color: colors.muted }]}>Pacientes en seguimiento</Text>
        </Card>
        <Card style={styles.statCard} withShadow={false}>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Monitoreados</Text>
          <Text style={[styles.statValue, { color: colors.text }]}>{monitoredPatients}</Text>
          <Text style={[styles.statMeta, { color: colors.muted }]}>Con signos vitales</Text>
        </Card>
        <Card style={styles.statCard} withShadow={false}>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Alertas</Text>
          <Text style={[styles.statValue, { color: totalAlerts > 0 ? colors.danger : colors.text }]}>{totalAlerts}</Text>
          <Text style={[styles.statMeta, { color: colors.muted }]}>Pendientes de revisar</Text>
        </Card>
        <Card style={styles.statCard} withShadow={false}>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Última actividad</Text>
          <Text style={[styles.statValueSmall, { color: colors.text }]}>{latestActivity}</Text>
          <Text style={[styles.statMeta, { color: colors.muted }]}>Último dato recibido</Text>
        </Card>
      </View>

      <Card withShadow={false}>
        <View style={styles.toolbarRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toolbarTitle, { color: colors.text }]}>Panel de pacientes</Text>
            <Text style={[styles.toolbarSubtitle, { color: colors.muted }]}>Priorizado por alertas activas y asignación reciente.</Text>
          </View>
          <Button label="Buscar paciente" onPress={() => navigation.navigate('PatientSearch')} fullWidth={false} />
        </View>
      </Card>

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Mis pacientes</Text>

      {!loading && sortedPatients.length === 0 ? (
        <Card>
          <EmptyState
            title="Aún no tienes pacientes asignados"
            subtitle="Cuando un cuidador te seleccione o tomes un paciente desde el buscador, aparecerá aquí de inmediato."
          />
        </Card>
      ) : (
        sortedPatients.map((patient) => {
          const state = getPatientState(patient);
          const vitals = latestVitals[patient.id];
          return (
            <Card key={patient.id} withShadow={false} style={styles.patientCard}>
              <View style={styles.patientHeader}>
                <View style={styles.patientIdentity}>
                  <IconCircle size={48} bg={colors.primarySoft}>
                    <Text style={{ color: colors.primaryDark, fontWeight: fontWeight.black, fontSize: 16 }}>{initials(patient.full_name)}</Text>
                  </IconCircle>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.patientName, { color: colors.text }]}>{patient.full_name}</Text>
                    <Text style={[styles.patientMeta, { color: colors.muted }]}>Última lectura: {formatWhen(vitals?.recorded_at ?? null)}</Text>
                    <Text style={[styles.patientMeta, { color: colors.muted }]}>Asignado: {formatWhen(patient.assigned_at ?? null)}</Text>
                  </View>
                </View>
                <Badge label={state.label} color={state.color} soft={state.soft} size="sm" />
              </View>

              <View style={styles.metricsGrid}>
                <View style={[styles.metricCard, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>Frecuencia</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{vitals?.heart_rate ?? '--'} bpm</Text>
                </View>
                <View style={[styles.metricCard, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>Oxígeno</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{vitals?.oxygen_level ?? '--'}%</Text>
                </View>
                <View style={[styles.metricCard, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>Temperatura</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{vitals?.temperature ?? '--'}°C</Text>
                </View>
                <View style={[styles.metricCard, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                  <Text style={[styles.metricLabel, { color: colors.muted }]}>Presión</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{vitals?.blood_pressure ?? '--'}</Text>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <Button
                  label="Ver tendencias"
                  onPress={() => navigation.navigate('VitalsHistory', { patientId: patient.id, patientName: patient.full_name })}
                  variant="secondary"
                />
                <Button
                  label="Notas médicas"
                  onPress={() =>
                    doctor?.id &&
                    navigation.navigate('DoctorNotes', {
                      patientId: patient.id,
                      patientName: patient.full_name,
                      doctorId: doctor.id,
                    })
                  }
                  variant="accent"
                />
              </View>
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 16 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: fontWeight.black },
  headerEyebrow: { marginTop: spacing.md, fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  headerTitle: { marginTop: 2, fontSize: fontSize.xxl, fontWeight: fontWeight.black, letterSpacing: -0.4 },
  headerSubtitle: { marginTop: spacing.xs, fontSize: fontSize.sm },
  heroCard: { padding: spacing.xl },
  heroEyebrow: { color: '#DBEAFE', fontSize: fontSize.xs, fontWeight: fontWeight.black, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { color: '#FFFFFF', fontSize: fontSize.xl, fontWeight: fontWeight.black, marginTop: spacing.sm, lineHeight: 28 },
  heroSubtitle: { color: '#E8F1FF', marginTop: spacing.sm, lineHeight: 20, fontSize: fontSize.sm },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  heroPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.18)' },
  heroPillText: { color: '#FFFFFF', fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: { width: '47%', minHeight: 120 },
  statLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { marginTop: spacing.sm, fontSize: fontSize.xxl, fontWeight: fontWeight.black },
  statValueSmall: { marginTop: spacing.sm, fontSize: fontSize.base, fontWeight: fontWeight.black, lineHeight: 22 },
  statMeta: { marginTop: spacing.sm, fontSize: fontSize.xs },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toolbarTitle: { fontSize: fontSize.base, fontWeight: fontWeight.black },
  toolbarSubtitle: { marginTop: spacing.xs, fontSize: fontSize.sm },
  sectionLabel: { fontSize: fontSize.lg, fontWeight: fontWeight.black, marginTop: spacing.sm },
  patientCard: { gap: spacing.md },
  patientHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  patientIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  patientName: { fontSize: fontSize.base, fontWeight: fontWeight.black },
  patientMeta: { marginTop: 2, fontSize: fontSize.xs },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: { width: '48%', borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  metricLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { marginTop: spacing.xs, fontSize: fontSize.base, fontWeight: fontWeight.black },
  actionsRow: { gap: spacing.sm },
});

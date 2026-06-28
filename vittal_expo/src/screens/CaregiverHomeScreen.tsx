import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { emitAppEvent, onAppEvent } from '../lib/appEvents';
import { Caregiver, Patient, countUnreadNotifications, getCurrentCaregiver, supabase } from '../lib/supabase';
import { VittalLogo } from '../ui/VittalLogo';
import { useTheme } from '../ui/theme';
import { Card, IconCircle } from '../ui/components';
import { radius, spacing, fontSize, fontWeight } from '../ui/tokens';

export type CaregiverStackParamList = {
  CaregiverHome: undefined;
  CaregiverDashboard: undefined;
  CaregiverMap: undefined;
  DoctorsDirectory: undefined;
  VitalsHistory: { patientId: string; patientName: string };
  Smartwatch: { patientId: string; patientName: string };
  Notifications: undefined;
  Account: undefined;
};

type Props = NativeStackScreenProps<CaregiverStackParamList, 'CaregiverHome'>;

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function CaregiverHomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [alertsCount, setAlertsCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const caregiverRes = await getCurrentCaregiver();
      if (cancelled) return;
      setCaregiver(caregiverRes);

      if (caregiverRes?.id) {
        const { data: patients } = await supabase.from('patients').select('*').eq('caregiver_id', caregiverRes.id).order('created_at', { ascending: false }).limit(1);
        if (cancelled) return;
        setPatient((patients?.[0] as Patient) ?? null);

        if (patients?.[0]?.id) {
          const { count } = await supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('patient_id', patients[0].id).eq('status', 'pending');
          if (cancelled) return;
          setAlertsCount(count ?? 0);
        }
      }

      const unread = await countUnreadNotifications();
      if (!cancelled) setUnreadCount(unread);

      setLoading(false);
    }
    load();

    const unsubscribeEvent = onAppEvent('notificationsUpdated', () => {
      void countUnreadNotifications().then((count) => {
        if (!cancelled) setUnreadCount(count);
      });
    });

    const channel = supabase
      .channel('caregiver-notifications-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_inbox' }, () => {
        emitAppEvent('notificationsUpdated');
      })
      .subscribe();

    return () => {
      cancelled = true;
      unsubscribeEvent();
      supabase.removeChannel(channel);
    };
  }, []);

  async function onLogout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.bg, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <VittalLogo />
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
              <Text style={{ color: colors.primaryDark, fontWeight: fontWeight.black, fontSize: 13 }}>{initials(undefined)}</Text>
            </IconCircle>
          </Pressable>
          <Pressable onPress={onLogout} style={[styles.smallBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.smallBtnText, { color: colors.text }]}>Salir</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.greeting, { color: colors.text }]}>{greeting()} 👋</Text>
      <Text style={[styles.greetingSub, { color: colors.muted }]}>
        {patient?.full_name ? `Así está ${patient.full_name.split(' ')[0]} hoy.` : 'Vamos a configurar el seguimiento.'}
      </Text>

      {alertsCount > 0 && (
        <Pressable onPress={() => navigation.navigate('CaregiverDashboard')} style={[styles.alertBanner, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
          <View style={[styles.alertDotWrap, { backgroundColor: colors.danger }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: colors.danger }]}>
              {alertsCount} alerta{alertsCount === 1 ? '' : 's'} pendiente{alertsCount === 1 ? '' : 's'}
            </Text>
            <Text style={[styles.alertSubtitle, { color: colors.danger }]}>Toca para revisar el dashboard.</Text>
          </View>
        </Pressable>
      )}

      <Card style={styles.heroCard} withShadow={false}>
        <View style={[styles.heroGlow, { backgroundColor: colors.primary }]} />
        <View style={styles.patientRow}>
          <IconCircle size={56} bg={colors.primarySoft}>
            <Text style={{ color: colors.primaryDark, fontWeight: fontWeight.black, fontSize: 20 }}>{initials(patient?.full_name)}</Text>
          </IconCircle>
          <View style={{ flex: 1 }}>
            <Text style={[styles.patientLabel, { color: colors.muted }]}>Paciente</Text>
            <Text style={[styles.patientName, { color: colors.text }]}>{patient?.full_name ?? 'Sin paciente registrado'}</Text>
            {patient?.dni ? <Text style={[styles.patientMeta, { color: colors.muted }]}>DNI {patient.dni}</Text> : null}
          </View>
        </View>

        <View style={styles.quickActions}>
          <Pressable onPress={() => navigation.navigate('CaregiverDashboard')} style={[styles.actionTile, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
            <Text style={styles.actionEmoji}>💓</Text>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Dashboard</Text>
          </Pressable>
          <Pressable
            onPress={() => patient?.id && navigation.navigate('VitalsHistory', { patientId: patient.id, patientName: patient.full_name })}
            disabled={!patient?.id}
            style={[styles.actionTile, { backgroundColor: colors.bgAlt, borderColor: colors.border }, !patient?.id && styles.disabled]}
          >
            <Text style={styles.actionEmoji}>📈</Text>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Tendencias</Text>
          </Pressable>
          <Pressable
            onPress={() => patient?.id && navigation.navigate('Smartwatch', { patientId: patient.id, patientName: patient.full_name })}
            disabled={!patient?.id}
            style={[styles.actionTile, { backgroundColor: colors.bgAlt, borderColor: colors.border }, !patient?.id && styles.disabled]}
          >
            <Text style={styles.actionEmoji}>⌚</Text>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Reloj</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('CaregiverMap')} style={[styles.actionTile, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
            <Text style={styles.actionEmoji}>📍</Text>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Ubicación</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('DoctorsDirectory')} style={[styles.actionTile, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
            <Text style={styles.actionEmoji}>🩺</Text>
            <Text style={[styles.actionLabel, { color: colors.text }]}>Doctores</Text>
          </Pressable>
        </View>
      </Card>

      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Tu información</Text>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.muted }]}>Teléfono</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{caregiver?.phone ?? 'Sin registrar'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.muted }]}>Dirección</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{caregiver?.address ?? 'Sin registrar'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.muted }]}>Relación</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{caregiver?.relation_to_patient ?? 'Sin registrar'}</Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bg: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  smallBtn: { paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1 },
  smallBtnText: { fontWeight: fontWeight.black, fontSize: fontSize.sm },
  greeting: { fontSize: fontSize.xxl, fontWeight: fontWeight.black, letterSpacing: -0.5, marginTop: spacing.sm },
  greetingSub: { fontSize: fontSize.base },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  alertDotWrap: { width: 10, height: 10, borderRadius: 5 },
  alertTitle: { fontWeight: fontWeight.black, fontSize: fontSize.sm },
  alertSubtitle: { fontSize: fontSize.xs, marginTop: 2 },
  heroCard: { padding: spacing.xl, overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: -60, right: -60, width: 160, height: 160, borderRadius: 80, opacity: 0.08 },
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  patientLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  patientName: { fontSize: fontSize.lg, fontWeight: fontWeight.black, marginTop: 2 },
  patientMeta: { fontSize: fontSize.xs, marginTop: 2 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
  actionTile: {
    width: '47%',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  disabled: { opacity: 0.45 },
  actionEmoji: { fontSize: 22 },
  actionLabel: { fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  cardTitle: { fontSize: fontSize.base, fontWeight: fontWeight.black, marginBottom: spacing.md },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  infoLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  infoValue: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, maxWidth: '60%', textAlign: 'right' },
});

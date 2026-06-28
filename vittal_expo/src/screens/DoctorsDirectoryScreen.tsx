import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { emitAppEvent } from '../lib/appEvents';
import { Caregiver, Doctor, notifyDoctorAssigned, Patient, getCurrentCaregiver, supabase } from '../lib/supabase';
import { CaregiverStackParamList } from './CaregiverHomeScreen';
import { useTheme } from '../ui/theme';
import { Button, Card, EmptyState, IconCircle, TopBar } from '../ui/components';
import { FormField } from '../ui/components/FormField';
import { spacing, fontSize, fontWeight, radius } from '../ui/tokens';

type Props = NativeStackScreenProps<CaregiverStackParamList, 'DoctorsDirectory'>;

function initials(name: string | null | undefined): string {
  if (!name) return 'Dr';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function DoctorsDirectoryScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<(Doctor & { name?: string })[]>([]);
  const [query, setQuery] = useState('');
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [doctorRes, caregiverRes] = await Promise.all([
        supabase.from('doctors').select('*, users:user_id(name)').order('specialty', { ascending: true }),
        getCurrentCaregiver(),
      ]);
      if (cancelled) return;
      const mapped = (doctorRes.data ?? []).map((d: any) => ({ ...d, name: d.users?.name ?? 'Doctor' }));
      setDoctors(mapped);
      setCaregiver(caregiverRes);

      if (caregiverRes?.id) {
        const { data: patients } = await supabase
          .from('patients')
          .select('*')
          .eq('caregiver_id', caregiverRes.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (cancelled) return;
        setPatient((patients?.[0] as Patient) ?? null);
      } else {
        setPatient(null);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q.length) return doctors;
    return doctors.filter((d) => `${d.name ?? ''} ${d.specialty ?? ''}`.toLowerCase().includes(q));
  }, [doctors, query]);

  function openWhatsapp(whatsapp: string | null) {
    if (!whatsapp) return;
    const digits = whatsapp.replace(/[^\d]/g, '');
    Linking.openURL(`https://wa.me/${digits}`);
  }

  async function assignDoctor(doctor: Doctor & { name?: string }) {
    if (!patient?.id) {
      Alert.alert('Paciente', 'Primero necesitas tener un paciente registrado.');
      return;
    }

    setAssigningId(doctor.id);
    try {
      const { error } = await supabase
        .from('patients')
        .update({
          assignment_status: 'assigned',
          assigned_doctor_id: doctor.id,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', patient.id)
        .eq('caregiver_id', caregiver?.id ?? '');

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      setPatient((prev) =>
        prev
          ? {
              ...prev,
              assignment_status: 'assigned',
              assigned_doctor_id: doctor.id,
              assigned_at: new Date().toISOString(),
            }
          : prev,
      );
      const notification = await notifyDoctorAssigned(patient.id, doctor.id);
      emitAppEvent('profileUpdated');
      Alert.alert(
        notification.error ? 'Asignado con aviso pendiente' : 'Listo',
        notification.error
          ? `${patient.full_name} fue asignado, pero no se pudo notificar al doctor: ${notification.error}`
          : `${patient.full_name} ahora tiene asignado a ${doctor.name ?? 'tu doctor'}.`,
      );
    } finally {
      setAssigningId(null);
    }
  }

  const assignedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === patient?.assigned_doctor_id) ?? null,
    [doctors, patient?.assigned_doctor_id],
  );

  return (
    <View style={[styles.bg, { backgroundColor: colors.bg }]}>
      <TopBar title="Directorio de doctores" onBack={() => navigation.goBack()} />
      <View style={styles.searchWrap}>
        <FormField value={query} onChangeText={setQuery} placeholder="Buscar por nombre o especialidad" />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={[styles.assignmentCard, { backgroundColor: colors.primary }]} withShadow={false}>
          <Text style={styles.assignmentEyebrow}>Asignación clínica</Text>
          <Text style={styles.assignmentTitle}>{patient?.full_name ?? 'Sin paciente registrado'}</Text>
          <Text style={styles.assignmentSubtitle}>
            {assignedDoctor
              ? `Doctor actual: ${assignedDoctor.name ?? 'Doctor'} · ${assignedDoctor.specialty ?? 'Especialidad no definida'}`
              : 'Elige un doctor para que pueda ver el expediente y el monitoreo de tu paciente.'}
          </Text>
          {patient?.assigned_at ? <Text style={styles.assignmentMeta}>Asignado el {new Date(patient.assigned_at).toLocaleString('es-PE')}</Text> : null}
        </Card>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !patient?.id ? (
          <Card>
            <EmptyState title="No hay paciente aún" subtitle="Completa primero el perfil del cuidador con un paciente para poder asignar un doctor." />
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState title="Sin resultados" subtitle="Prueba con otro nombre o especialidad." />
          </Card>
        ) : (
          filtered.map((d) => (
            <Card key={d.id} withShadow={false}>
              <View style={styles.row}>
                <IconCircle size={48} bg={colors.primarySoft}>
                  <Text style={{ color: colors.primaryDark, fontWeight: fontWeight.black, fontSize: 16 }}>{initials(d.name)}</Text>
                </IconCircle>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{d.name}</Text>
                  <Text style={[styles.specialty, { color: colors.primaryDark }]}>{d.specialty ?? 'Especialidad sin definir'}</Text>
                  {d.schedule ? <Text style={[styles.meta, { color: colors.muted }]}>{d.schedule}</Text> : null}
                  {d.cmp ? <Text style={[styles.meta, { color: colors.muted }]}>CMP {d.cmp}</Text> : null}
                </View>
              </View>
              <View style={styles.actions}>
                <Button
                  label={
                    patient.assigned_doctor_id === d.id
                      ? 'Doctor seleccionado'
                      : patient.assigned_doctor_id
                        ? 'Cambiar a este doctor'
                        : 'Seleccionar doctor'
                  }
                  onPress={() => assignDoctor(d)}
                  variant={patient.assigned_doctor_id === d.id ? 'secondary' : 'primary'}
                  disabled={assigningId !== null}
                  loading={assigningId === d.id}
                />
                {d.whatsapp ? <Button label="Contactar por WhatsApp" onPress={() => openWhatsapp(d.whatsapp)} variant="accent" /> : null}
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  searchWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.md },
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  assignmentCard: { padding: spacing.xl },
  assignmentEyebrow: { color: '#DBEAFE', fontSize: fontSize.xs, fontWeight: fontWeight.black, textTransform: 'uppercase', letterSpacing: 0.8 },
  assignmentTitle: { color: '#FFFFFF', fontSize: fontSize.xl, fontWeight: fontWeight.black, marginTop: spacing.sm },
  assignmentSubtitle: { color: '#E8F1FF', marginTop: spacing.sm, lineHeight: 20, fontSize: fontSize.sm },
  assignmentMeta: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  name: { fontSize: fontSize.base, fontWeight: fontWeight.black },
  specialty: { marginTop: 2, fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  meta: { marginTop: 2, fontSize: fontSize.xs },
  actions: { marginTop: spacing.md, gap: spacing.sm },
});

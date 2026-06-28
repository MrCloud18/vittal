import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { notifyPatientClaimed, Patient, getCurrentDoctor, supabase } from '../lib/supabase';
import { DoctorStackParamList } from './DoctorHomeScreen';
import { useTheme } from '../ui/theme';
import { Badge, Button, Card, EmptyState, TopBar } from '../ui/components';
import { FormField } from '../ui/components/FormField';
import { spacing, fontSize, fontWeight } from '../ui/tokens';

type Props = NativeStackScreenProps<DoctorStackParamList, 'PatientSearch'>;

export function PatientSearchScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Patient[]>([]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSearch = useMemo(() => !loading, [loading]);
  const cleanQuery = useMemo(() => query.trim(), [query]);

  async function loadPatients(q: string) {
    setLoading(true);
    try {
      const doctor = await getCurrentDoctor();
      const currentDoctorId = doctor?.id ?? null;
      setDoctorId(currentDoctorId);
      const value = q.trim();
      let request = supabase
        .from('patients')
        .select('*')
        .or(currentDoctorId ? `assignment_status.eq.available,assigned_doctor_id.eq.${currentDoctorId}` : 'assignment_status.eq.available')
        .order('created_at', { ascending: false })
        .limit(30);

      if (!value.length) {
        const { data, error } = await request;
        if (error) throw error;
        setResults((data as Patient[]) ?? []);
        return;
      }

      request = /^\d+$/.test(value) ? request.eq('dni', value) : request.ilike('full_name', `%${value}%`);
      const { data, error } = await request;
      if (error) throw error;
      setResults((data as Patient[]) ?? []);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo cargar pacientes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPatients('');
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const value = query.trim();
      if (!value.length) loadPatients('');
      else if (value.length >= 2) loadPatients(value);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  async function onTake(patientId: string) {
    setLoading(true);
    try {
      const doctor = await getCurrentDoctor();
      if (!doctor?.id) {
        Alert.alert('Error', 'No se encontró perfil de doctor.');
        return;
      }
      const { data: updatedPatient, error: updateError } = await supabase
        .from('patients')
        .update({
          assignment_status: 'assigned',
          assigned_doctor_id: doctor.id,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', patientId)
        .eq('assignment_status', 'available')
        .is('assigned_doctor_id', null)
        .select('id')
        .maybeSingle();

      if (updateError) {
        Alert.alert('Error', updateError.message);
        return;
      }

      if (!updatedPatient) {
        Alert.alert('Paciente tomado', 'Otro doctor ya tomó este paciente. Actualiza la lista.');
        await loadPatients(cleanQuery);
        return;
      }

      const notification = await notifyPatientClaimed(patientId);
      if (notification.error) {
        Alert.alert('Asignado', `Paciente asignado correctamente, pero no se pudo notificar al cuidador: ${notification.error}`);
      } else {
        Alert.alert('Listo', 'Paciente asignado correctamente a tu panel clínico.');
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo asignar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={[styles.bg, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <TopBar title="Pacientes disponibles" onBack={() => navigation.goBack()} />

      <Card style={[styles.heroCard, { backgroundColor: colors.primary }]} withShadow={false}>
        <Text style={styles.heroEyebrow}>Flujo médico</Text>
        <Text style={styles.heroTitle}>Toma exclusiva de pacientes</Text>
        <Text style={styles.heroSubtitle}>
          Solo aparecen pacientes libres o los que ya te pertenecen. Cuando tomas uno, desaparece para los demás doctores.
        </Text>
      </Card>

      <Card>
        <FormField
          value={query}
          onChangeText={(value) => setQuery(value.replace(/[^A-Za-zÀ-ÿ0-9\s]/g, '').slice(0, 80))}
          placeholder="Nombre o DNI"
          helper="Busca por nombre o solo números si vas por DNI."
        />
        <View style={{ marginTop: spacing.md }}>
          <Button label={loading ? 'Cargando…' : 'Actualizar'} onPress={() => loadPatients(query)} disabled={!canSearch} loading={loading} />
        </View>
      </Card>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {!loading && results.length === 0 && (
        <Card>
          <EmptyState title="No se encontraron pacientes" subtitle="Prueba con otro nombre o número de DNI." />
        </Card>
      )}

      {results.map((p) => {
        const isMine = p.assigned_doctor_id === doctorId;
        return (
          <Card key={p.id} withShadow={false}>
            <View style={styles.patientHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{p.full_name}</Text>
                <Text style={[styles.row, { color: colors.muted }]}>DNI: {p.dni ?? '-'}</Text>
                <Text style={[styles.row, { color: colors.muted }]}>Nacimiento: {p.birth_date ?? '-'}</Text>
              </View>
              <Badge label={isMine ? 'Ya es tuyo' : 'Libre'} color={isMine ? colors.accent : colors.primary} soft={isMine ? colors.accentSoft : colors.primarySoft} size="sm" />
            </View>
            <View style={{ marginTop: spacing.md }}>
              <Button
                label={isMine ? 'Ya asignado a ti' : 'Tomar paciente'}
                onPress={() => (isMine ? navigation.goBack() : onTake(p.id))}
                disabled={loading}
                variant={isMine ? 'accent' : 'primary'}
              />
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.md },
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  heroCard: { padding: spacing.xl },
  heroEyebrow: { color: '#DBEAFE', fontSize: fontSize.xs, fontWeight: fontWeight.black, textTransform: 'uppercase', letterSpacing: 0.8 },
  heroTitle: { color: '#fff', fontSize: fontSize.xl, fontWeight: fontWeight.black, marginTop: spacing.sm },
  heroSubtitle: { color: '#E8F1FF', marginTop: spacing.sm, lineHeight: 20, fontSize: fontSize.sm },
  patientHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  name: { fontSize: fontSize.base, fontWeight: fontWeight.black, marginBottom: spacing.xs },
  row: { marginBottom: 4, fontSize: fontSize.sm },
});

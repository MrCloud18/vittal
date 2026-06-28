import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Caregiver, Patient, getCurrentCaregiver, supabase } from '../lib/supabase';
import { CaregiverStackParamList } from './CaregiverHomeScreen';
import { useTheme } from '../ui/theme';
import { Button, Card, EmptyState, TopBar } from '../ui/components';
import { radius, spacing, fontSize, fontWeight } from '../ui/tokens';

type Props = NativeStackScreenProps<CaregiverStackParamList, 'CaregiverMap'>;

type LocationRow = {
  id: string;
  patient_id: string | null;
  caregiver_id: string | null;
  lat: number;
  lng: number;
  status: string | null;
  recorded_at: string | null;
};

type AlertRow = { severity: string | null; status: string | null };

type DeviceCoords = {
  lat: number;
  lng: number;
  recorded_at: string;
};

const DEFAULT_REGION: Region = {
  latitude: -12.0464,
  longitude: -77.0428,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

export function CaregiverMapScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [caregiverLoc, setCaregiverLoc] = useState<LocationRow | null>(null);
  const [patientLoc, setPatientLoc] = useState<LocationRow | null>(null);
  const [patientAlert, setPatientAlert] = useState<AlertRow | null>(null);
  const [deviceCoords, setDeviceCoords] = useState<DeviceCoords | null>(null);

  function severityColor(sev: string | null): string {
    if (sev === 'critical') return colors.critical;
    if (sev === 'high') return colors.danger;
    if (sev === 'medium') return colors.warning;
    return colors.success;
  }

  const patientColor = useMemo(() => severityColor(patientAlert?.severity ?? null), [patientAlert, colors]);

  async function getCurrentDeviceCoords(): Promise<DeviceCoords | null> {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      let status = permission.status;
      if (status !== 'granted') {
        const request = await Location.requestForegroundPermissionsAsync();
        status = request.status;
      }
      if (status !== 'granted') return null;

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        recorded_at: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const currentDeviceCoords = await getCurrentDeviceCoords();
      if (!cancelled) {
        setDeviceCoords(currentDeviceCoords);
      }
      const c = await getCurrentCaregiver();
      if (cancelled) return;
      setCaregiver(c);
      if (c?.id) {
        const { data: pats } = await supabase.from('patients').select('*').eq('caregiver_id', c.id).order('created_at', { ascending: false }).limit(1);
        const p = (pats?.[0] as Patient) ?? null;
        if (cancelled) return;
        setPatient(p);

        const { data: cLocs } = await supabase.from('locations').select('*').eq('caregiver_id', c.id).order('recorded_at', { ascending: false }).limit(1);
        if (cancelled) return;
        setCaregiverLoc((cLocs?.[0] as any) ?? null);

        if (p?.id) {
          const { data: pLocs } = await supabase.from('locations').select('*').eq('patient_id', p.id).order('recorded_at', { ascending: false }).limit(1);
          if (cancelled) return;
          setPatientLoc((pLocs?.[0] as any) ?? null);

          const { data: al } = await supabase.from('alerts').select('severity,status').eq('patient_id', p.id).eq('status', 'pending').order('triggered_at', { ascending: false }).limit(1);
          if (cancelled) return;
          setPatientAlert((al?.[0] as any) ?? null);
        }
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const region: Region = useMemo(() => {
    const baseLat = Number(deviceCoords?.lat ?? patientLoc?.lat ?? caregiverLoc?.lat ?? DEFAULT_REGION.latitude);
    const baseLng = Number(deviceCoords?.lng ?? patientLoc?.lng ?? caregiverLoc?.lng ?? DEFAULT_REGION.longitude);
    if (!isValidCoordinate(baseLat, baseLng)) return DEFAULT_REGION;
    return { latitude: baseLat, longitude: baseLng, latitudeDelta: DEFAULT_REGION.latitudeDelta, longitudeDelta: DEFAULT_REGION.longitudeDelta };
  }, [deviceCoords, patientLoc, caregiverLoc]);

  const hasDeviceMarker = isValidCoordinate(deviceCoords?.lat, deviceCoords?.lng);
  const hasCaregiverMarker = isValidCoordinate(caregiverLoc?.lat, caregiverLoc?.lng);
  const hasPatientMarker = isValidCoordinate(patientLoc?.lat, patientLoc?.lng);
  const canRenderMap = true;

  async function upsertCaregiverLocation() {
    if (!caregiver?.id) return;
    setSaving(true);
    try {
      const currentDeviceCoords = await getCurrentDeviceCoords();
      if (!currentDeviceCoords) {
        Alert.alert('Permiso', 'Se necesita permiso de ubicación.');
        return;
      }
      setDeviceCoords(currentDeviceCoords);
      const lat = currentDeviceCoords.lat;
      const lng = currentDeviceCoords.lng;

      const { error } = await supabase.from('locations').insert({ caregiver_id: caregiver.id, lat, lng, status: 'normal' });
      if (error) throw error;

      const { data: cLocs } = await supabase.from('locations').select('*').eq('caregiver_id', caregiver.id).order('recorded_at', { ascending: false }).limit(1);
      setCaregiverLoc((cLocs?.[0] as any) ?? null);
      if (patient?.id) {
        const { data: pLocs } = await supabase.from('locations').select('*').eq('patient_id', patient.id).order('recorded_at', { ascending: false }).limit(1);
        setPatientLoc((pLocs?.[0] as any) ?? null);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar ubicación.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.bg, { backgroundColor: colors.bg }]}>
      <TopBar title="Ubicación" onBack={() => navigation.goBack()} />

      <View style={[styles.mapWrap, { borderColor: colors.border }]}>
        {canRenderMap ? (
          <MapView style={StyleSheet.absoluteFill} initialRegion={region} region={region}>
            {hasDeviceMarker ? (
              <Marker
                coordinate={{ latitude: Number(deviceCoords?.lat), longitude: Number(deviceCoords?.lng) }}
                title="Mi dispositivo"
                description={deviceCoords?.recorded_at ?? ''}
                pinColor={colors.primary}
              />
            ) : null}
            {hasCaregiverMarker ? (
              <Marker
                coordinate={{ latitude: Number(caregiverLoc?.lat), longitude: Number(caregiverLoc?.lng) }}
                title="Última ubicación guardada"
                description={caregiverLoc?.recorded_at ?? ''}
                pinColor={colors.primaryDark}
              />
            ) : null}
            {hasPatientMarker ? (
              <Marker
                coordinate={{ latitude: Number(patientLoc?.lat), longitude: Number(patientLoc?.lng) }}
                title="Paciente / smartwatch"
                description={patientLoc?.recorded_at ?? ''}
                pinColor={patientColor}
              />
            ) : null}
          </MapView>
        ) : (
          <View style={styles.mapFallback}>
            <Card withShadow={false}>
              <EmptyState
                title="Mapa temporalmente no disponible"
                subtitle="Primero actualiza la ubicación del cuidador o verifica que existan coordenadas válidas para renderizar el mapa."
              />
            </Card>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Button label={saving ? 'Guardando…' : 'Actualizar mi ubicación'} onPress={upsertCaregiverLocation} disabled={saving} loading={saving} />
        <Text style={[styles.small, { color: colors.muted }]}>Paciente: {patient?.full_name ?? '-'}</Text>
        <Text style={[styles.small, { color: colors.muted }]}>
          El mapa abre primero con la ubicación del celular y luego muestra la ubicación remota del paciente/reloj cuando exista.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bg: { flex: 1 },
  mapWrap: { flex: 1, marginHorizontal: spacing.xl, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1 },
  mapFallback: { flex: 1, padding: spacing.md, justifyContent: 'center' },
  footer: { padding: spacing.xl, gap: spacing.md },
  small: { fontSize: fontSize.xs, textAlign: 'center', fontWeight: fontWeight.medium },
});

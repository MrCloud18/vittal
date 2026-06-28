import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AppUser, Role, getCurrentAppUser, getCurrentCaregiver, getCurrentDoctor, supabase } from '../lib/supabase';
import { VittalLogo } from '../ui/VittalLogo';
import { emitAppEvent } from '../lib/appEvents';
import { useTheme } from '../ui/theme';
import { Button, Card } from '../ui/components';
import { FormField } from '../ui/components/FormField';
import { radius, spacing, fontSize, fontWeight } from '../ui/tokens';

export function ProfileSetupScreen() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appUser, setAppUser] = useState<AppUser | null>(null);

  const [countryPicker, setCountryPicker] = useState<'caregiver' | 'doctor' | 'emergency' | null>(null);
  const [caregiverPhoneCountry, setCaregiverPhoneCountry] = useState<{ name: string; dial: string }>({ name: 'Perú', dial: '+51' });
  const [caregiverPhoneLocal, setCaregiverPhoneLocal] = useState('');
  const [caregiverAddress, setCaregiverAddress] = useState('');
  const [caregiverRelation, setCaregiverRelation] = useState('');
  const [addressResults, setAddressResults] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const addressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [patientName, setPatientName] = useState('');
  const [patientDni, setPatientDni] = useState('');
  const [patientBirthDate, setPatientBirthDate] = useState('');
  const [patientConditions, setPatientConditions] = useState('');
  const [patientAllergies, setPatientAllergies] = useState('');
  const [patientMedications, setPatientMedications] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhoneCountry, setEmergencyPhoneCountry] = useState<{ name: string; dial: string }>({ name: 'Perú', dial: '+51' });
  const [emergencyPhoneLocal, setEmergencyPhoneLocal] = useState('');
  const [birthPickerOpen, setBirthPickerOpen] = useState(false);
  const [birthDateValue, setBirthDateValue] = useState<Date | null>(null);

  const [doctorSpecialty, setDoctorSpecialty] = useState('');
  const [doctorCmp, setDoctorCmp] = useState('');
  const [doctorWhatsappCountry, setDoctorWhatsappCountry] = useState<{ name: string; dial: string }>({ name: 'Perú', dial: '+51' });
  const [doctorWhatsappLocal, setDoctorWhatsappLocal] = useState('');
  const [doctorSchedule, setDoctorSchedule] = useState('');

  const role = (appUser?.role ?? null) as Role | null;

  function digitsOnly(input: string): string {
    return input.replace(/[^\d]/g, '');
  }

  function sanitizePersonText(input: string, max = 80): string {
    return input
      .replace(/[^A-Za-zÀ-ÿ\s'’-]/g, '')
      .replace(/\s{2,}/g, ' ')
      .slice(0, max);
  }

  function sanitizeAlphaText(input: string, max = 80): string {
    return input
      .replace(/[^A-Za-zÀ-ÿ0-9\s.,()/#-]/g, '')
      .replace(/\s{2,}/g, ' ')
      .slice(0, max);
  }

  const caregiverPhoneDigits = useMemo(() => digitsOnly(caregiverPhoneLocal).slice(0, 15), [caregiverPhoneLocal]);
  const doctorWhatsappDigits = useMemo(() => digitsOnly(doctorWhatsappLocal).slice(0, 15), [doctorWhatsappLocal]);
  const patientDniDigits = useMemo(() => digitsOnly(patientDni).slice(0, 12), [patientDni]);
  const doctorCmpDigits = useMemo(() => digitsOnly(doctorCmp).slice(0, 12), [doctorCmp]);
  const patientNameOk = useMemo(() => patientName.trim().length >= 3, [patientName]);
  const caregiverPhoneOk = useMemo(() => caregiverPhoneDigits.length >= 6 && caregiverPhoneDigits.length <= 15, [caregiverPhoneDigits.length]);
  const doctorSpecialtyOk = useMemo(() => doctorSpecialty.trim().length >= 3, [doctorSpecialty]);
  const doctorCmpOk = useMemo(() => doctorCmpDigits.length >= 4, [doctorCmpDigits.length]);

  const caregiverPhoneE164 = useMemo(() => {
    const local = digitsOnly(caregiverPhoneLocal);
    if (!local.length) return '';
    return `${caregiverPhoneCountry.dial}${local}`;
  }, [caregiverPhoneCountry.dial, caregiverPhoneLocal]);

  const doctorWhatsappE164 = useMemo(() => {
    const local = digitsOnly(doctorWhatsappLocal);
    if (!local.length) return null;
    return `${doctorWhatsappCountry.dial}${local}`;
  }, [doctorWhatsappCountry.dial, doctorWhatsappLocal]);

  const emergencyPhoneE164 = useMemo(() => {
    const local = digitsOnly(emergencyPhoneLocal);
    if (!local.length) return null;
    return `${emergencyPhoneCountry.dial}${local}`;
  }, [emergencyPhoneCountry.dial, emergencyPhoneLocal]);

  const LATAM = useMemo(
    () => [
      { name: 'Argentina', dial: '+54' },
      { name: 'Bolivia', dial: '+591' },
      { name: 'Brasil', dial: '+55' },
      { name: 'Chile', dial: '+56' },
      { name: 'Colombia', dial: '+57' },
      { name: 'Costa Rica', dial: '+506' },
      { name: 'Cuba', dial: '+53' },
      { name: 'Ecuador', dial: '+593' },
      { name: 'El Salvador', dial: '+503' },
      { name: 'Guatemala', dial: '+502' },
      { name: 'Honduras', dial: '+504' },
      { name: 'México', dial: '+52' },
      { name: 'Nicaragua', dial: '+505' },
      { name: 'Panamá', dial: '+507' },
      { name: 'Paraguay', dial: '+595' },
      { name: 'Perú', dial: '+51' },
      { name: 'Puerto Rico', dial: '+1' },
      { name: 'República Dominicana', dial: '+1' },
      { name: 'Uruguay', dial: '+598' },
      { name: 'Venezuela', dial: '+58' },
    ],
    [],
  );

  const canSave = useMemo(() => {
    if (!role) return false;
    if (saving) return false;
    if (role === 'caregiver') {
      return caregiverPhoneOk && patientNameOk;
    }
    const whatsappOk = doctorWhatsappDigits.length === 0 || (doctorWhatsappDigits.length >= 6 && doctorWhatsappDigits.length <= 15);
    return doctorSpecialtyOk && doctorCmpOk && whatsappOk;
  }, [role, saving, caregiverPhoneOk, patientNameOk, doctorSpecialtyOk, doctorCmpOk, doctorWhatsappDigits.length]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const user = await getCurrentAppUser();
      if (cancelled) return;
      setAppUser(user);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSignOut() {
    await supabase.auth.signOut();
  }

  function parseListField(input: string): string[] {
    return input
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function formatIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async function fetchAddressSuggestions(q: string) {
    const query = q.trim();
    if (query.length < 4) {
      setAddressResults([]);
      return;
    }
    setAddressLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'es',
          'User-Agent': 'Vittal/1.0 (Expo)',
        },
      });
      const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
      setAddressResults(
        (data ?? []).map((x) => ({
          label: x.display_name,
          lat: Number(x.lat),
          lng: Number(x.lon),
        })),
      );
    } catch {
      setAddressResults([]);
    } finally {
      setAddressLoading(false);
    }
  }

  function onAddressChange(value: string) {
    setCaregiverAddress(value);
    if (addressTimer.current) clearTimeout(addressTimer.current);
    addressTimer.current = setTimeout(() => fetchAddressSuggestions(value), 450);
  }

  async function onSave() {
    if (!appUser?.id || !role || !canSave) return;
    setSaving(true);
    try {
      if (role === 'caregiver') {
        const existingCaregiver = await getCurrentCaregiver();
        let caregiverId = existingCaregiver?.id ?? null;

        if (!caregiverId) {
          const { data: caregiverData, error: caregiverError } = await supabase
            .from('caregivers')
            .insert({
              user_id: appUser.id,
              phone: caregiverPhoneE164,
              address: caregiverAddress.trim().length ? caregiverAddress.trim() : null,
              relation_to_patient: caregiverRelation.trim().length ? caregiverRelation.trim() : null,
            })
            .select('*')
            .single();

          if (caregiverError) throw caregiverError;
          caregiverId = caregiverData.id as string;
        }

        const { data: existingPatient } = await supabase.from('patients').select('id').eq('caregiver_id', caregiverId).limit(1);

        if (!existingPatient || existingPatient.length === 0) {
          const { error: patientError } = await supabase.from('patients').insert({
            caregiver_id: caregiverId,
            full_name: patientName.trim(),
            dni: patientDni.trim().length ? patientDni.trim() : null,
            birth_date: patientBirthDate.trim().length ? patientBirthDate.trim() : null,
            conditions: parseListField(patientConditions),
            allergies: parseListField(patientAllergies),
            medications: parseListField(patientMedications),
            emergency_contact_name: emergencyName.trim().length ? emergencyName.trim() : null,
            emergency_contact_phone: emergencyPhoneE164,
          });
          if (patientError) throw patientError;
        }
      }

      if (role === 'doctor') {
        const existingDoctor = await getCurrentDoctor();
        if (!existingDoctor) {
          const { error: doctorError } = await supabase.from('doctors').insert({
            user_id: appUser.id,
            specialty: doctorSpecialty.trim(),
            cmp: doctorCmp.trim(),
            whatsapp: doctorWhatsappE164,
            schedule: doctorSchedule.trim().length ? doctorSchedule.trim() : null,
          });
          if (doctorError) throw doctorError;
        }
      }

      emitAppEvent('profileUpdated');
      Alert.alert('Listo', 'Perfil completado.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar.');
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

  if (!appUser) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.text }]}>No hay sesión</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.bg, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandWrap}>
          <VittalLogo />
        </View>

        <Card>
          <Text style={[styles.heading, { color: colors.text }]}>Completemos tu perfil</Text>
          <Text style={[styles.subheading, { color: colors.muted }]}>
            {role === 'doctor' ? 'Estos datos aparecen en tu directorio público para cuidadores.' : 'Esto nos ayuda a cuidar mejor a tu paciente.'}
          </Text>

          {role === 'caregiver' && (
            <View style={styles.form}>
              <Text style={[styles.section, { color: colors.primary }]}>Tus datos</Text>
              <View>
                <Text style={[styles.label, { color: colors.text }]}>Teléfono</Text>
                <View style={styles.phoneRow}>
                  <Pressable onPress={() => setCountryPicker('caregiver')} style={[styles.prefixBox, { borderColor: colors.border, backgroundColor: colors.bgAlt }]}>
                    <Text style={[styles.prefixText, { color: colors.text }]}>{caregiverPhoneCountry.dial}</Text>
                    <Text style={[styles.prefixMeta, { color: colors.muted }]}>{caregiverPhoneCountry.name}</Text>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <FormField
                      value={caregiverPhoneLocal}
                      onChangeText={(value) => setCaregiverPhoneLocal(digitsOnly(value).slice(0, 15))}
                      placeholder="Número (solo dígitos)"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
                <Text style={[styles.helper, { color: caregiverPhoneDigits.length === 0 || caregiverPhoneOk ? colors.muted : colors.danger }]}>
                  Usa entre 6 y 15 dígitos.
                </Text>
              </View>

              <FormField
                value={caregiverAddress}
                onChangeText={(value) => onAddressChange(sanitizeAlphaText(value, 140))}
                placeholder="Dirección (opcional)"
              />
              {addressLoading && <Text style={[styles.small, { color: colors.muted }]}>Buscando direcciones…</Text>}
              {addressResults.length > 0 && (
                <View style={[styles.suggestBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <FlatList
                    data={addressResults}
                    keyExtractor={(item) => item.label}
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => {
                          Keyboard.dismiss();
                          setCaregiverAddress(item.label);
                          setAddressResults([]);
                        }}
                        style={[styles.suggestItem, { borderBottomColor: colors.border }]}
                      >
                        <Text style={{ color: colors.text }}>{item.label}</Text>
                      </Pressable>
                    )}
                  />
                </View>
              )}
              <FormField
                value={caregiverRelation}
                onChangeText={(value) => setCaregiverRelation(sanitizePersonText(value, 50))}
                placeholder="Relación con el paciente (opcional)"
              />

              <Text style={[styles.section, { color: colors.primary }]}>Datos del paciente</Text>
              <FormField
                value={patientName}
                onChangeText={(value) => setPatientName(sanitizePersonText(value, 80))}
                placeholder="Nombre completo"
                error={patientName.length > 0 && !patientNameOk ? 'Solo letras y espacios, mínimo 3 caracteres.' : undefined}
              />
              <FormField
                value={patientDni}
                onChangeText={(value) => setPatientDni(digitsOnly(value).slice(0, 12))}
                placeholder="DNI (opcional)"
                keyboardType="number-pad"
                helper="Solo números; si lo completas, usa al menos 6 dígitos."
              />
              <Pressable
                onPress={() => {
                  const initial = birthDateValue ?? (patientBirthDate ? new Date(patientBirthDate) : null) ?? new Date(1960, 0, 1);
                  setBirthDateValue(initial);
                  setBirthPickerOpen(true);
                }}
                style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.bgAlt }]}
              >
                <Text style={[styles.dateBtnText, { color: colors.text }]}>
                  {patientBirthDate ? `Nacimiento: ${patientBirthDate}` : 'Elegir fecha de nacimiento (opcional)'}
                </Text>
              </Pressable>
              {birthPickerOpen && (
                <DateTimePicker
                  value={birthDateValue ?? new Date(1960, 0, 1)}
                  mode="date"
                  display={Platform.OS === 'android' ? 'calendar' : 'default'}
                  onChange={(_e, selected) => {
                    setBirthPickerOpen(false);
                    if (selected) {
                      setBirthDateValue(selected);
                      setPatientBirthDate(formatIsoDate(selected));
                    }
                  }}
                />
              )}
              <FormField
                value={patientConditions}
                onChangeText={(value) => setPatientConditions(sanitizeAlphaText(value, 160))}
                placeholder="Condiciones, separadas por coma (opcional)"
              />
              <FormField
                value={patientAllergies}
                onChangeText={(value) => setPatientAllergies(sanitizeAlphaText(value, 160))}
                placeholder="Alergias, separadas por coma (opcional)"
              />
              <FormField
                value={patientMedications}
                onChangeText={(value) => setPatientMedications(sanitizeAlphaText(value, 160))}
                placeholder="Medicamentos, separados por coma (opcional)"
              />

              <Text style={[styles.section, { color: colors.primary }]}>Contacto de emergencia</Text>
              <FormField
                value={emergencyName}
                onChangeText={(value) => setEmergencyName(sanitizePersonText(value, 70))}
                placeholder="Nombre (opcional)"
              />
              <View style={styles.phoneRow}>
                <Pressable onPress={() => setCountryPicker('emergency')} style={[styles.prefixBox, { borderColor: colors.border, backgroundColor: colors.bgAlt }]}>
                  <Text style={[styles.prefixText, { color: colors.text }]}>{emergencyPhoneCountry.dial}</Text>
                  <Text style={[styles.prefixMeta, { color: colors.muted }]}>{emergencyPhoneCountry.name}</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <FormField
                    value={emergencyPhoneLocal}
                    onChangeText={(value) => setEmergencyPhoneLocal(digitsOnly(value).slice(0, 15))}
                    placeholder="Número (opcional)"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
            </View>
          )}

          {role === 'doctor' && (
            <View style={styles.form}>
              <Text style={[styles.section, { color: colors.primary }]}>Datos del doctor</Text>
              <FormField
                value={doctorSpecialty}
                onChangeText={(value) => setDoctorSpecialty(sanitizePersonText(value, 60))}
                placeholder="Especialidad"
                error={doctorSpecialty.length > 0 && !doctorSpecialtyOk ? 'Solo letras y espacios, mínimo 3 caracteres.' : undefined}
              />
              <FormField
                value={doctorCmp}
                onChangeText={(value) => setDoctorCmp(digitsOnly(value).slice(0, 12))}
                placeholder="CMP"
                keyboardType="number-pad"
                error={doctorCmp.length > 0 && !doctorCmpOk ? 'Solo números, mínimo 4 dígitos.' : undefined}
              />
              <View>
                <Text style={[styles.label, { color: colors.text }]}>WhatsApp (opcional)</Text>
                <View style={styles.phoneRow}>
                  <Pressable onPress={() => setCountryPicker('doctor')} style={[styles.prefixBox, { borderColor: colors.border, backgroundColor: colors.bgAlt }]}>
                    <Text style={[styles.prefixText, { color: colors.text }]}>{doctorWhatsappCountry.dial}</Text>
                    <Text style={[styles.prefixMeta, { color: colors.muted }]}>{doctorWhatsappCountry.name}</Text>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <FormField
                      value={doctorWhatsappLocal}
                      onChangeText={(value) => setDoctorWhatsappLocal(digitsOnly(value).slice(0, 15))}
                      placeholder="Número (solo dígitos)"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
                <Text style={[styles.helper, { color: doctorWhatsappDigits.length === 0 || doctorWhatsappDigits.length >= 6 ? colors.muted : colors.danger }]}>
                  Entre 6 y 15 dígitos si deseas agregar WhatsApp.
                </Text>
              </View>
              <FormField
                value={doctorSchedule}
                onChangeText={(value) => setDoctorSchedule(sanitizeAlphaText(value, 80))}
                placeholder="Horario de atención (opcional)"
              />
            </View>
          )}

          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            <Button label={saving ? 'Guardando…' : 'Guardar y continuar'} onPress={onSave} disabled={!canSave} loading={saving} />
            <Button label="Salir" onPress={onSignOut} variant="secondary" />
          </View>
        </Card>

        <Modal visible={countryPicker !== null} transparent animationType="fade" onRequestClose={() => setCountryPicker(null)}>
          <View style={styles.modalBg}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Código de país</Text>
              <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                {LATAM.map((c) => (
                  <Pressable
                    key={`${c.name}-${c.dial}`}
                    onPress={() => {
                      if (countryPicker === 'caregiver') setCaregiverPhoneCountry(c);
                      if (countryPicker === 'doctor') setDoctorWhatsappCountry(c);
                      if (countryPicker === 'emergency') setEmergencyPhoneCountry(c);
                      setCountryPicker(null);
                    }}
                    style={[styles.modalItem, { borderBottomColor: colors.border }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: fontWeight.bold }}>
                      {c.name} ({c.dial})
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ marginTop: spacing.md }}>
                <Button label="Cerrar" onPress={() => setCountryPicker(null)} variant="secondary" />
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  bg: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.xxl },
  brandWrap: { alignItems: 'center' },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.black },
  heading: { fontSize: fontSize.xxl, fontWeight: fontWeight.black, letterSpacing: -0.4 },
  subheading: { marginTop: spacing.xs, fontSize: fontSize.base, lineHeight: 21 },
  small: { fontSize: fontSize.xs },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  form: { marginTop: spacing.xl, gap: spacing.md },
  section: { marginTop: spacing.md, fontWeight: fontWeight.black, fontSize: fontSize.sm, textTransform: 'uppercase', letterSpacing: 0.4 },
  helper: { marginTop: spacing.xs, fontSize: fontSize.xs },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  prefixBox: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 13, justifyContent: 'center' },
  prefixText: { fontWeight: fontWeight.black },
  prefixMeta: { marginTop: 2, fontWeight: fontWeight.bold, fontSize: 10 },
  suggestBox: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden', maxHeight: 180 },
  suggestItem: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1 },
  dateBtn: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 13 },
  dateBtnText: { fontWeight: fontWeight.bold },
  modalBg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(15,23,42,0.5)' },
  modalCard: { width: '100%', maxWidth: 520, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  modalTitle: { fontWeight: fontWeight.black, fontSize: fontSize.base, marginBottom: spacing.md },
  modalItem: { paddingVertical: spacing.md, borderBottomWidth: 1 },
});

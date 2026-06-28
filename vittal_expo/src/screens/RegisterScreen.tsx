import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Role, supabase } from '../lib/supabase';
import { VittalLogo } from '../ui/VittalLogo';
import { AuthStackParamList } from './LoginScreen';
import { useTheme } from '../ui/theme';
import { Button, Card } from '../ui/components';
import { FormField } from '../ui/components/FormField';
import { caregiverPalette, doctorPalette, radius, spacing, fontSize, fontWeight } from '../ui/tokens';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const ROLE_OPTIONS: { key: Role; title: string; description: string }[] = [
  { key: 'caregiver', title: 'Soy cuidador', description: 'Sigo la salud de un familiar o paciente' },
  { key: 'doctor', title: 'Soy doctor', description: 'Atiendo y monitoreo pacientes' },
];

export function RegisterScreen({ navigation }: Props) {
  const { colors, isDark } = useTheme();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('caregiver');
  const [countryOpen, setCountryOpen] = useState(false);
  const [whatsappCountry, setWhatsappCountry] = useState<{ name: string; dial: string }>({ name: 'Perú', dial: '+51' });
  const [whatsappLocal, setWhatsappLocal] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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

  function digitsOnly(input: string): string {
    return input.replace(/[^\d]/g, '');
  }

  function sanitizePersonName(input: string): string {
    return input
      .replace(/[^A-Za-zÀ-ÿ\s'’-]/g, '')
      .replace(/\s{2,}/g, ' ')
      .slice(0, 70);
  }

  function sanitizeEmail(input: string): string {
    return input.replace(/\s+/g, '').toLowerCase().slice(0, 120);
  }

  const emailOk = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);
  const whatsappDigits = useMemo(() => digitsOnly(whatsappLocal).slice(0, 15), [whatsappLocal]);
  const nameOk = useMemo(() => name.trim().length >= 3, [name]);
  const passwordOk = useMemo(() => password.length >= 6 && password.length <= 64, [password]);

  const whatsappE164 = useMemo(() => {
    const local = digitsOnly(whatsappLocal);
    if (!local.length) return null;
    return `${whatsappCountry.dial}${local}`;
  }, [whatsappCountry.dial, whatsappLocal]);

  const canSubmit = useMemo(() => {
    const whatsappOk = whatsappDigits.length === 0 || (whatsappDigits.length >= 6 && whatsappDigits.length <= 15);
    return nameOk && emailOk && passwordOk && whatsappOk && !loading;
  }, [nameOk, whatsappDigits.length, emailOk, passwordOk, loading]);

  async function onRegister() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim(), role, whatsapp: whatsappE164 } },
      });

      if (error) {
        Alert.alert('No se pudo crear la cuenta', error.message);
        return;
      }

      if (!data.session) {
        Alert.alert('Cuenta creada', 'Revisa tu correo para confirmar tu cuenta y luego inicia sesión.');
        navigation.replace('Login');
        return;
      }

      Alert.alert('Listo', 'Cuenta creada. Iniciando sesión…');
    } catch (e) {
      Alert.alert('Error', 'No se pudo registrar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.bg, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brandWrap}>
          <VittalLogo />
        </View>

        <Card>
          <Text style={[styles.heading, { color: colors.text }]}>Crea tu cuenta</Text>
          <Text style={[styles.subheading, { color: colors.muted }]}>Primero cuéntanos qué rol cumples en Vittal.</Text>

          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map((opt) => {
              const palette = opt.key === 'caregiver' ? caregiverPalette : doctorPalette;
              const roleColors = isDark ? palette.dark : palette.light;
              const selected = role === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setRole(opt.key)}
                  style={[
                    styles.roleCard,
                    {
                      borderColor: selected ? roleColors.primary : colors.border,
                      backgroundColor: selected ? roleColors.primarySoft : colors.bgAlt,
                    },
                  ]}
                >
                  <View style={[styles.roleDot, { backgroundColor: roleColors.primary }]} />
                  <Text style={[styles.roleTitle, { color: selected ? roleColors.primaryDark : colors.text }]}>{opt.title}</Text>
                  <Text style={[styles.roleDesc, { color: colors.muted }]}>{opt.description}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.form}>
            <FormField
              label="Nombre completo"
              value={name}
              onChangeText={(value) => setName(sanitizePersonName(value))}
              placeholder="Como te llamas"
              error={name.length > 0 && !nameOk ? 'Solo letras y espacios, mínimo 3 caracteres.' : undefined}
            />

            <View>
              <Text style={[styles.label, { color: colors.text }]}>WhatsApp (opcional)</Text>
              <View style={styles.phoneRow}>
                <Pressable onPress={() => setCountryOpen(true)} style={[styles.prefixBox, { borderColor: colors.border, backgroundColor: colors.bgAlt }]}>
                  <Text style={[styles.prefixText, { color: colors.text }]}>{whatsappCountry.dial}</Text>
                  <Text style={[styles.prefixMeta, { color: colors.muted }]}>{whatsappCountry.name}</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <FormField
                    value={whatsappLocal}
                    onChangeText={(value) => setWhatsappLocal(digitsOnly(value).slice(0, 15))}
                    placeholder="Número (solo dígitos)"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
              <Text style={[styles.helper, { color: whatsappDigits.length === 0 || whatsappDigits.length >= 6 ? colors.muted : colors.danger }]}>
                Entre 6 y 15 dígitos si deseas agregar WhatsApp.
              </Text>
            </View>

            <FormField
              label="Email"
              value={email}
              onChangeText={(value) => setEmail(sanitizeEmail(value))}
              placeholder="tucorreo@ejemplo.com"
              autoCapitalize="none"
              keyboardType="email-address"
              error={email.length > 0 && !emailOk ? 'Ingresa un correo válido.' : undefined}
            />
            <FormField
              label="Contraseña"
              value={password}
              onChangeText={(value) => setPassword(value.replace(/\s/g, '').slice(0, 64))}
              placeholder="Mínimo 6 caracteres"
              secureTextEntry
              error={password.length > 0 && !passwordOk ? 'De 6 a 64 caracteres, sin espacios.' : undefined}
            />

            <View style={{ marginTop: spacing.sm }}>
              <Button label={loading ? 'Creando…' : 'Crear cuenta'} onPress={onRegister} disabled={!canSubmit} loading={loading} />
            </View>
            <Pressable onPress={() => navigation.replace('Login')} disabled={loading} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.primary }]}>Ya tengo cuenta · Volver</Text>
            </Pressable>
          </View>
        </Card>

        <Modal visible={countryOpen} transparent animationType="fade" onRequestClose={() => setCountryOpen(false)}>
          <View style={styles.modalBg}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Código de país</Text>
              <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                {LATAM.map((c) => (
                  <Pressable
                    key={`${c.name}-${c.dial}`}
                    onPress={() => {
                      setWhatsappCountry(c);
                      setCountryOpen(false);
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
                <Button label="Cerrar" onPress={() => setCountryOpen(false)} variant="secondary" />
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.xxl },
  brandWrap: { alignItems: 'center' },
  heading: { fontSize: fontSize.xxl, fontWeight: fontWeight.black, letterSpacing: -0.4 },
  subheading: { marginTop: spacing.xs, fontSize: fontSize.base, lineHeight: 21 },
  roleRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  roleCard: { flex: 1, borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md },
  roleDot: { width: 10, height: 10, borderRadius: 5, marginBottom: spacing.sm },
  roleTitle: { fontWeight: fontWeight.black, fontSize: fontSize.sm },
  roleDesc: { marginTop: 2, fontSize: 11, lineHeight: 15 },
  form: { marginTop: spacing.xl, gap: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  helper: { marginTop: spacing.xs, fontSize: fontSize.xs },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  prefixBox: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 13, justifyContent: 'center' },
  prefixText: { fontWeight: fontWeight.black },
  prefixMeta: { marginTop: 2, fontWeight: fontWeight.bold, fontSize: 10 },
  linkBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  linkText: { fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  modalBg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(15,23,42,0.5)' },
  modalCard: { width: '100%', maxWidth: 520, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  modalTitle: { fontWeight: fontWeight.black, fontSize: fontSize.base, marginBottom: spacing.md },
  modalItem: { paddingVertical: spacing.md, borderBottomWidth: 1 },
});

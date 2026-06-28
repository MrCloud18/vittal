import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { VittalLogo } from '../ui/VittalLogo';
import { useTheme } from '../ui/theme';
import { Button, Card } from '../ui/components';
import { FormField } from '../ui/components/FormField';
import { spacing, fontSize, fontWeight } from '../ui/tokens';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => email.trim().length > 0 && password.length > 0 && !loading, [email, password, loading]);

  async function onLogin() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        Alert.alert('No pudimos iniciar sesión', error.message);
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo iniciar sesión. Revisa tu conexión e intenta de nuevo.');
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
          <Text style={[styles.heading, { color: colors.text }]}>Bienvenido de vuelta</Text>
          <Text style={[styles.subheading, { color: colors.muted }]}>Ingresa para ver el cuidado de quienes te importan.</Text>

          <View style={styles.form}>
            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="tucorreo@ejemplo.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <FormField
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
            />
            <View style={{ marginTop: spacing.sm }}>
              <Button label={loading ? 'Ingresando…' : 'Ingresar'} onPress={onLogin} disabled={!canSubmit} loading={loading} />
            </View>
            <Pressable onPress={() => navigation.navigate('Register')} disabled={loading} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.primary }]}>¿No tienes cuenta? Regístrate</Text>
            </Pressable>
          </View>
        </Card>

        <Text style={[styles.footerNote, { color: colors.muted }]}>
          Vittal conecta cuidadores y doctores para un seguimiento de salud más cercano.
        </Text>
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
  form: { marginTop: spacing.xl, gap: spacing.md },
  linkBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  linkText: { fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  footerNote: { textAlign: 'center', fontSize: fontSize.xs, paddingHorizontal: spacing.xl },
});

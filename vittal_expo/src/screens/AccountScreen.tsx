import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import { useTheme } from '../ui/theme';
import { AppUser, Caregiver, Doctor, Role, backendUrl, easProjectId, getCurrentAppUser, getCurrentCaregiver, getCurrentDoctor, savePushToken, supabase } from '../lib/supabase';
import { Button, Card, IconCircle, TopBar } from '../ui/components';
import { FormField } from '../ui/components/FormField';
import { radius, spacing, fontSize, fontWeight } from '../ui/tokens';

type Props = {
  onClose?: () => void;
};

const MODES: { key: 'light' | 'dark' | 'system'; label: string }[] = [
  { key: 'light', label: 'Claro' },
  { key: 'dark', label: 'Oscuro' },
  { key: 'system', label: 'Sistema' },
];

export function AccountScreen({ onClose }: Props) {
  const { colors, mode, setMode } = useTheme();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);

  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [relation, setRelation] = useState('');

  const [specialty, setSpecialty] = useState('');
  const [cmp, setCmp] = useState('');
  const [docWhatsapp, setDocWhatsapp] = useState('');
  const [schedule, setSchedule] = useState('');

  const userRole = (appUser?.role ?? null) as Role | null;

  function sanitizePersonText(input: string, max = 80): string {
    return input
      .replace(/[^A-Za-zÀ-ÿ\s'’-]/g, '')
      .replace(/\s{2,}/g, ' ')
      .slice(0, max);
  }

  function sanitizePhone(input: string): string {
    return input.replace(/[^\d+]/g, '').slice(0, 18);
  }

  function sanitizeMixed(input: string, max = 100): string {
    return input
      .replace(/[^A-Za-zÀ-ÿ0-9\s.,()/#+-]/g, '')
      .replace(/\s{2,}/g, ' ')
      .slice(0, max);
  }

  const canSave = useMemo(() => {
    if (!appUser?.id) return false;
    if (saving) return false;
    if (userRole === 'caregiver') return phone.trim().length > 0;
    if (userRole === 'doctor') return specialty.trim().length > 0 && cmp.trim().length > 0;
    return true;
  }, [appUser?.id, saving, userRole, phone, specialty, cmp]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const u = await getCurrentAppUser();
      if (cancelled) return;
      setAppUser(u);
      setName(u?.name ?? '');
      setWhatsapp(u?.whatsapp ?? '');
      setAvatarUrl(u?.avatar_url ?? null);

      if (u?.role === 'caregiver') {
        const c = await getCurrentCaregiver();
        if (cancelled) return;
        setCaregiver(c);
        setPhone(c?.phone ?? '');
        setAddress(c?.address ?? '');
        setRelation(c?.relation_to_patient ?? '');
      }

      if (u?.role === 'doctor') {
        const d = await getCurrentDoctor();
        if (cancelled) return;
        setDoctor(d);
        setSpecialty(d?.specialty ?? '');
        setCmp(d?.cmp ?? '');
        setDocWhatsapp(d?.whatsapp ?? '');
        setSchedule(d?.schedule ?? '');
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onPickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso', 'Se necesita permiso para acceder a tus fotos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ((ImagePicker as any).MediaType?.Images ? [(ImagePicker as any).MediaType.Images] : ImagePicker.MediaTypeOptions.Images) as any,
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
      });
      if (result.canceled) return;

      const uri = result.assets[0]?.uri;
      const base64 = result.assets[0]?.base64;
      if (!uri || !base64 || !appUser?.auth_user_id) return;

      const fileExt = uri.split('.').pop() || 'jpg';
      const path = `${appUser.auth_user_id}/avatar.${fileExt}`;

      function base64ToUint8Array(input: string): Uint8Array {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let str = input.replace(/[\r\n\s]/g, '');
        if (str.length % 4 !== 0) {
          str = str.padEnd(str.length + (4 - (str.length % 4)), '=');
        }
        let outputLen = (str.length / 4) * 3;
        if (str.endsWith('==')) outputLen -= 2;
        else if (str.endsWith('=')) outputLen -= 1;
        const bytes = new Uint8Array(outputLen);

        let p = 0;
        for (let i = 0; i < str.length; i += 4) {
          const enc1 = chars.indexOf(str.charAt(i));
          const enc2 = chars.indexOf(str.charAt(i + 1));
          const enc3 = chars.indexOf(str.charAt(i + 2));
          const enc4 = chars.indexOf(str.charAt(i + 3));
          const chr1 = (enc1 << 2) | (enc2 >> 4);
          const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
          const chr3 = ((enc3 & 3) << 6) | enc4;
          bytes[p++] = chr1;
          if (enc3 !== 64 && p < bytes.length) bytes[p++] = chr2;
          if (enc4 !== 64 && p < bytes.length) bytes[p++] = chr3;
        }
        return bytes;
      }

      const bytes = base64ToUint8Array(base64);

      const buckets = ['avatars', 'AVATARS'] as const;
      let uploadedBucket: (typeof buckets)[number] | null = null;
      let lastError: any = null;

      for (const bucket of buckets) {
        const upload = await supabase.storage.from(bucket).upload(path, bytes, { upsert: true, contentType: `image/${fileExt}` });
        if (!upload.error) {
          uploadedBucket = bucket;
          break;
        }
        lastError = upload.error;
      }

      if (!uploadedBucket) {
        const msg = lastError?.message ? String(lastError.message) : 'No se pudo subir la foto.';
        Alert.alert('Error de Storage', `${msg}\n\nVerifica que el bucket sea "avatars" (o "AVATARS"), público y con políticas RLS.`);
        return;
      }

      const pub = supabase.storage.from(uploadedBucket).getPublicUrl(path);
      const url = pub.data.publicUrl;
      const { error } = await supabase.from('users').update({ avatar_url: url }).eq('id', appUser.id);
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      setAvatarUrl(url);
      Alert.alert('Listo', 'Foto actualizada.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo elegir/subir la foto.');
    }
  }

  async function onSave() {
    if (!appUser?.id || !userRole || !canSave) return;
    setSaving(true);
    try {
      const { error: userErr } = await supabase
        .from('users')
        .update({ name: name.trim().length ? name.trim() : appUser.name, whatsapp: whatsapp.trim().length ? whatsapp.trim() : null })
        .eq('id', appUser.id);
      if (userErr) throw userErr;

      if (userRole === 'caregiver' && caregiver?.id) {
        const { error } = await supabase
          .from('caregivers')
          .update({
            phone: phone.trim(),
            address: address.trim().length ? address.trim() : null,
            relation_to_patient: relation.trim().length ? relation.trim() : null,
          })
          .eq('id', caregiver.id);
        if (error) throw error;
      }

      if (userRole === 'doctor' && doctor?.id) {
        const { error } = await supabase
          .from('doctors')
          .update({
            specialty: specialty.trim(),
            cmp: cmp.trim(),
            whatsapp: docWhatsapp.trim().length ? docWhatsapp.trim() : null,
            schedule: schedule.trim().length ? schedule.trim() : null,
          })
          .eq('id', doctor.id);
        if (error) throw error;
      }

      Alert.alert('Listo', 'Datos actualizados.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function onRequestNotifications() {
    const current = await Notifications.getPermissionsAsync();
    if (current.status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      if (req.status !== 'granted') {
        Alert.alert('Notificaciones', 'Denegadas.');
        return;
      }
    }

    try {
      if (!Device.isDevice) {
        Alert.alert('Notificaciones', 'Se necesita un dispositivo fisico para probar push remotas.');
        return;
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2F95DC',
        });
      }
      if (!appUser?.id) {
        Alert.alert('Notificaciones', 'Permiso concedido, pero no hay usuario autenticado para guardar el token.');
        return;
      }
      const projectId = easProjectId;
      const tokenRes = projectId ? await Notifications.getExpoPushTokenAsync({ projectId }) : await Notifications.getExpoPushTokenAsync();
      const token = tokenRes.data;
      const result = await savePushToken(appUser.id, token, Device.osName ?? null);
      if (result.error) {
        throw new Error(result.error);
      }
      Alert.alert('Notificaciones', 'Push activadas y token guardado. En Android necesitas una build EAS con FCM configurado para recibirlas.');
    } catch (e: any) {
      Alert.alert('Notificaciones', `No se pudo registrar la push remota. Verifica FCM, google-services.json y que uses una build EAS. ${e?.message ?? ''}`);
    }
  }

  async function onRequestLocation() {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') {
      Alert.alert('Ubicación', 'Ya está habilitada.');
      return;
    }
    const req = await Location.requestForegroundPermissionsAsync();
    Alert.alert('Ubicación', req.status === 'granted' ? 'Habilitada.' : 'Denegada.');
  }

  async function onDeactivate() {
    if (!appUser?.id) return;
    Alert.alert('Eliminar cuenta', 'Esto elimina tu cuenta y cierra la sesión.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const { data: sessionRes } = await supabase.auth.getSession();
            const accessToken = sessionRes.session?.access_token ?? '';

            if (backendUrl && accessToken) {
              const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/account/delete`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
              });
              if (!res.ok) {
                const json = await res.json().catch(() => null);
                throw new Error(json?.message || `Error ${res.status}`);
              }
              return;
            }

            await supabase.from('users').update({ is_active: false }).eq('id', appUser.id);
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'No se pudo eliminar la cuenta.');
          } finally {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
          }
        },
      },
    ]);
  }

  async function onLogout() {
    await supabase.auth.signOut({ scope: 'local' });
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted, fontWeight: fontWeight.bold }}>Cargando…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.bg, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <TopBar
        title="Perfil"
        onBack={() => {
          if (navigation?.canGoBack?.()) navigation.goBack();
          else onClose?.();
        }}
      />

      <Card>
        <View style={styles.avatarRow}>
          <View style={[styles.avatar, { borderColor: colors.border, backgroundColor: colors.bgAlt }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <IconCircle size={88} bg={colors.primarySoft}>
                <Text style={{ color: colors.primaryDark, fontWeight: fontWeight.black, fontSize: 28 }}>{(name || 'V')[0]?.toUpperCase()}</Text>
              </IconCircle>
            )}
          </View>
          <Button label="Cambiar foto" onPress={onPickPhoto} variant="secondary" fullWidth={false} />
        </View>

        <Text style={[styles.section, { color: colors.primary }]}>Datos</Text>
        <View style={{ gap: spacing.md }}>
          <FormField value={name} onChangeText={(value) => setName(sanitizePersonText(value, 70))} placeholder="Nombre" />
          <FormField value={whatsapp} onChangeText={(value) => setWhatsapp(sanitizePhone(value))} placeholder="WhatsApp (opcional)" keyboardType="phone-pad" />
        </View>

        {userRole === 'caregiver' && (
          <>
            <Text style={[styles.section, { color: colors.primary }]}>Cuidador</Text>
            <View style={{ gap: spacing.md }}>
              <FormField value={phone} onChangeText={(value) => setPhone(sanitizePhone(value))} placeholder="Teléfono" keyboardType="phone-pad" />
              <FormField value={address} onChangeText={(value) => setAddress(sanitizeMixed(value, 140))} placeholder="Dirección (opcional)" />
              <FormField value={relation} onChangeText={(value) => setRelation(sanitizePersonText(value, 50))} placeholder="Relación con paciente (opcional)" />
            </View>
          </>
        )}

        {userRole === 'doctor' && (
          <>
            <Text style={[styles.section, { color: colors.primary }]}>Doctor</Text>
            <View style={{ gap: spacing.md }}>
              <FormField value={specialty} onChangeText={(value) => setSpecialty(sanitizePersonText(value, 60))} placeholder="Especialidad" />
              <FormField value={cmp} onChangeText={(value) => setCmp(value.replace(/[^\d]/g, '').slice(0, 12))} placeholder="CMP" keyboardType="number-pad" />
              <FormField value={docWhatsapp} onChangeText={(value) => setDocWhatsapp(sanitizePhone(value))} placeholder="WhatsApp (opcional)" keyboardType="phone-pad" />
              <FormField value={schedule} onChangeText={(value) => setSchedule(sanitizeMixed(value, 80))} placeholder="Horario (opcional)" />
            </View>
          </>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <Button label={saving ? 'Guardando…' : 'Guardar cambios'} onPress={onSave} disabled={!canSave} loading={saving} />
        </View>
      </Card>

      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Apariencia</Text>
        <View style={styles.modeRow}>
          {MODES.map((m) => {
            const selected = mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => setMode(m.key)}
                style={[
                  styles.modeChip,
                  { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.bgAlt },
                ]}
              >
                <Text style={[styles.modeChipText, { color: selected ? colors.primaryDark : colors.text }]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Permisos</Text>
        <View style={{ gap: spacing.sm }}>
          <Button label="Notificaciones" onPress={onRequestNotifications} variant="secondary" />
          <Button label="Ubicación" onPress={onRequestLocation} variant="secondary" />
        </View>
      </Card>

      <Card>
        <View style={{ gap: spacing.sm }}>
          <Button label="Cerrar sesión" onPress={onLogout} variant="secondary" />
          <Button label="Eliminar cuenta" onPress={onDeactivate} variant="danger" />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bg: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.lg, paddingBottom: spacing.xxxl },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  section: { marginTop: spacing.lg, marginBottom: spacing.md, fontWeight: fontWeight.black, fontSize: fontSize.sm, textTransform: 'uppercase', letterSpacing: 0.4 },
  cardTitle: { fontSize: fontSize.base, fontWeight: fontWeight.black, marginBottom: spacing.md },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeChip: { flex: 1, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  modeChipText: { fontWeight: fontWeight.bold, fontSize: fontSize.sm },
});

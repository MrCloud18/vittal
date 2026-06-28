import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = ((Constants as any).expoConfig?.extra ?? (Constants as any).manifest?.extra ?? {}) as Record<string, any>;
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.EXPO_PUBLIC_SUPABASE_URL ?? '') as string;
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '') as string;
export const backendUrl = (process.env.EXPO_PUBLIC_BACKEND_URL ?? extra.EXPO_PUBLIC_BACKEND_URL ?? '') as string;
export const easProjectId = (process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? extra.EXPO_PUBLIC_EAS_PROJECT_ID ?? extra.eas?.projectId ?? '') as string;

export const supabase = (() => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase config');
    }
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } catch {
    return createClient('https://example.supabase.co', 'public-anon-key', {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
})();

export function hasSupabaseConfig(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

export type Role = 'caregiver' | 'doctor';

export type AppUser = {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  email: string | null;
  role: Role | null;
  whatsapp: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
};

export type Caregiver = {
  id: string;
  user_id: string;
  phone: string;
  address: string | null;
  relation_to_patient: string | null;
};

export type Doctor = {
  id: string;
  user_id: string;
  specialty: string;
  cmp: string;
  whatsapp: string | null;
  schedule: string | null;
};

export type Patient = {
  id: string;
  caregiver_id: string | null;
  full_name: string;
  dni: string | null;
  birth_date: string | null;
  blood_type: string | null;
  phone: string | null;
  conditions: unknown;
  allergies: unknown;
  medications: unknown;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  is_active: boolean | null;
  assignment_status: 'available' | 'assigned' | null;
  assigned_doctor_id: string | null;
  assigned_at: string | null;
  created_at: string | null;
};

export type VitalSign = {
  id: string;
  patient_id: string;
  heart_rate: number | null;
  blood_pressure: string | null;
  oxygen_level: number | null;
  temperature: number | null;
  recorded_at: string | null;
};

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertStatus = 'pending' | 'acknowledged' | 'resolved';

export type AlertItem = {
  id: string;
  patient_id: string;
  severity: AlertSeverity | null;
  message: string | null;
  status: AlertStatus | null;
  triggered_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

export type DoctorNote = {
  id: string;
  patient_id: string;
  doctor_id: string;
  note: string;
  created_at: string | null;
  updated_at: string | null;
};

export type NotificationInboxItem = {
  id: string;
  user_id: string;
  patient_id: string | null;
  actor_user_id: string | null;
  category: string | null;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string | null;
};

export type PushTokenRow = {
  id: string;
  user_id: string;
  expo_push_token: string;
  platform: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function warnSupabase(context: string, error: { message?: string } | null | undefined) {
  if (!error) return;
  console.warn(`[supabase] ${context}: ${error.message ?? 'error desconocido'}`);
}

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const authUser = userRes.user;
  if (!authUser) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  if (error) {
    warnSupabase('getCurrentAppUser', error);
    return null;
  }
  return data as AppUser | null;
}

export async function getCurrentCaregiver(): Promise<Caregiver | null> {
  const appUser = await getCurrentAppUser();
  if (!appUser?.id) return null;
  const { data, error } = await supabase.from('caregivers').select('*').eq('user_id', appUser.id).maybeSingle();
  if (error) {
    warnSupabase('getCurrentCaregiver', error);
    return null;
  }
  return data as Caregiver | null;
}

export async function getCurrentDoctor(): Promise<Doctor | null> {
  const appUser = await getCurrentAppUser();
  if (!appUser?.id) return null;
  const { data, error } = await supabase.from('doctors').select('*').eq('user_id', appUser.id).maybeSingle();
  if (error) {
    warnSupabase('getCurrentDoctor', error);
    return null;
  }
  return data as Doctor | null;
}

export async function getPushTokensForUser(userId: string): Promise<PushTokenRow[]> {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [];
  const { data, error } = await supabase
    .from('push_tokens')
    .select('*')
    .eq('user_id', normalizedUserId)
    .order('updated_at', { ascending: false });
  if (error) {
    warnSupabase('getPushTokensForUser', error);
    return [];
  }
  return (data as PushTokenRow[]) ?? [];
}

async function registerPushTokenViaBackend(expoPushToken: string, platform?: string | null): Promise<{ error: string | null; row: PushTokenRow | null }> {
  const trimmedUrl = backendUrl.replace(/\/$/, '');
  if (!trimmedUrl) {
    return { error: 'Falta configurar EXPO_PUBLIC_BACKEND_URL.', row: null };
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { error: 'No hay sesión activa.', row: null };
  }

  try {
    const response = await fetch(`${trimmedUrl}/api/push/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expoPushToken,
        platform: platform ?? null,
      }),
    });
    const json = (await response.json().catch(() => null)) as { message?: string; data?: { row?: PushTokenRow | null } } | null;
    if (!response.ok) {
      return { error: json?.message ?? `Error ${response.status}`, row: null };
    }
    return { error: null, row: (json?.data?.row as PushTokenRow | null) ?? null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo registrar el push token.', row: null };
  }
}

async function registerPushTokenDirectly(userId: string, expoPushToken: string, platform?: string | null): Promise<{ error: string | null; row: PushTokenRow | null }> {
  const normalizedUserId = String(userId || '').trim();
  const normalizedToken = String(expoPushToken || '').trim();

  const { error: cleanupError } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', normalizedUserId)
    .neq('expo_push_token', normalizedToken);
  if (cleanupError) {
    warnSupabase('registerPushTokenDirectly.cleanup', cleanupError);
    return { error: cleanupError.message, row: null };
  }

  const { data: existingRow, error: existingError } = await supabase
    .from('push_tokens')
    .select('*')
    .eq('user_id', normalizedUserId)
    .eq('expo_push_token', normalizedToken)
    .maybeSingle();
  if (existingError) {
    warnSupabase('registerPushTokenDirectly.selectExisting', existingError);
    return { error: existingError.message, row: null };
  }

  if (existingRow?.id) {
    const { data: updatedRow, error: updateError } = await supabase
      .from('push_tokens')
      .update({
        platform: platform ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingRow.id)
      .select('*')
      .maybeSingle();
    if (updateError) {
      warnSupabase('registerPushTokenDirectly.updateExisting', updateError);
      return { error: updateError.message, row: null };
    }
    return { error: null, row: (updatedRow as PushTokenRow | null) ?? null };
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from('push_tokens')
    .insert({
      user_id: normalizedUserId,
      expo_push_token: normalizedToken,
      platform: platform ?? null,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .maybeSingle();
  if (insertError) {
    warnSupabase('registerPushTokenDirectly.insert', insertError);
    return { error: insertError.message, row: null };
  }

  return { error: null, row: (insertedRow as PushTokenRow | null) ?? null };
}

export async function savePushToken(userId: string, expoPushToken: string, platform?: string | null): Promise<{ error: string | null; row?: PushTokenRow | null }> {
  const normalizedUserId = String(userId || '').trim();
  const normalizedToken = String(expoPushToken || '').trim();
  if (!normalizedUserId || !normalizedToken) {
    return { error: 'Falta userId o expoPushToken.', row: null };
  }

  const backendResult = await registerPushTokenViaBackend(normalizedToken, platform);
  if (!backendResult.error && backendResult.row?.expo_push_token === normalizedToken) {
    return { error: null, row: backendResult.row };
  }

  if (backendResult.error) {
    console.warn(`[push] backend register fallback: ${backendResult.error}`);
  }

  const directResult = await registerPushTokenDirectly(normalizedUserId, normalizedToken, platform);
  if (directResult.error) {
    return { error: directResult.error, row: null };
  }

  const rows = await getPushTokensForUser(normalizedUserId);
  const savedRow = rows.find((row) => row.expo_push_token === normalizedToken) ?? directResult.row ?? null;
  if (!savedRow) {
    return { error: 'El push token no quedó persistido en Supabase.', row: null };
  }

  return { error: null, row: savedRow };
}

// -------------------------------------------------------------
// Vitales: historial completo (para tendencias) y último registro.
// -------------------------------------------------------------
export async function getVitalsHistory(patientId: string, limit = 30): Promise<VitalSign[]> {
  const { data, error } = await supabase
    .from('vital_signs')
    .select('*')
    .eq('patient_id', patientId)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error) {
    warnSupabase('getVitalsHistory', error);
    return [];
  }
  return (data as VitalSign[]) ?? [];
}

// -------------------------------------------------------------
// Alertas: marcar como atendida (acknowledged) o resuelta
// (resolved), con nota de resolución opcional.
// -------------------------------------------------------------
export async function acknowledgeAlert(alertId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('alerts').update({ status: 'acknowledged' }).eq('id', alertId);
  return { error: error?.message ?? null };
}

export async function resolveAlert(alertId: string, resolutionNote?: string): Promise<{ error: string | null }> {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: userRes.user?.id ?? null,
      resolution_note: resolutionNote?.trim().length ? resolutionNote.trim() : null,
    })
    .eq('id', alertId);
  return { error: error?.message ?? null };
}

// -------------------------------------------------------------
// Notas médicas: bitácora del doctor sobre un paciente.
// -------------------------------------------------------------
export async function getDoctorNotes(patientId: string): Promise<DoctorNote[]> {
  const { data, error } = await supabase
    .from('doctor_notes')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });
  if (error) {
    warnSupabase('getDoctorNotes', error);
    return [];
  }
  return (data as DoctorNote[]) ?? [];
}

export async function addDoctorNote(patientId: string, doctorId: string, note: string): Promise<{ error: string | null }> {
  const trimmed = note.trim();
  if (!trimmed.length) return { error: 'La nota no puede estar vacía.' };
  const { error } = await supabase.from('doctor_notes').insert({ patient_id: patientId, doctor_id: doctorId, note: trimmed });
  return { error: error?.message ?? null };
}

export async function deleteDoctorNote(noteId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('doctor_notes').delete().eq('id', noteId);
  return { error: error?.message ?? null };
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function postBackendNotification(path: string, body: Record<string, unknown>): Promise<{ error: string | null }> {
  const trimmedUrl = backendUrl.replace(/\/$/, '');
  if (!trimmedUrl) return { error: 'Falta configurar EXPO_PUBLIC_BACKEND_URL.' };

  const accessToken = await getAccessToken();
  if (!accessToken) return { error: 'No hay sesión activa.' };

  try {
    const response = await fetch(`${trimmedUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      return { error: json?.message ?? `Error ${response.status}` };
    }
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo enviar la notificación.' };
  }
}

export async function notifyDoctorAssigned(patientId: string, doctorId: string): Promise<{ error: string | null }> {
  return postBackendNotification('/api/notifications/events/doctor-assigned', { patientId, doctorId });
}

export async function notifyPatientClaimed(patientId: string): Promise<{ error: string | null }> {
  return postBackendNotification('/api/notifications/events/patient-claimed', { patientId });
}

export async function notifyDoctorNoteCreated(patientId: string): Promise<{ error: string | null }> {
  return postBackendNotification('/api/notifications/events/doctor-note', { patientId });
}

export async function notifyAlertStatusChanged(
  alertId: string,
  action: 'acknowledged' | 'resolved',
): Promise<{ error: string | null }> {
  return postBackendNotification('/api/notifications/events/alert-status', { alertId, action });
}

export async function getNotificationInbox(limit = 40): Promise<NotificationInboxItem[]> {
  const { data, error } = await supabase
    .from('notification_inbox')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    warnSupabase('getNotificationInbox', error);
    return [];
  }
  return (data as NotificationInboxItem[]) ?? [];
}

export async function countUnreadNotifications(): Promise<number> {
  const { count } = await supabase
    .from('notification_inbox')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null);
  return count ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('notification_inbox')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null);
  return { error: error?.message ?? null };
}

export async function markAllNotificationsRead(): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('notification_inbox')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  return { error: error?.message ?? null };
}

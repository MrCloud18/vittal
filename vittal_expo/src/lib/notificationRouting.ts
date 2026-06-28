import { createNavigationContainerRef } from '@react-navigation/native';
import { emitAppEvent } from './appEvents';
import { markNotificationRead, Role } from './supabase';

export const navigationRef = createNavigationContainerRef<any>();

type NotificationPayload = {
  notificationId?: string;
  category?: string;
  patientId?: string;
  patientName?: string;
};

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length ? value : undefined;
}

export function parseNotificationPayload(data: Record<string, unknown> | undefined): NotificationPayload {
  return {
    notificationId: readString(data?.notificationId),
    category: readString(data?.category),
    patientId: readString(data?.patientId),
    patientName: readString(data?.patientName),
  };
}

export async function handleNotificationNavigation(role: Role | null, rawData: Record<string, unknown> | undefined): Promise<void> {
  if (!navigationRef.isReady()) return;

  const payload = parseNotificationPayload(rawData);
  if (payload.notificationId) {
    await markNotificationRead(payload.notificationId);
    emitAppEvent('notificationsUpdated');
  }

  const hasPatient = Boolean(payload.patientId && payload.patientName);
  switch (payload.category) {
    case 'health_alert':
    case 'alert_status':
      if (role === 'doctor' && hasPatient) {
        navigationRef.navigate('VitalsHistory', { patientId: payload.patientId, patientName: payload.patientName });
      } else if (role === 'caregiver') {
        navigationRef.navigate('CaregiverDashboard');
      } else {
        navigationRef.navigate('Notifications');
      }
      return;
    case 'doctor_assigned':
    case 'patient_claimed':
      navigationRef.navigate(role === 'doctor' ? 'DoctorHome' : role === 'caregiver' ? 'CaregiverDashboard' : 'Notifications');
      return;
    case 'doctor_note':
      navigationRef.navigate(role === 'caregiver' ? 'Notifications' : 'DoctorHome');
      return;
    default:
      navigationRef.navigate('Notifications');
  }
}

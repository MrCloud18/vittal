import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppUser, Role, easProjectId, getCurrentAppUser, getCurrentCaregiver, getCurrentDoctor, hasSupabaseConfig, savePushToken, supabase } from './src/lib/supabase';
import { tokens } from './src/ui/tokens';
import { LoginScreen, AuthStackParamList } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { ProfileSetupScreen } from './src/screens/ProfileSetupScreen';
import { CaregiverHomeScreen, CaregiverStackParamList } from './src/screens/CaregiverHomeScreen';
import { CaregiverDashboardScreen } from './src/screens/CaregiverDashboardScreen';
import { CaregiverMapScreen } from './src/screens/CaregiverMapScreen';
import { SmartwatchScreen } from './src/screens/SmartwatchScreen';
import { DoctorsDirectoryScreen } from './src/screens/DoctorsDirectoryScreen';
import { DoctorHomeScreen, DoctorStackParamList } from './src/screens/DoctorHomeScreen';
import { PatientSearchScreen } from './src/screens/PatientSearchScreen';
import { VitalsHistoryScreen } from './src/screens/VitalsHistoryScreen';
import { DoctorNotesScreen } from './src/screens/DoctorNotesScreen';
import { NotificationCenterScreen } from './src/screens/NotificationCenterScreen';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { emitAppEvent, onAppEvent } from './src/lib/appEvents';
import { handleNotificationNavigation, navigationRef } from './src/lib/notificationRouting';
import { ThemeProvider, useTheme } from './src/ui/theme';
import { AccountScreen } from './src/screens/AccountScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();
const CaregiverStack = createNativeStackNavigator<CaregiverStackParamList>();
const DoctorStack = createNativeStackNavigator<DoctorStackParamList>();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function CaregiverVitalsHistoryRoute({
  navigation,
  route,
}: NativeStackScreenProps<CaregiverStackParamList, 'VitalsHistory'>) {
  return (
    <VitalsHistoryScreen
      patientId={route.params.patientId}
      patientName={route.params.patientName}
      onBack={() => navigation.goBack()}
    />
  );
}

function DoctorVitalsHistoryRoute({
  navigation,
  route,
}: NativeStackScreenProps<DoctorStackParamList, 'VitalsHistory'>) {
  return (
    <VitalsHistoryScreen
      patientId={route.params.patientId}
      patientName={route.params.patientName}
      onBack={() => navigation.goBack()}
    />
  );
}

function DoctorNotesRoute({ navigation, route }: NativeStackScreenProps<DoctorStackParamList, 'DoctorNotes'>) {
  return (
    <DoctorNotesScreen
      patientId={route.params.patientId}
      patientName={route.params.patientName}
      doctorId={route.params.doctorId}
      onBack={() => navigation.goBack()}
    />
  );
}

function CaregiverNotificationsRoute({ navigation }: NativeStackScreenProps<CaregiverStackParamList, 'Notifications'>) {
  return <NotificationCenterScreen onBack={() => navigation.goBack()} />;
}

function DoctorNotificationsRoute({ navigation }: NativeStackScreenProps<DoctorStackParamList, 'Notifications'>) {
  return <NotificationCenterScreen onBack={() => navigation.goBack()} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const { colors, setRole } = useTheme();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  const hasConfig = useMemo(() => hasSupabaseConfig(), []);

  useEffect(() => {
    setRole((appUser?.role as Role | null) ?? 'neutral');
  }, [appUser?.role, setRole]);

  useEffect(() => {
    if (!hasConfig) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSignedIn(Boolean(data.session));
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [hasConfig]);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      if (!signedIn) {
        setAppUser(null);
        setNeedsSetup(false);
        return;
      }
      const user = await getCurrentAppUser();
      if (cancelled) return;
      if (!user) {
        await supabase.auth.signOut({ scope: 'local' });
        return;
      }
      setAppUser(user);
      if (user?.is_active === false) {
        await supabase.auth.signOut({ scope: 'local' });
        return;
      }

      const role = (user?.role ?? null) as Role | null;
      if (!role) {
        setNeedsSetup(true);
        return;
      }

      if (role === 'caregiver') {
        const caregiver = await getCurrentCaregiver();
        if (cancelled) return;
        if (!caregiver?.id) {
          setNeedsSetup(true);
          return;
        }
        const { data: patients } = await supabase.from('patients').select('id').eq('caregiver_id', caregiver.id).limit(1);
        if (cancelled) return;
        setNeedsSetup(!(patients && patients.length > 0));
        return;
      }

      if (role === 'doctor') {
        const doctor = await getCurrentDoctor();
        if (cancelled) return;
        setNeedsSetup(!doctor?.id);
        return;
      }
    }
    loadUser();
    const unsub = onAppEvent('profileUpdated', () => {
      loadUser();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [signedIn]);

  useEffect(() => {
    let cancelled = false;
    async function prepareNotifications() {
      try {
        if (!Device.isDevice) return;
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#2F95DC',
            sound: 'default',
          });
        }
        const permission = await Notifications.getPermissionsAsync();
        if (cancelled || permission.status === 'granted') return;
        await Notifications.requestPermissionsAsync();
      } catch (error) {
        console.warn('No se pudo preparar notificaciones:', error instanceof Error ? error.message : error);
        return;
      }
    }
    void prepareNotifications();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function registerPush() {
      if (!signedIn || needsSetup || !appUser?.id) return;
      try {
        if (!Device.isDevice) return;
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#2F95DC',
            sound: 'default',
          });
        }
        const permission = await Notifications.getPermissionsAsync();
        let status = permission.status;
        if (status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }
        if (status !== 'granted') return;
        const projectId = easProjectId;
        const tokenRes = projectId
          ? await Notifications.getExpoPushTokenAsync({ projectId })
          : await Notifications.getExpoPushTokenAsync();
        if (cancelled) return;
        const token = tokenRes.data;
        const result = await savePushToken(appUser.id, token, Device.osName ?? null);
        if (result.error) {
          console.warn('No se pudo guardar el ExpoPushToken:', result.error);
        }
      } catch (error) {
        console.warn('No se pudo registrar el ExpoPushToken:', error instanceof Error ? error.message : error);
        return;
      }
    }
    registerPush();
    return () => {
      cancelled = true;
    };
  }, [signedIn, needsSetup, appUser?.id]);

  useEffect(() => {
    if (!signedIn || needsSetup || !appUser?.role) return;

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      emitAppEvent('notificationsUpdated');
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      void handleNotificationNavigation(appUser.role, data);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      void handleNotificationNavigation(appUser.role, data);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [appUser?.role, needsSetup, signedIn]);

  if (!hasConfig) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.bg }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Falta configurar Supabase</Text>
          <Text style={[styles.text, { color: colors.muted }]}>Crea un archivo vittal_expo/.env con:</Text>
          <View style={[styles.codeBox, { borderColor: colors.border, backgroundColor: colors.bg }]}>
            <Text style={[styles.code, { color: colors.text }]}>EXPO_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co</Text>
            <Text style={[styles.code, { color: colors.text }]}>EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY</Text>
            <Text style={[styles.code, { color: colors.text }]}>EXPO_PUBLIC_BACKEND_URL=http://TU_IP:3000</Text>
            <Text style={[styles.code, { color: colors.text }]}>EXPO_PUBLIC_EAS_PROJECT_ID=TU_PROJECT_ID</Text>
          </View>
          <Text style={[styles.text, { color: colors.muted }]}>Luego ejecuta:</Text>
          <View style={[styles.codeBox, { borderColor: colors.border, backgroundColor: colors.bg }]}>
            <Text style={[styles.code, { color: colors.text }]}>cd d:\Vittal\vittal_expo</Text>
            <Text style={[styles.code, { color: colors.text }]}>npm run start</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {!signedIn ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </Stack.Navigator>
      ) : needsSetup ? (
        <ProfileSetupScreen />
      ) : appUser?.role === 'caregiver' ? (
        <CaregiverStack.Navigator screenOptions={{ headerShown: false }}>
          <CaregiverStack.Screen name="CaregiverHome" component={CaregiverHomeScreen} />
          <CaregiverStack.Screen name="CaregiverDashboard" component={CaregiverDashboardScreen} />
          <CaregiverStack.Screen name="CaregiverMap" component={CaregiverMapScreen} />
          <CaregiverStack.Screen name="DoctorsDirectory" component={DoctorsDirectoryScreen} />
          <CaregiverStack.Screen name="VitalsHistory" component={CaregiverVitalsHistoryRoute} />
          <CaregiverStack.Screen name="Smartwatch" component={SmartwatchScreen} />
          <CaregiverStack.Screen name="Notifications" component={CaregiverNotificationsRoute} />
          <CaregiverStack.Screen name="Account" component={AccountScreen} />
        </CaregiverStack.Navigator>
      ) : appUser?.role === 'doctor' ? (
        <DoctorStack.Navigator screenOptions={{ headerShown: false }}>
          <DoctorStack.Screen name="DoctorHome" component={DoctorHomeScreen} />
          <DoctorStack.Screen name="PatientSearch" component={PatientSearchScreen} />
          <DoctorStack.Screen name="VitalsHistory" component={DoctorVitalsHistoryRoute} />
          <DoctorStack.Screen name="DoctorNotes" component={DoctorNotesRoute} />
          <DoctorStack.Screen name="Notifications" component={DoctorNotificationsRoute} />
          <DoctorStack.Screen name="Account" component={AccountScreen} />
        </DoctorStack.Navigator>
      ) : (
        <SafeAreaView style={[styles.center, { backgroundColor: colors.bg }]}>
          <Text style={[styles.title, { color: colors.text }]}>Rol no soportado</Text>
        </SafeAreaView>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: tokens.radius.lg,
    padding: 18,
    borderWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '900' },
  text: { marginTop: 10 },
  codeBox: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: 12,
  },
  code: { fontFamily: 'monospace' },
});

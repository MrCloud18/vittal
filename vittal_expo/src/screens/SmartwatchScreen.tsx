import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BleManager, Device, Service, Characteristic } from 'react-native-ble-plx';
import { backendUrl, supabase } from '../lib/supabase';
import { CaregiverStackParamList } from './CaregiverHomeScreen';
import { Badge, Button, Card, EmptyState, TopBar } from '../ui/components';
import { useTheme } from '../ui/theme';
import { fontSize, fontWeight, radius, spacing } from '../ui/tokens';
import {
  BLE_UUIDS,
  HELLO_WATCH_CONFIG,
  HelloWatchSnapshot,
  base64ToBytes,
  bytesToHex,
  matchesUuid,
  parseBloodPressureMeasurement,
  parseHeartRateMeasurement,
  parsePulseOximeterMeasurement,
  parseTemperatureMeasurement,
} from '../lib/helloWatch';

type Props = NativeStackScreenProps<CaregiverStackParamList, 'Smartwatch'>;

type SyncState =
  | 'idle'
  | 'requesting_permissions'
  | 'binding'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'unsupported'
  | 'error';

const TARGET_SCAN_MS = 30000;
const POST_DEBOUNCE_MS = 1500;

type CharacteristicProbe = {
  serviceUuid: string;
  characteristic: Characteristic;
  label: string;
};

function tokenStorageKey(patientId: string) {
  return `hello-watch-token:${patientId}:${HELLO_WATCH_CONFIG.macAddress}`;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function summarizeSnapshot(snapshot: HelloWatchSnapshot): string {
  const parts: string[] = [];
  if (snapshot.heartRate !== undefined) parts.push(`HR ${snapshot.heartRate} bpm`);
  if (snapshot.oxygenLevel !== undefined) parts.push(`SpO2 ${snapshot.oxygenLevel}%`);
  if (snapshot.temperature !== undefined) parts.push(`Temp ${snapshot.temperature}°C`);
  if (snapshot.bloodPressure !== undefined) parts.push(`PA ${snapshot.bloodPressure}`);
  return parts.join(' · ');
}

function statusMeta(state: SyncState, colors: ReturnType<typeof useTheme>['colors']) {
  switch (state) {
    case 'connected':
    case 'syncing':
      return { label: 'Conectado', color: colors.success, soft: colors.successSoft };
    case 'scanning':
    case 'connecting':
    case 'binding':
    case 'requesting_permissions':
      return { label: 'En proceso', color: colors.warning, soft: colors.warningSoft };
    case 'unsupported':
      return { label: 'Sin sensores', color: colors.warning, soft: colors.warningSoft };
    case 'error':
      return { label: 'Error', color: colors.danger, soft: colors.dangerSoft };
    default:
      return { label: 'Sin conectar', color: colors.muted, soft: colors.border };
  }
}

export function SmartwatchScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { patientId, patientName } = route.params;
  const [state, setState] = useState<SyncState>('idle');
  const [busy, setBusy] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [latest, setLatest] = useState<HelloWatchSnapshot>({});
  const [supportedMetrics, setSupportedMetrics] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [proprietaryCharacteristics, setProprietaryCharacteristics] = useState<string[]>([]);
  const [lastUploadAt, setLastUploadAt] = useState<string | null>(null);

  const managerRef = useRef<BleManager | null>(null);
  const connectedDeviceRef = useRef<Device | null>(null);
  const subscriptionsRef = useRef<Array<{ remove: () => void }>>([]);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceTokenRef = useRef<string | null>(null);
  const latestRef = useRef<HelloWatchSnapshot>({});
  const lastUploadSignatureRef = useRef<string>('');

  const badge = useMemo(() => statusMeta(state, colors), [colors, state]);

  function appendLog(message: string) {
    setLogs((prev) => [`${nowLabel()} · ${message}`, ...prev].slice(0, 14));
  }

  async function stopMonitoring() {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (uploadTimerRef.current) {
      clearTimeout(uploadTimerRef.current);
      uploadTimerRef.current = null;
    }
    const manager = managerRef.current;
    if (manager) {
      try {
        await manager.stopDeviceScan();
      } catch (_) {}
    }
    subscriptionsRef.current.forEach((subscription) => {
      try {
        subscription.remove();
      } catch (_) {}
    });
    subscriptionsRef.current = [];
  }

  async function disconnect() {
    await stopMonitoring();
    const manager = managerRef.current;
    const connected = connectedDeviceRef.current;
    if (manager && connected?.id) {
      try {
        await manager.cancelDeviceConnection(connected.id);
      } catch (_) {}
    }
    connectedDeviceRef.current = null;
    setDeviceLabel(null);
    setState('idle');
    appendLog('Conexión BLE detenida.');
  }

  useEffect(() => {
    return () => {
      disconnect().finally(() => {
        if (managerRef.current) {
          try {
            managerRef.current.destroy();
          } catch (_) {}
          managerRef.current = null;
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestBlePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    const version = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
    if (version >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(result).every((status) => status === PermissionsAndroid.RESULTS.GRANTED);
    }

    const location = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return location === PermissionsAndroid.RESULTS.GRANTED;
  }

  async function getOrCreateDeviceToken(): Promise<string> {
    const storageKey = tokenStorageKey(patientId);
    const cached = await AsyncStorage.getItem(storageKey);
    if (cached) {
      appendLog('Token del reloj reutilizado desde el dispositivo.');
      return cached;
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('No hay sesión activa para vincular el reloj.');

    const response = await fetch(`${backendUrl}/api/devices/bindings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        patientId,
        deviceName: `${HELLO_WATCH_CONFIG.name} ${HELLO_WATCH_CONFIG.hardwareVersion}`,
      }),
    });
    const json = (await response.json().catch(() => null)) as { message?: string; data?: { deviceToken?: string } } | null;
    if (!response.ok) {
      throw new Error(json?.message ?? `No se pudo vincular el reloj (${response.status}).`);
    }
    const token = json?.data?.deviceToken;
    if (!token) {
      throw new Error('El backend no devolvió un token para el smartwatch.');
    }

    await AsyncStorage.setItem(storageKey, token);
    appendLog('Token del smartwatch generado y guardado.');
    return token;
  }

  function scheduleUpload() {
    if (uploadTimerRef.current) {
      clearTimeout(uploadTimerRef.current);
    }
    uploadTimerRef.current = setTimeout(() => {
      void uploadLatestSnapshot();
    }, POST_DEBOUNCE_MS);
  }

  async function uploadLatestSnapshot() {
    const token = deviceTokenRef.current;
    if (!token || !backendUrl) return;

    const snapshot = latestRef.current;
    const hasPayload =
      snapshot.heartRate !== undefined ||
      snapshot.oxygenLevel !== undefined ||
      snapshot.temperature !== undefined ||
      snapshot.bloodPressure !== undefined;
    if (!hasPayload) return;

    const signature = JSON.stringify(snapshot);
    if (signature === lastUploadSignatureRef.current) return;

    const response = await fetch(`${backendUrl}/api/ingest/vitals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-token': token,
      },
      body: JSON.stringify({
        heartRate: snapshot.heartRate,
        oxygenLevel: snapshot.oxygenLevel,
        temperature: snapshot.temperature,
        bloodPressure: snapshot.bloodPressure,
        recordedAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        await AsyncStorage.removeItem(tokenStorageKey(patientId));
        deviceTokenRef.current = null;
      }
      throw new Error(`No se pudo enviar la lectura (${response.status}).`);
    }

    lastUploadSignatureRef.current = signature;
    setLastUploadAt(nowLabel());
    setState('syncing');
    appendLog(`Lectura enviada: ${summarizeSnapshot(snapshot)}`);
  }

  function mergeSnapshot(nextPartial: HelloWatchSnapshot, sourceLabel: string) {
    latestRef.current = {
      ...latestRef.current,
      ...nextPartial,
    };
    setLatest(latestRef.current);
    appendLog(`${sourceLabel}: ${summarizeSnapshot(nextPartial)}`);
    scheduleUpload();
  }

  function registerMetric(metric: string) {
    setSupportedMetrics((prev) => (prev.includes(metric) ? prev : [...prev, metric]));
  }

  function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomDecimal(min: number, max: number, precision = 1): number {
    const value = Math.random() * (max - min) + min;
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  function createMockSnapshot(): HelloWatchSnapshot {
    const systolic = randomInt(108, 132);
    const diastolic = randomInt(68, 86);
    return {
      heartRate: randomInt(64, 96),
      oxygenLevel: randomInt(95, 99),
      temperature: randomDecimal(36.2, 37.4, 1),
      bloodPressure: `${systolic}/${diastolic}`,
    };
  }

  async function simulateSmartwatchReading() {
    setSimulating(true);
    setErrorMessage(null);
    try {
      if (!backendUrl) {
        throw new Error('Falta configurar EXPO_PUBLIC_BACKEND_URL para simular lecturas.');
      }

      setState('binding');
      deviceTokenRef.current = await getOrCreateDeviceToken();

      const mockSnapshot = createMockSnapshot();
      latestRef.current = mockSnapshot;
      setLatest(mockSnapshot);
      setDeviceLabel('Simulador Hello Watch 3+');
      setState('syncing');
      registerMetric('Frecuencia cardiaca');
      registerMetric('Oxígeno');
      registerMetric('Temperatura');
      registerMetric('Presión arterial');
      appendLog(`Simulación local: ${summarizeSnapshot(mockSnapshot)}`);

      await uploadLatestSnapshot();
      appendLog('Lectura de prueba enviada al backend y a Supabase.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo generar la lectura de prueba.';
      setState('error');
      setErrorMessage(message);
      appendLog(message);
    } finally {
      setSimulating(false);
    }
  }

  function pushUniqueLine(
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
    limit = 24,
  ) {
    setter((prev) => (prev.includes(value) ? prev : [value, ...prev].slice(0, limit)));
  }

  function characteristicCapabilities(characteristic: Characteristic): string {
    const flags: string[] = [];
    if (characteristic.isReadable) flags.push('read');
    if (characteristic.isWritableWithResponse) flags.push('write');
    if (characteristic.isWritableWithoutResponse) flags.push('writeNoRsp');
    if (characteristic.isNotifiable) flags.push('notify');
    if (characteristic.isIndicatable) flags.push('indicate');
    return flags.join('/') || 'sin-flags';
  }

  function buildProbeLabel(serviceUuid: string, characteristicUuid: string): string {
    return `${serviceUuid} -> ${characteristicUuid}`;
  }

  async function tryReadCurrentValue(device: Device, serviceUuid: string, characteristic: Characteristic, label: string) {
    try {
      const current = await device.readCharacteristicForService(serviceUuid, characteristic.uuid);
      if (!current.value) return;
      handleCharacteristic(label, characteristic.uuid, current.value);
    } catch (_) {}
  }

  function handleCharacteristic(label: string, characteristicUuid: string, rawValue: string) {
    let snapshot: HelloWatchSnapshot | null = null;

    if (matchesUuid(characteristicUuid, BLE_UUIDS.heartRateMeasurement)) {
      snapshot = parseHeartRateMeasurement(rawValue);
      registerMetric('Frecuencia cardiaca');
    } else if (matchesUuid(characteristicUuid, BLE_UUIDS.thermometerMeasurement)) {
      snapshot = parseTemperatureMeasurement(rawValue);
      registerMetric('Temperatura');
    } else if (matchesUuid(characteristicUuid, BLE_UUIDS.bloodPressureMeasurement)) {
      snapshot = parseBloodPressureMeasurement(rawValue);
      registerMetric('Presión arterial');
    } else if (
      matchesUuid(characteristicUuid, BLE_UUIDS.pulseOximeterContinuous) ||
      matchesUuid(characteristicUuid, BLE_UUIDS.pulseOximeterSpotCheck)
    ) {
      snapshot = parsePulseOximeterMeasurement(rawValue);
      registerMetric('Oxígeno');
    }

    if (snapshot) {
      mergeSnapshot(snapshot, label);
      return;
    }

    appendLog(`${label}: dato no reconocido (${bytesToHex(base64ToBytes(rawValue))})`);
  }

  async function monitorStandardCharacteristics(device: Device, discoveredServices: Service[]) {
    const supportedEntries: CharacteristicProbe[] = [];
    const proprietaryEntries: CharacteristicProbe[] = [];
    const discoveredLabels: string[] = [];

    for (const service of discoveredServices) {
      const characteristics = await service.characteristics();
      discoveredLabels.push(
        `${service.uuid} · ${
          characteristics
            .map((item) => `${item.uuid} [${characteristicCapabilities(item)}]`)
            .join(', ') || 'sin características visibles'
        }`,
      );

      for (const characteristic of characteristics) {
        if (matchesUuid(characteristic.uuid, BLE_UUIDS.heartRateMeasurement)) {
          supportedEntries.push({ serviceUuid: service.uuid, characteristic, label: 'Frecuencia cardiaca' });
        }
        if (matchesUuid(characteristic.uuid, BLE_UUIDS.thermometerMeasurement)) {
          supportedEntries.push({ serviceUuid: service.uuid, characteristic, label: 'Temperatura' });
        }
        if (matchesUuid(characteristic.uuid, BLE_UUIDS.bloodPressureMeasurement)) {
          supportedEntries.push({ serviceUuid: service.uuid, characteristic, label: 'Presión arterial' });
        }
        if (
          matchesUuid(characteristic.uuid, BLE_UUIDS.pulseOximeterSpotCheck) ||
          matchesUuid(characteristic.uuid, BLE_UUIDS.pulseOximeterContinuous)
        ) {
          supportedEntries.push({ serviceUuid: service.uuid, characteristic, label: 'Oxígeno' });
        }

        const isStandard =
          matchesUuid(characteristic.uuid, BLE_UUIDS.heartRateMeasurement) ||
          matchesUuid(characteristic.uuid, BLE_UUIDS.thermometerMeasurement) ||
          matchesUuid(characteristic.uuid, BLE_UUIDS.bloodPressureMeasurement) ||
          matchesUuid(characteristic.uuid, BLE_UUIDS.pulseOximeterSpotCheck) ||
          matchesUuid(characteristic.uuid, BLE_UUIDS.pulseOximeterContinuous);

        if (!isStandard && (characteristic.isReadable || characteristic.isNotifiable || characteristic.isIndicatable)) {
          proprietaryEntries.push({
            serviceUuid: service.uuid,
            characteristic,
            label: buildProbeLabel(service.uuid, characteristic.uuid),
          });
          pushUniqueLine(
            setProprietaryCharacteristics,
            `${service.uuid} -> ${characteristic.uuid} [${characteristicCapabilities(characteristic)}]`,
          );
        }
      }
    }

    setServices(discoveredLabels);
    if (supportedEntries.length > 0) {
      appendLog(`Servicios compatibles detectados: ${supportedEntries.map((entry) => entry.label).join(', ')}`);
      setState('connected');
    } else {
      setState('unsupported');
      appendLog('El reloj se conectó, pero no expuso servicios BLE estándar para vitales.');
    }
    if (proprietaryEntries.length > 0) {
      appendLog(`UUIDs propietarios listos para prueba: ${proprietaryEntries.length}`);
    }

    for (const entry of supportedEntries) {
      const subscription = device.monitorCharacteristicForService(
        entry.serviceUuid,
        entry.characteristic.uuid,
        (error, characteristic) => {
          if (error) {
            appendLog(`${entry.label}: error al monitorear.`);
            return;
          }
          if (!characteristic?.value) return;
          handleCharacteristic(entry.label, entry.characteristic.uuid, characteristic.value);
        },
      );
      subscriptionsRef.current.push(subscription);
      await tryReadCurrentValue(device, entry.serviceUuid, entry.characteristic, entry.label);
    }

    for (const entry of proprietaryEntries) {
      if (entry.characteristic.isNotifiable || entry.characteristic.isIndicatable) {
        const subscription = device.monitorCharacteristicForService(
          entry.serviceUuid,
          entry.characteristic.uuid,
          (error, characteristic) => {
            if (error) {
              appendLog(`${entry.label}: error al monitorear.`);
              return;
            }
            if (!characteristic?.value) return;
            handleCharacteristic(entry.label, entry.characteristic.uuid, characteristic.value);
          },
        );
        subscriptionsRef.current.push(subscription);
      }
      if (entry.characteristic.isReadable) {
        await tryReadCurrentValue(device, entry.serviceUuid, entry.characteristic, entry.label);
      }
    }
  }

  async function findPreferredDevice(manager: BleManager): Promise<Device> {
    try {
      const knownDevices = await manager.devices([HELLO_WATCH_CONFIG.macAddress]);
      const directMatch = knownDevices.find((item) => item?.id?.toUpperCase() === HELLO_WATCH_CONFIG.macAddress);
      if (directMatch) {
        appendLog('Reloj encontrado desde dispositivos ya conocidos del sistema.');
        return directMatch;
      }
    } catch (_) {}

    appendLog(`Buscando ${HELLO_WATCH_CONFIG.name} en ${HELLO_WATCH_CONFIG.macAddress}...`);
    return new Promise<Device>((resolve, reject) => {
      let resolved = false;
      scanTimerRef.current = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        void manager.stopDeviceScan();
        reject(new Error('No se encontró el reloj dentro del tiempo esperado.'));
      }, TARGET_SCAN_MS);

      manager.startDeviceScan(null, null, async (error, device) => {
        if (error) {
          if (resolved) return;
          resolved = true;
          if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
          await manager.stopDeviceScan().catch(() => undefined);
          reject(new Error(error.message || 'Falló el escaneo BLE.'));
          return;
        }
        if (!device) return;

        const sameMac = device.id.toUpperCase() === HELLO_WATCH_CONFIG.macAddress;
        const byName = [device.name, device.localName].some((value) => value?.toLowerCase().includes('hello watch'));
        if (!sameMac && !byName) return;

        appendLog(`Candidato BLE: ${device.name ?? device.localName ?? device.id}`);
        if (device.manufacturerData) {
          appendLog(`Manufacturer data: ${bytesToHex(base64ToBytes(device.manufacturerData))}`);
        }

        if (resolved) return;
        resolved = true;
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        await manager.stopDeviceScan().catch(() => undefined);
        resolve(device);
      });
    });
  }

  async function startSync() {
    setBusy(true);
    setErrorMessage(null);
    setLogs([]);
    setSupportedMetrics([]);
    setServices([]);
    setProprietaryCharacteristics([]);
    setLatest({});
    latestRef.current = {};
    lastUploadSignatureRef.current = '';

    try {
      if (!backendUrl) {
        throw new Error('Falta configurar EXPO_PUBLIC_BACKEND_URL para sincronizar lecturas.');
      }

      setState('requesting_permissions');
      appendLog('Solicitando permisos Bluetooth/ubicación...');
      const granted = await requestBlePermissions();
      if (!granted) {
        throw new Error('No se concedieron los permisos Bluetooth/ubicación requeridos.');
      }

      setState('binding');
      deviceTokenRef.current = await getOrCreateDeviceToken();

      await disconnect();
      if (managerRef.current) {
        try {
          managerRef.current.destroy();
        } catch (_) {}
      }
      managerRef.current = new BleManager();
      const manager = managerRef.current;

      setState('scanning');
      const foundDevice = await findPreferredDevice(manager);

      setState('connecting');
      setDeviceLabel(foundDevice.name ?? foundDevice.localName ?? foundDevice.id);
      appendLog(`Reloj encontrado: ${foundDevice.name ?? foundDevice.localName ?? foundDevice.id}`);

      const connected = await manager.connectToDevice(foundDevice.id, { timeout: 15000 });
      connectedDeviceRef.current = connected;
      const discovered = await connected.discoverAllServicesAndCharacteristics();
      const discoveredServices = await discovered.services();
      appendLog(`Conectado. Servicios detectados: ${discoveredServices.length}`);

      await monitorStandardCharacteristics(discovered, discoveredServices);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo completar la conexión.';
      setState('error');
      setErrorMessage(message);
      appendLog(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.bg, { backgroundColor: colors.bg }]}>
      <TopBar title="Hello Watch 3+" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>{patientName}</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>Conexión dedicada para el reloj del paciente.</Text>
            </View>
            <Badge label={badge.label} color={badge.color} soft={badge.soft} />
          </View>

          <View style={styles.specGrid}>
            <View style={[styles.specChip, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
              <Text style={[styles.specLabel, { color: colors.muted }]}>MAC</Text>
              <Text style={[styles.specValue, { color: colors.text }]}>{HELLO_WATCH_CONFIG.macAddress}</Text>
            </View>
            <View style={[styles.specChip, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
              <Text style={[styles.specLabel, { color: colors.muted }]}>Firmware</Text>
              <Text style={[styles.specValue, { color: colors.text }]}>{HELLO_WATCH_CONFIG.firmware}</Text>
            </View>
            <View style={[styles.specChip, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
              <Text style={[styles.specLabel, { color: colors.muted }]}>Hardware</Text>
              <Text style={[styles.specValue, { color: colors.text }]}>{HELLO_WATCH_CONFIG.hardwareVersion}</Text>
            </View>
            <View style={[styles.specChip, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
              <Text style={[styles.specLabel, { color: colors.muted }]}>Dispositivo</Text>
              <Text style={[styles.specValue, { color: colors.text }]} numberOfLines={1}>
                {deviceLabel ?? 'Aun no conectado'}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <Button
              label={busy ? 'Conectando...' : 'Conectar y sincronizar'}
              onPress={() => {
                void startSync();
              }}
              disabled={busy}
              loading={busy}
            />
            <Button
              label={simulating ? 'Simulando...' : 'Generar lectura de prueba'}
              onPress={() => {
                void simulateSmartwatchReading();
              }}
              disabled={busy || simulating}
              loading={simulating}
              variant="accent"
            />
            <Button
              label="Desconectar"
              onPress={() => {
                void disconnect();
              }}
              disabled={(busy || simulating) && state !== 'connected' && state !== 'syncing'}
              variant="secondary"
            />
          </View>
        </Card>

        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Lectura actual</Text>
          {Object.keys(latest).length === 0 ? (
            <EmptyState
              title="Todavía sin lecturas"
              subtitle="Cuando el reloj publique datos compatibles, los vas a ver aquí y se enviarán al backend."
            />
          ) : (
            <View style={styles.metricsGrid}>
              <View style={[styles.metricTile, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                <Text style={[styles.metricLabel, { color: colors.muted }]}>Frecuencia</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{latest.heartRate ?? '--'} bpm</Text>
              </View>
              <View style={[styles.metricTile, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                <Text style={[styles.metricLabel, { color: colors.muted }]}>Oxígeno</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{latest.oxygenLevel ?? '--'}%</Text>
              </View>
              <View style={[styles.metricTile, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                <Text style={[styles.metricLabel, { color: colors.muted }]}>Temperatura</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{latest.temperature ?? '--'}°C</Text>
              </View>
              <View style={[styles.metricTile, { backgroundColor: colors.bgAlt, borderColor: colors.border }]}>
                <Text style={[styles.metricLabel, { color: colors.muted }]}>Presión</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{latest.bloodPressure ?? '--'}</Text>
              </View>
            </View>
          )}
          <Text style={[styles.helper, { color: colors.muted }]}>
            Último envío al backend: {lastUploadAt ?? 'sin envíos todavía'}
          </Text>
          <Text style={[styles.helper, { color: colors.muted }]}>
            Si aún no tienes el smartwatch físico, usa la simulación para poblar signos vitales reales en Supabase y validar ambos paneles.
          </Text>
        </Card>

        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Sensores detectados</Text>
          {supportedMetrics.length === 0 ? (
            <Text style={[styles.paragraph, { color: colors.muted }]}>
              Si el reloj expone servicios estándar BLE, aquí aparecerán frecuencia cardiaca, SpO2, temperatura o presión.
            </Text>
          ) : (
            <View style={styles.chipsRow}>
              {supportedMetrics.map((metric) => (
                <View key={metric} style={[styles.metricChip, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.metricChipText, { color: colors.primaryDark }]}>{metric}</Text>
                </View>
              ))}
            </View>
          )}

          {state === 'unsupported' && (
            <Text style={[styles.warningText, { color: colors.warning }]}>
              El reloj se enlazó, pero no publicó características estándar. Para lectura completa hará falta capturar UUIDs propietarios en una prueba física.
            </Text>
          )}
          {proprietaryCharacteristics.length > 0 ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={[styles.paragraph, { color: colors.text }]}>UUIDs propietarios detectados</Text>
              {proprietaryCharacteristics.map((item) => (
                <Text key={item} style={[styles.monoLine, { color: colors.muted }]}>
                  {item}
                </Text>
              ))}
            </View>
          ) : null}
          {errorMessage ? <Text style={[styles.errorText, { color: colors.danger }]}>{errorMessage}</Text> : null}
        </Card>

        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Servicios BLE vistos</Text>
          {services.length === 0 ? (
            <Text style={[styles.paragraph, { color: colors.muted }]}>Todavía no hay descubrimiento de servicios.</Text>
          ) : (
            services.map((item) => (
              <Text key={item} style={[styles.monoLine, { color: colors.muted }]}>
                {item}
              </Text>
            ))
          )}
        </Card>

        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Actividad</Text>
          {logs.length === 0 ? (
            <View style={styles.logEmpty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            logs.map((line) => (
              <Text key={line} style={[styles.logLine, { color: colors.text }]}>
                {line}
              </Text>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl },
  headerRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.black },
  subtitle: { marginTop: spacing.xs, fontSize: fontSize.sm },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  specChip: {
    width: '48%',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  specLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase' },
  specValue: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  cardTitle: { fontSize: fontSize.base, fontWeight: fontWeight.black, marginBottom: spacing.sm },
  paragraph: { fontSize: fontSize.sm, lineHeight: 20 },
  helper: { marginTop: spacing.md, fontSize: fontSize.xs },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricTile: {
    width: '48%',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase' },
  metricValue: { fontSize: fontSize.lg, fontWeight: fontWeight.black },
  chipsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  metricChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill },
  metricChipText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  warningText: { marginTop: spacing.md, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  errorText: { marginTop: spacing.md, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  monoLine: { fontSize: 11, fontFamily: 'monospace', marginTop: spacing.xs },
  logEmpty: { paddingVertical: spacing.lg, alignItems: 'center' },
  logLine: { fontSize: fontSize.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#00000010' },
});

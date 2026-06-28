export const HELLO_WATCH_CONFIG = {
  name: 'Hello Watch 3+',
  firmware: '4.10.62_241018',
  macAddress: 'A6:BC:81:73:DA:0C',
  hardwareVersion: 'M78_V4.1',
} as const;

export const BLE_UUIDS = {
  heartRateService: '180d',
  heartRateMeasurement: '2a37',
  thermometerService: '1809',
  thermometerMeasurement: '2a1c',
  bloodPressureService: '1810',
  bloodPressureMeasurement: '2a35',
  pulseOximeterService: '1822',
  pulseOximeterSpotCheck: '2a5e',
  pulseOximeterContinuous: '2a5f',
} as const;

export type HelloWatchSnapshot = {
  heartRate?: number;
  oxygenLevel?: number;
  temperature?: number;
  bloodPressure?: string;
};

export function normalizeUuid(uuid: string | null | undefined): string {
  if (!uuid) return '';
  return uuid.trim().toLowerCase().replace(/^0+/, '').replace(/-/g, '');
}

export function matchesUuid(uuid: string | null | undefined, expectedShortUuid: string): boolean {
  const normalized = normalizeUuid(uuid);
  const short = expectedShortUuid.toLowerCase();
  return normalized === short || normalized.endsWith(`${short}1000800000805f9b34fb`);
}

export function bytesToHex(bytes: number[]): string {
  return bytes.map((value) => value.toString(16).padStart(2, '0')).join(' ');
}

export function base64ToBytes(value: string): number[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.replace(/=+$/, '');
  let buffer = 0;
  let bits = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }

  return out;
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function parseSfloat16(low: number, high: number): number {
  const raw = low | (high << 8);
  let mantissa = raw & 0x0fff;
  let exponent = raw >> 12;

  if (mantissa >= 0x0800) mantissa -= 0x1000;
  if (exponent >= 0x0008) exponent -= 0x0010;

  return mantissa * 10 ** exponent;
}

function parseFloat11073(bytes: number[]): number {
  if (bytes.length < 4) return Number.NaN;
  const raw = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  let mantissa = raw & 0x00ffffff;
  let exponent = (raw >> 24) & 0xff;

  if (mantissa >= 0x800000) mantissa -= 0x1000000;
  if (exponent >= 0x80) exponent -= 0x100;

  return mantissa * 10 ** exponent;
}

export function parseHeartRateMeasurement(rawValue: string): HelloWatchSnapshot | null {
  const bytes = base64ToBytes(rawValue);
  if (bytes.length < 2) return null;

  const flags = bytes[0];
  const usesUint16 = (flags & 0x01) === 0x01;
  const heartRate = usesUint16 ? bytes[1] | (bytes[2] << 8) : bytes[1];

  if (!Number.isFinite(heartRate) || heartRate <= 0) return null;
  return { heartRate };
}

export function parseTemperatureMeasurement(rawValue: string): HelloWatchSnapshot | null {
  const bytes = base64ToBytes(rawValue);
  if (bytes.length < 5) return null;

  const flags = bytes[0];
  const isFahrenheit = (flags & 0x01) === 0x01;
  const temperature = parseFloat11073(bytes.slice(1, 5));
  if (!Number.isFinite(temperature)) return null;

  const celsius = isFahrenheit ? (temperature - 32) / 1.8 : temperature;
  return { temperature: round(celsius, 1) };
}

export function parseBloodPressureMeasurement(rawValue: string): HelloWatchSnapshot | null {
  const bytes = base64ToBytes(rawValue);
  if (bytes.length < 7) return null;

  const systolic = parseSfloat16(bytes[1], bytes[2]);
  const diastolic = parseSfloat16(bytes[3], bytes[4]);

  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
  if (systolic <= 0 || diastolic <= 0) return null;

  return { bloodPressure: `${Math.round(systolic)}/${Math.round(diastolic)}` };
}

export function parsePulseOximeterMeasurement(rawValue: string): HelloWatchSnapshot | null {
  const bytes = base64ToBytes(rawValue);
  if (bytes.length < 5) return null;

  const oxygenLevel = parseSfloat16(bytes[1], bytes[2]);
  const heartRate = parseSfloat16(bytes[3], bytes[4]);
  const snapshot: HelloWatchSnapshot = {};

  if (Number.isFinite(oxygenLevel) && oxygenLevel > 0) {
    snapshot.oxygenLevel = round(oxygenLevel, 1);
  }
  if (Number.isFinite(heartRate) && heartRate > 0) {
    snapshot.heartRate = Math.round(heartRate);
  }

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

// Sistema de diseño Vittal
// -------------------------------------------------------------
// Escala base de 4px. Todo el spacing/radius/tamaño de fuente
// de la app debería salir de aquí, no de números sueltos en cada
// pantalla. Esto es lo que permite que la app se sienta como un
// producto, no como una colección de pantallas.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 34,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '600' as const,
  bold: '700' as const,
  black: '800' as const,
};

export const shadow = {
  sm: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
};

// Compatibilidad con código existente que usaba `tokens.radius.lg/md`
export const tokens = {
  spacing,
  radius,
  fontSize,
  fontWeight,
  shadow,
};

// -------------------------------------------------------------
// Paletas por rol
// -------------------------------------------------------------
// El cuidador vive en un mundo cálido, cercano, de "estoy cuidando
// a alguien que quiero" → turquesa/coral, formas suaves.
// El doctor vive en un panel clínico, de trabajo, alto volumen de
// datos → azul profundo/índigo, formas más rectas, info densa.
// Ambos comparten semántica de estado (success/warning/danger)
// para que las alertas se reconozcan igual en toda la app.

export type RoleKey = 'caregiver' | 'doctor' | 'neutral';

const semantic = {
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  critical: '#B91C1C',
  criticalSoft: '#FECACA',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
};

export const caregiverPalette = {
  light: {
    bg: '#FBFBF8',
    bgAlt: '#F2F7F5',
    card: '#FFFFFF',
    text: '#16221F',
    muted: '#5B6E69',
    border: '#E3EBE7',
    primary: '#0E9488',
    primaryDark: '#0B7B71',
    primarySoft: '#D6F3EE',
    accent: '#F97A5B',
    accentSoft: '#FFE7DE',
    onPrimary: '#FFFFFF',
    ...semantic,
  },
  dark: {
    bg: '#0B1413',
    bgAlt: '#0F1B19',
    card: '#13211F',
    text: '#EAF3F1',
    muted: '#90A8A3',
    border: '#1E332F',
    primary: '#2DD4BF',
    primaryDark: '#14B8A6',
    primarySoft: '#10302C',
    accent: '#FB923C',
    accentSoft: '#3A2417',
    onPrimary: '#06201C',
    ...semantic,
  },
};

export const doctorPalette = {
  light: {
    bg: '#F5F7FC',
    bgAlt: '#EEF1FA',
    card: '#FFFFFF',
    text: '#10162B',
    muted: '#5C6584',
    border: '#E2E6F3',
    primary: '#3346B3',
    primaryDark: '#26307F',
    primarySoft: '#E1E5FA',
    accent: '#0EA5A4',
    accentSoft: '#D8F4F2',
    onPrimary: '#FFFFFF',
    ...semantic,
  },
  dark: {
    bg: '#090B16',
    bgAlt: '#0E1224',
    card: '#131830',
    text: '#E7E9F7',
    muted: '#9098BD',
    border: '#1F2542',
    primary: '#7C8BFF',
    primaryDark: '#5D6EF0',
    primarySoft: '#1C2350',
    accent: '#2DD4BF',
    accentSoft: '#0E2B28',
    onPrimary: '#0B0F22',
    ...semantic,
  },
};

export const neutralPalette = {
  light: {
    bg: '#F6F7F9',
    bgAlt: '#EFF1F5',
    card: '#FFFFFF',
    text: '#13161F',
    muted: '#5F6473',
    border: '#E4E6ED',
    primary: '#3B4A6B',
    primaryDark: '#2A3650',
    primarySoft: '#E3E7F1',
    accent: '#0E9488',
    accentSoft: '#D6F3EE',
    onPrimary: '#FFFFFF',
    ...semantic,
  },
  dark: {
    bg: '#0A0B10',
    bgAlt: '#101319',
    card: '#161A23',
    text: '#E8E9EF',
    muted: '#8F93A6',
    border: '#22273A',
    primary: '#8C9BFF',
    primaryDark: '#6B7CF0',
    primarySoft: '#1D2440',
    accent: '#2DD4BF',
    accentSoft: '#0E2B28',
    onPrimary: '#0B0D16',
    ...semantic,
  },
};

export type PaletteColors = typeof caregiverPalette.light;

export function paletteFor(role: RoleKey | null | undefined) {
  if (role === 'caregiver') return caregiverPalette;
  if (role === 'doctor') return doctorPalette;
  return neutralPalette;
}

// Severidad de alertas → color + etiqueta + peso visual.
// Centralizado para que cuidador y doctor interpreten la misma
// alerta exactamente igual.
export type Severity = 'critical' | 'high' | 'medium' | 'low' | null | undefined;

export function severityMeta(severity: Severity, colors: PaletteColors) {
  switch (severity) {
    case 'critical':
      return { label: 'Crítica', color: colors.critical, soft: colors.criticalSoft };
    case 'high':
      return { label: 'Alta', color: colors.danger, soft: colors.dangerSoft };
    case 'medium':
      return { label: 'Media', color: colors.warning, soft: colors.warningSoft };
    case 'low':
      return { label: 'Baja', color: colors.info, soft: colors.infoSoft };
    default:
      return { label: 'Sin clasificar', color: colors.muted, soft: colors.border };
  }
}

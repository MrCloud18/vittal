import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { radius, spacing, fontSize, fontWeight, shadow } from '../tokens';

// -------------------------------------------------------------
// Card: contenedor base de toda la app. withShadow=true para
// tarjetas "flotantes" sobre el fondo, false para tarjetas planas
// dentro de otra tarjeta (evita sombras anidadas raras).
// -------------------------------------------------------------
export function Card({
  children,
  style,
  withShadow = true,
  padded = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  withShadow?: boolean;
  padded?: boolean;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.card,
        padded && styles.cardPadded,
        { backgroundColor: colors.card, borderColor: colors.border },
        withShadow && !isDark && shadow.sm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// -------------------------------------------------------------
// Button: variantes primary / secondary / ghost / danger.
// Tamaño único pensado para mobile (44pt mínimo táctil).
// -------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  fullWidth = true,
  size = 'md',
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  size?: 'sm' | 'md';
}) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const variantStyle: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.primary, borderWidth: 0 },
    accent: { backgroundColor: colors.accent, borderWidth: 0 },
    secondary: { backgroundColor: colors.bgAlt, borderWidth: 1, borderColor: colors.border },
    ghost: { backgroundColor: 'transparent', borderWidth: 0 },
    danger: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  };

  const textColor: Record<ButtonVariant, string> = {
    primary: colors.onPrimary,
    accent: colors.onPrimary,
    secondary: colors.text,
    ghost: colors.primary,
    danger: colors.danger,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        size === 'sm' && styles.btnSm,
        variantStyle[variant],
        fullWidth && { alignSelf: 'stretch' },
        !fullWidth && { alignSelf: 'flex-start' },
        isDisabled && styles.btnDisabled,
        pressed && !isDisabled && styles.btnPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor[variant]} />
      ) : (
        <View style={styles.btnContent}>
          {icon}
          <Text style={[styles.btnText, { color: textColor[variant] }, size === 'sm' && styles.btnTextSm]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

// -------------------------------------------------------------
// Badge: pastilla de estado pequeña (severidad, estado, etc.)
// -------------------------------------------------------------
export function Badge({
  label,
  color,
  soft,
  size = 'md',
}: {
  label: string;
  color: string;
  soft: string;
  size?: 'sm' | 'md';
}) {
  return (
    <View style={[styles.badge, size === 'sm' && styles.badgeSm, { backgroundColor: soft }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }, size === 'sm' && styles.badgeTextSm]}>{label}</Text>
    </View>
  );
}

// -------------------------------------------------------------
// SectionTitle: título de sección con subtítulo opcional.
// -------------------------------------------------------------
export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// -------------------------------------------------------------
// EmptyState: estado vacío consistente para listas sin datos.
// -------------------------------------------------------------
export function EmptyState({ icon, title, subtitle }: { icon?: React.ReactNode; title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      {icon}
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.emptySubtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

// -------------------------------------------------------------
// IconCircle: contenedor circular para íconos / iniciales.
// -------------------------------------------------------------
export function IconCircle({
  children,
  size = 44,
  bg,
}: {
  children: React.ReactNode;
  size?: number;
  bg: string;
}) {
  return (
    <View
      style={[
        styles.iconCircle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      {children}
    </View>
  );
}

// -------------------------------------------------------------
// ProgressBar: barra de progreso con color dinámico.
// -------------------------------------------------------------
export function ProgressBar({ percent, color, trackColor }: { percent: number; color: string; trackColor: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
      <View style={[styles.progressFill, { width: `${clamped}%`, backgroundColor: color }]} />
    </View>
  );
}

// -------------------------------------------------------------
// TopBar: header reutilizable con botón volver opcional.
// -------------------------------------------------------------
export function TopBar({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8} style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.backArrow, { color: colors.text }]}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.backBtnSpacer} />
      )}
      <Text style={[styles.topBarTitle, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View style={styles.backBtnSpacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  cardPadded: {
    padding: spacing.xl,
  },
  btn: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSm: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btnText: { fontWeight: fontWeight.bold, fontSize: fontSize.base },
  btnTextSm: { fontSize: fontSize.sm },
  btnDisabled: { opacity: 0.45 },
  btnPressed: { opacity: 0.85 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeSm: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontWeight: fontWeight.bold, fontSize: fontSize.xs },
  badgeTextSm: { fontSize: 10 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.black },
  sectionSubtitle: { marginTop: 2, fontSize: fontSize.sm },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontWeight: fontWeight.bold, fontSize: fontSize.base, textAlign: 'center' },
  emptySubtitle: { fontSize: fontSize.sm, textAlign: 'center', maxWidth: 260 },
  iconCircle: { alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnSpacer: { width: 40, height: 40 },
  backArrow: { fontSize: 22, fontWeight: fontWeight.black, marginTop: -2 },
  topBarTitle: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.black, textAlign: 'center' },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';
import { spacing, fontSize, fontWeight } from './tokens';

const ROLE_TAGLINE: Record<string, string> = {
  caregiver: 'Cuidado diario',
  doctor: 'Panel clínico',
  neutral: 'Salud y cuidado',
};

export function VittalLogo({ compact = false }: { compact?: boolean }) {
  const { colors, role } = useTheme();
  const size = compact ? 38 : 50;
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.badge,
          { width: size, height: size, borderRadius: size * 0.32, backgroundColor: colors.primary },
        ]}
      >
        <Text style={[styles.badgeText, { fontSize: size * 0.46 }]}>V</Text>
        <View style={[styles.badgeAccent, { backgroundColor: colors.accent }]} />
      </View>
      {!compact && (
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.text }]}>Vittal</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{ROLE_TAGLINE[role] ?? ROLE_TAGLINE.neutral}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: fontWeight.black },
  badgeAccent: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  textWrap: { flexDirection: 'column' },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.black, letterSpacing: -0.3 },
  subtitle: { marginTop: 1, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});

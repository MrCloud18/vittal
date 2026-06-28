import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '../theme';
import { radius, spacing, fontSize, fontWeight } from '../tokens';

export function FormField({
  label,
  helper,
  error,
  ...inputProps
}: TextInputProps & { label?: string; helper?: string; error?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          {
            borderColor: error ? colors.danger : colors.border,
            color: colors.text,
            backgroundColor: colors.bgAlt,
          },
        ]}
        {...inputProps}
      />
      {error ? (
        <Text style={[styles.helper, { color: colors.danger }]}>{error}</Text>
      ) : helper ? (
        <Text style={[styles.helper, { color: colors.muted }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontSize: fontSize.base,
  },
  helper: { fontSize: fontSize.xs, marginTop: -2 },
});

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { addDoctorNote, deleteDoctorNote, DoctorNote, getDoctorNotes, notifyDoctorNoteCreated } from '../lib/supabase';
import { useTheme } from '../ui/theme';
import { Button, Card, EmptyState, TopBar } from '../ui/components';
import { FormField } from '../ui/components/FormField';
import { spacing, fontSize, fontWeight, radius } from '../ui/tokens';

export type DoctorNotesParams = {
  patientId: string;
  patientName: string;
  doctorId: string;
};

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function DoctorNotesScreen({
  patientId,
  patientName,
  doctorId,
  onBack,
}: DoctorNotesParams & { onBack: () => void }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<DoctorNote[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const data = await getDoctorNotes(patientId);
    setNotes(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  async function onAdd() {
    if (!draft.trim().length) return;
    setSaving(true);
    const { error } = await addDoctorNote(patientId, doctorId, draft);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    const notification = await notifyDoctorNoteCreated(patientId);
    if (notification.error) {
      Alert.alert('Nota guardada', `La nota se guardó, pero no se pudo notificar al cuidador: ${notification.error}`);
    }
    setDraft('');
    load();
  }

  function onDelete(noteId: string) {
    Alert.alert('Eliminar nota', '¿Seguro que quieres eliminar esta nota?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteDoctorNote(noteId);
          if (error) {
            Alert.alert('Error', error);
            return;
          }
          load();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.bg, { backgroundColor: colors.bg }]}
    >
      <TopBar title="Notas médicas" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.patientName, { color: colors.muted }]}>{patientName}</Text>

        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Nueva nota</Text>
          <FormField
            value={draft}
            onChangeText={(v) => setDraft(v.slice(0, 600))}
            placeholder="Evolución, indicaciones, observaciones clínicas…"
            multiline
            numberOfLines={4}
            style={styles.textarea}
          />
          <View style={{ marginTop: spacing.md }}>
            <Button label={saving ? 'Guardando…' : 'Agregar nota'} onPress={onAdd} disabled={!draft.trim().length || saving} loading={saving} />
          </View>
        </Card>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : notes.length === 0 ? (
          <Card>
            <EmptyState title="Sin notas todavía" subtitle="Las observaciones que registres aquí quedan como historial clínico del paciente." />
          </Card>
        ) : (
          notes.map((n) => (
            <Card key={n.id} withShadow={false}>
              <View style={styles.noteHeader}>
                <Text style={[styles.noteDate, { color: colors.muted }]}>{formatDate(n.created_at)}</Text>
                <Pressable onPress={() => onDelete(n.id)} hitSlop={8}>
                  <Text style={[styles.deleteLink, { color: colors.danger }]}>Eliminar</Text>
                </Pressable>
              </View>
              <Text style={[styles.noteBody, { color: colors.text }]}>{n.note}</Text>
            </Card>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.lg },
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  patientName: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  cardTitle: { fontSize: fontSize.base, fontWeight: fontWeight.black, marginBottom: spacing.md },
  textarea: { minHeight: 100, textAlignVertical: 'top', borderRadius: radius.md },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  noteDate: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.4 },
  deleteLink: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  noteBody: { fontSize: fontSize.base, lineHeight: 21 },
});

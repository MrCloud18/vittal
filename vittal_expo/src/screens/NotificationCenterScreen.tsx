import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { emitAppEvent, onAppEvent } from '../lib/appEvents';
import {
  countUnreadNotifications,
  getNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationInboxItem,
  supabase,
} from '../lib/supabase';
import { useTheme } from '../ui/theme';
import { Badge, Button, Card, EmptyState, TopBar } from '../ui/components';
import { fontSize, fontWeight, radius, spacing } from '../ui/tokens';

type Props = {
  onBack: () => void;
};

function categoryLabel(category: string | null): string {
  switch (category) {
    case 'doctor_assigned':
      return 'Asignacion';
    case 'patient_claimed':
      return 'Paciente';
    case 'doctor_note':
      return 'Nota';
    case 'health_alert':
      return 'Alerta';
    case 'alert_status':
      return 'Seguimiento';
    default:
      return 'Sistema';
  }
}

export function NotificationCenterScreen({ onBack }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);

    const [notifications, unread] = await Promise.all([getNotificationInbox(), countUnreadNotifications()]);
    setItems(notifications);
    setUnreadCount(unread);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    let mounted = true;
    void load();

    const unsubscribeEvent = onAppEvent('notificationsUpdated', () => {
      if (mounted) void load(true);
    });

    const channel = supabase
      .channel('notification-inbox-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_inbox' }, () => {
        if (mounted) {
          emitAppEvent('notificationsUpdated');
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      unsubscribeEvent();
      supabase.removeChannel(channel);
    };
  }, []);

  async function markOneAsRead(item: NotificationInboxItem) {
    if (item.read_at) return;
    await markNotificationRead(item.id);
    emitAppEvent('notificationsUpdated');
  }

  async function onMarkAll() {
    setMarkingAll(true);
    await markAllNotificationsRead();
    setMarkingAll(false);
    emitAppEvent('notificationsUpdated');
  }

  return (
    <View style={[styles.bg, { backgroundColor: colors.bg }]}>
      <TopBar title="Notificaciones" onBack={onBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <Card>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>Inbox clínico</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Aquí quedan las asignaciones, alertas y eventos entre cuidador y doctor.
              </Text>
            </View>
            <Badge
              label={`${unreadCount} sin leer`}
              color={unreadCount > 0 ? colors.warning : colors.success}
              soft={unreadCount > 0 ? colors.warningSoft : colors.successSoft}
            />
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Button
              label={markingAll ? 'Marcando...' : 'Marcar todo como leído'}
              onPress={() => {
                void onMarkAll();
              }}
              disabled={unreadCount === 0 || markingAll}
              loading={markingAll}
              variant="secondary"
            />
          </View>
        </Card>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState title="Sin notificaciones" subtitle="Cuando se genere un evento clínico, aparecerá aquí." />
          </Card>
        ) : (
          items.map((item) => (
            <Card
              key={item.id}
              withShadow={false}
              style={[
                styles.itemCard,
                { borderColor: item.read_at ? colors.border : colors.primarySoft, backgroundColor: item.read_at ? colors.card : colors.primarySoft },
              ]}
            >
              <View style={styles.itemHeader}>
                <Badge
                  label={categoryLabel(item.category)}
                  color={item.read_at ? colors.muted : colors.primaryDark}
                  soft={item.read_at ? colors.border : '#DCEBFF'}
                  size="sm"
                />
                <Text style={[styles.itemDate, { color: colors.muted }]}>
                  {item.created_at ? new Date(item.created_at).toLocaleString('es-PE') : ''}
                </Text>
              </View>
              <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.itemBody, { color: colors.muted }]}>{item.body}</Text>
              {!item.read_at ? (
                <View style={styles.readWrap}>
                  <Button
                    label="Marcar como leído"
                    onPress={() => {
                      void markOneAsRead(item);
                    }}
                    size="sm"
                    fullWidth={false}
                    variant="ghost"
                  />
                </View>
              ) : (
                <Text style={[styles.readTag, { color: colors.success }]}>Leído</Text>
              )}
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl },
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  headerRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  title: { fontSize: fontSize.base, fontWeight: fontWeight.black },
  subtitle: { marginTop: spacing.xs, fontSize: fontSize.sm, lineHeight: 20 },
  itemCard: { gap: spacing.sm },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'center' },
  itemDate: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  itemTitle: { fontSize: fontSize.base, fontWeight: fontWeight.black },
  itemBody: { fontSize: fontSize.sm, lineHeight: 20 },
  readWrap: { marginTop: spacing.xs },
  readTag: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
});

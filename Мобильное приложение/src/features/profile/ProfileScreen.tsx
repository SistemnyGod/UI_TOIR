import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { signOut } from "@/auth/authService";
import { getDeviceDisplayName } from "@/auth/deviceInfo";
import { listLocalNotifications } from "@/db/repositories/notificationRepository";
import { MobileNotificationDto } from "@/domain/patrol/patrolTypes";
import { useAppTheme } from "@/features/settings/themePreference";
import { markMobileNotificationRead, syncMobileNotifications } from "@/services/notificationService";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

const NOTIFICATION_LIMIT = 8;

export function ProfileScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const deviceName = getDeviceDisplayName();
  const [notifications, setNotifications] = useState<MobileNotificationDto[]>([]);
  const [isRefreshingNotifications, setIsRefreshingNotifications] = useState(false);

  const unreadNotifications = useMemo(() => notifications.filter((notification) => !notification.readAt), [notifications]);
  const visibleNotifications = useMemo(
    () => [...notifications].sort((left, right) => {
      if (!left.readAt && right.readAt) {
        return -1;
      }
      if (left.readAt && !right.readAt) {
        return 1;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }),
    [notifications]
  );

  const refreshNotifications = useCallback(async () => {
    setIsRefreshingNotifications(true);
    try {
      await syncMobileNotifications().catch(() => []);
      setNotifications(await listLocalNotifications(NOTIFICATION_LIMIT));
    } finally {
      setIsRefreshingNotifications(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void syncMobileNotifications()
        .catch(() => [])
        .then(() => listLocalNotifications(NOTIFICATION_LIMIT))
        .then((rows) => {
          if (isMounted) {
            setNotifications(rows);
          }
        });

      return () => {
        isMounted = false;
      };
    }, [])
  );

  async function handleChangeAccount() {
    try {
      await signOut();
      router.replace("/(auth)/login");
    } catch (error) {
      Alert.alert(
        "Нельзя сменить пользователя",
        error instanceof Error ? error.message : "Сначала отправьте все локальные отчёты и действия."
      );
    }
  }

  async function handleRead(notificationId: string) {
    await markMobileNotificationRead(notificationId).catch(() => null);
    setNotifications(await listLocalNotifications(NOTIFICATION_LIMIT));
  }

  async function handleReadAll() {
    const unreadIds = unreadNotifications.map((notification) => notification.id);
    await Promise.all(unreadIds.map((notificationId) => markMobileNotificationRead(notificationId).catch(() => null)));
    setNotifications(await listLocalNotifications(NOTIFICATION_LIMIT));
  }

  return (
    <Screen title="Профиль" subtitle="Устройство, настройки, диагностика и смена пользователя.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Устройство</Text>
          <StatusPill label={deviceName} tone="success" />
        </View>
        <Text style={[styles.deviceTitle, { color: colors.text }]}>{deviceName}</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Patrol360. Устройство привязано к мобильной сессии.
        </Text>
      </Card>

      <Card>
        <View style={styles.row}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Настройки</Text>
          <StatusPill label="Offline-first" tone="success" />
        </View>
        <View style={styles.settingsGrid}>
          <PrimaryButton icon="server-outline" label="Сервер" onPress={() => router.push("/(auth)/server-settings")} variant="secondary" />
          <PrimaryButton icon="bug-outline" label="Диагностика" onPress={() => router.push("/settings/diagnostics" as never)} variant="secondary" />
          <PrimaryButton icon="color-palette-outline" label="Тема" onPress={() => router.push("/settings/theme")} variant="secondary" />
          <PrimaryButton icon="settings-outline" label="Все настройки" onPress={() => router.push("/settings")} variant="secondary" />
        </View>
      </Card>

      <Card>
        <View style={styles.notificationHeader}>
          <View style={styles.notificationHeaderText}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Уведомления</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>
              {notifications.length === 0
                ? "Новых уведомлений нет."
                : `${notifications.length} последних · непрочитанных: ${unreadNotifications.length}`}
            </Text>
          </View>
          <View style={styles.notificationHeaderActions}>
            <CompactAction
              icon="refresh-outline"
              label={isRefreshingNotifications ? "Обновляем" : "Обновить"}
              onPress={refreshNotifications}
            />
            {unreadNotifications.length > 0 ? (
              <CompactAction icon="checkmark-done-outline" label="Прочитать все" onPress={handleReadAll} />
            ) : null}
          </View>
        </View>

        {notifications.length > 0 ? (
          <View style={styles.notificationList}>
            {visibleNotifications.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} onRead={handleRead} />
            ))}
          </View>
        ) : (
          <View style={[styles.emptyNotifications, { borderColor: colors.border }]}>
            <Ionicons color={colors.mutedText} name="notifications-off-outline" size={22} />
            <Text style={[styles.text, { color: colors.mutedText }]}>После назначения обхода уведомления появятся здесь.</Text>
          </View>
        )}
      </Card>

      <View style={styles.settingsGrid}>
        <PrimaryButton icon="person-add-outline" label="Сменить пользователя" onPress={handleChangeAccount} variant="secondary" />
      </View>
    </Screen>
  );
}

function NotificationRow({
  notification,
  onRead
}: {
  notification: MobileNotificationDto;
  onRead: (notificationId: string) => void;
}) {
  const { colors } = useAppTheme();
  const isUnread = !notification.readAt;

  return (
    <Pressable
      accessibilityHint={isUnread ? "Отметить уведомление прочитанным" : undefined}
      accessibilityRole="button"
      disabled={!isUnread}
      onPress={() => onRead(notification.id)}
      style={({ pressed }) => [
        styles.notificationItem,
        {
          backgroundColor: isUnread ? colors.backgroundAccent : colors.card,
          borderColor: isUnread ? colors.primary : colors.border
        },
        pressed && isUnread ? styles.notificationPressed : null
      ]}
    >
      <View style={styles.notificationTopLine}>
        <View style={styles.notificationMeta}>
          <Text style={[styles.notificationType, { color: isUnread ? colors.primary : colors.mutedText }]}>
            {formatNotificationType(notification.type)}
          </Text>
          <Text style={[styles.notificationDate, { color: colors.mutedText }]}>{formatNotificationDate(notification.createdAt)}</Text>
        </View>
        <StatusPill label={isUnread ? "Новое" : "Прочитано"} tone={isUnread ? "warning" : "neutral"} />
      </View>

      <Text numberOfLines={2} style={[styles.notificationTitle, { color: colors.text }]}>
        {notification.title || "Уведомление"}
      </Text>
      <Text numberOfLines={3} style={[styles.text, { color: colors.mutedText }]}>
        {notification.message || "Без текста уведомления."}
      </Text>

      {isUnread ? (
        <View style={styles.inlineReadButton}>
          <Ionicons color={colors.primary} name="checkmark-circle-outline" size={17} />
          <Text style={[styles.inlineReadText, { color: colors.primary }]}>Отметить прочитанным</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function CompactAction({
  icon,
  label,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.compactAction, { borderColor: colors.border }]}>
      <Ionicons color={colors.primary} name={icon} size={16} />
      <Text style={[styles.compactActionText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

function formatNotificationType(type: string) {
  switch (type) {
    case "patrol_request":
    case "patrol-assignment":
      return "Заявка";
    case "patrol_cancelled":
    case "assignment-cancelled":
      return "Отмена";
    case "report":
    case "report-status":
      return "Отчёт";
    default:
      return "Система";
  }
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Дата неизвестна";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

const styles = StyleSheet.create({
  compactAction: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  compactActionText: {
    fontSize: 12,
    fontWeight: "800"
  },
  deviceTitle: {
    fontSize: 17,
    fontWeight: "800"
  },
  emptyNotifications: {
    alignItems: "center",
    borderRadius: 14,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    padding: 12
  },
  inlineReadButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingTop: 2
  },
  inlineReadText: {
    fontSize: 13,
    fontWeight: "800"
  },
  notificationDate: {
    fontSize: 12,
    fontWeight: "700"
  },
  notificationHeader: {
    gap: 12
  },
  notificationHeaderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  notificationHeaderText: {
    gap: 3
  },
  notificationItem: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 7,
    padding: 12
  },
  notificationList: {
    gap: 10,
    marginTop: 12
  },
  notificationPressed: {
    opacity: 0.78
  },
  notificationMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    flexWrap: "wrap",
    gap: 6
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  notificationTopLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  notificationType: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800"
  },
  settingsGrid: {
    gap: 10
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  }
});

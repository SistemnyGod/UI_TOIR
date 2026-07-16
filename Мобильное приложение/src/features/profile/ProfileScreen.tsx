import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { signOut } from "@/auth/authService";
import { listLocalNotifications } from "@/db/repositories/notificationRepository";
import { MobileNotificationDto } from "@/domain/patrol/patrolTypes";
import { useAppTheme } from "@/features/settings/themePreference";
import { markMobileNotificationRead, syncMobileNotifications } from "@/services/notificationService";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function ProfileScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [notifications, setNotifications] = useState<MobileNotificationDto[]>([]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void syncMobileNotifications()
        .catch(() => [])
        .then(() => listLocalNotifications(5))
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
    setNotifications(await listLocalNotifications(5));
  }

  return (
    <Screen title="Профиль" subtitle="Устройство, настройки, диагностика и смена пользователя.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Устройство</Text>
          <StatusPill label="Kenshi Armor C1s" tone="success" />
        </View>
        <Text style={[styles.deviceTitle, { color: colors.text }]}>Kenshi Armor C1s</Text>
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

      {notifications.length > 0 ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Уведомления</Text>
          <View style={styles.notificationList}>
            {notifications.map((notification) => (
              <View key={notification.id} style={[styles.notificationItem, { borderColor: colors.border }]}>
                <Text style={[styles.notificationTitle, { color: colors.text }]}>{notification.title}</Text>
                <Text style={[styles.text, { color: colors.mutedText }]}>{notification.message}</Text>
                <PrimaryButton
                  label={notification.readAt ? "Прочитано" : "Отметить прочитанным"}
                  icon={notification.readAt ? "checkmark-circle-outline" : "notifications-outline"}
                  onPress={() => handleRead(notification.id)}
                  variant={notification.readAt ? "ghost" : "secondary"}
                />
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={styles.settingsGrid}>
        <PrimaryButton icon="person-add-outline" label="Сменить пользователя" onPress={handleChangeAccount} variant="secondary" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  deviceTitle: {
    fontSize: 17,
    fontWeight: "800"
  },
  notificationItem: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  notificationList: {
    gap: 10
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "700"
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

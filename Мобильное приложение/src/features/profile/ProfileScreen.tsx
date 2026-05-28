import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

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
    await signOut();
    router.replace("/(auth)/login");
  }

  async function handleRead(notificationId: string) {
    await markMobileNotificationRead(notificationId).catch(() => null);
    setNotifications(await listLocalNotifications(5));
  }

  return (
    <Screen title="Профиль" subtitle="Устройство, уведомления, настройки и смена пользователя.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Работы и замечания</Text>
          <StatusPill label="Активно" tone="success" />
        </View>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Задачи учета работ и замечания доступны на вкладке Работы. Фото и видео сохраняются локально и уходят при синхронизации.
        </Text>
        <PrimaryButton label="Открыть работы" onPress={() => router.push("/(tabs)/work-accounting")} variant="secondary" />
      </Card>

      <Card>
        <View style={styles.row}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Синхронизация</Text>
          <StatusPill label="Фоновая" tone="success" />
        </View>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Данные сохраняются на телефоне и синхронизируются при появлении интернета. Отдельный технический экран сотруднику не нужен.
        </Text>
      </Card>

      <Card>
        <View style={styles.row}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Устройство и аккаунт</Text>
          <StatusPill label="Kenshi Armor C1s" tone="success" />
        </View>
        <Text style={[styles.deviceTitle, { color: colors.text }]}>Kenshi Armor C1s</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>Приложение: Patrol360. Устройство фиксируется в мобильной сессии.</Text>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Уведомления</Text>
        {notifications.length > 0 ? (
          <View style={styles.notificationList}>
            {notifications.map((notification) => (
              <View key={notification.id} style={[styles.notificationItem, { borderColor: colors.border }]}>
                <Text style={[styles.notificationTitle, { color: colors.text }]}>{notification.title}</Text>
                <Text style={[styles.text, { color: colors.mutedText }]}>{notification.message}</Text>
                <PrimaryButton
                  label={notification.readAt ? "Прочитано" : "Отметить прочитанным"}
                  onPress={() => handleRead(notification.id)}
                  variant={notification.readAt ? "ghost" : "secondary"}
                />
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.text, { color: colors.mutedText }]}>Новых уведомлений нет.</Text>
        )}
      </Card>

      <View style={styles.settingsGrid}>
        <PrimaryButton label="Настройки" onPress={() => router.push("/settings")} variant="secondary" />
        <PrimaryButton label="Сменить пользователя" onPress={handleChangeAccount} variant="secondary" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  deviceTitle: {
    fontSize: 17,
    fontWeight: "800"
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  notificationList: {
    gap: 10
  },
  notificationItem: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "700"
  },
  settingsGrid: {
    gap: 10
  }
});

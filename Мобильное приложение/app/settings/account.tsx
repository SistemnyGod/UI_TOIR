import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { signOut } from "@/auth/authService";
import { getDeviceDisplayName } from "@/auth/deviceInfo";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export default function AccountRoute() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const deviceName = getDeviceDisplayName();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setError(null);
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/(auth)/login");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось выйти из аккаунта. Повторите действие.");
      setIsSigningOut(false);
    }
  }

  return (
    <Screen title="Аккаунт" subtitle="Безопасный выход и смена пользователя на телефоне.">
      <Card>
        <StatusPill label="Защита данных" tone="success" />
        <Text style={[styles.title, { color: colors.text }]}>Безопасный выход</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Если на телефоне есть неотправленные отчеты, фото или команды синхронизации, приложение заблокирует выход. Сначала
          откройте очередь синхронизации и дождитесь отправки данных.
        </Text>
      </Card>

      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Что останется</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Идентификатор устройства сохраняется, чтобы сервер продолжал видеть этот телефон как {deviceName}. Локальные
          данные очищаются только после проверки, что нет неотправленных действий.
        </Text>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isSigningOut ? <ActivityIndicator /> : null}
      <PrimaryButton disabled={isSigningOut} label="Выйти из аккаунта" onPress={handleSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: "600"
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    lineHeight: 20
  }
});

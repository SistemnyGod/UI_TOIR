import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text } from "react-native";

import { AccountIdentity } from "@/ui/AccountIdentity";
import { signOut } from "@/auth/authService";
import { getDeviceDisplayName } from "@/auth/deviceInfo";
import { fixedLight } from "@/ui/brandPalette";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";
import { createThemedStyles, useThemedStyles } from "@/ui/useThemedStyles";

export default function AccountRoute() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
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
    <Screen title="Учётная запись" onBack={() => router.back()}>
      <AccountIdentity />
      <Card>
        <StatusPill label="Защита данных" tone="success" />
        <Text style={styles.title}>Безопасный выход</Text>
        <Text style={styles.text}>
          Если на телефоне есть неотправленные отчеты, фото или команды синхронизации, приложение заблокирует выход. Сначала
          откройте очередь синхронизации и дождитесь отправки данных.
        </Text>
      </Card>

      <Card>
        <Text style={styles.title}>Что останется</Text>
        <Text style={styles.text}>
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

const createStyles = createThemedStyles((colors) => ({
  title: {
    color: colors.text,
    fontSize: 18,
    fontFamily: "Manrope_600SemiBold"
  },
  text: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 21
  },
  error: {
    color: fixedLight.errorText,
    fontSize: 14,
    lineHeight: 20
  }
}));

import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getLocalUserProfile } from "@/db/repositories/bootstrapRepository";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";

type LocalUserProfile = {
  serverUserId: string;
  fullName: string;
};

export default function OfflineLoginRoute() {
  const router = useRouter();
  const [profile, setProfile] = useState<LocalUserProfile | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getStoredOwnerUserId()
      .then((ownerUserId) => (ownerUserId ? getLocalUserProfile(ownerUserId) : null))
      .then((loaded) => {
        if (isMounted) {
          setProfile(loaded);
          setIsReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function continueOffline() {
    if (isAuthenticating) {
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Подтвердите доступ к сохраненным обходам",
        cancelLabel: "Отмена",
        fallbackLabel: "Код устройства",
        disableDeviceFallback: false
      });

      if (!result.success) {
        setAuthError("Доступ не подтвержден. Используйте биометрию или код блокировки устройства.");
        return;
      }

      router.replace("/(tabs)/patrol");
    } catch {
      setAuthError("На устройстве не настроена безопасная блокировка. Офлайн-данные не открыты.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  if (!isReady) {
    return (
      <Screen title="Офлайн-доступ" subtitle="Проверка локальных данных на телефоне.">
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen title="Офлайн-доступ" subtitle="На телефоне нет сохраненного пользователя.">
        <Card>
          <Text style={styles.text}>Для первого входа нужен сервер. Проверьте Wi-Fi и адрес сервера.</Text>
        </Card>
        <PrimaryButton label="Войти онлайн" onPress={() => router.replace("/(auth)/login")} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Офлайн-доступ"
      subtitle="Сервер недоступен или сессия истекла. Сохраненные обходы останутся на телефоне."
    >
      <Card>
        <Text style={styles.label}>Сохраненный пользователь</Text>
        <Text style={styles.title}>{profile.fullName}</Text>
        <Text style={styles.text}>
          Загруженные обходы доступны локально. После онлайн-входа приложение автоматически продолжит отправку очереди.
        </Text>
      </Card>
      {authError ? <Text style={styles.error}>{authError}</Text> : null}
      <PrimaryButton
        disabled={isAuthenticating}
        label={isAuthenticating ? "Проверка доступа…" : "Продолжить офлайн"}
        onPress={() => void continueOffline()}
      />
      <PrimaryButton label="Войти онлайн" onPress={() => router.replace("/(auth)/login")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  title: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "800"
  },
  text: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 21
  },
  error: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20
  }
});

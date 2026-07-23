import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { isOfflineSessionValid } from "@/auth/offlineSession";
import { consumePendingSessionRoute, markSessionUnlocked } from "@/auth/sessionGateState";
import { getOfflineSession, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [requiresReenrollment, setRequiresReenrollment] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void Promise.all([getStoredOwnerUserId(), getOfflineSession()])
      .then(([ownerUserId, offlineSession]) => {
        if (!isMounted) {
          return null;
        }

        setRequiresReenrollment(Boolean(offlineSession?.requiresReenrollment));
        if (!ownerUserId || !offlineSession || offlineSession.userId !== ownerUserId || !isOfflineSessionValid(offlineSession, currentContourId)) {
          return null;
        }

        return getLocalUserProfile(ownerUserId);
      })
      .then((loaded) => {
        if (isMounted) {
          setProfile(loaded);
          setIsReady(true);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadError("Не удалось открыть локальную сессию. Данные не удалены. Повторите попытку.");
          setIsReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loadAttempt]);

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

      markSessionUnlocked();
      router.replace((consumePendingSessionRoute() ?? "/(tabs)/patrol") as never);
    } catch {
      setAuthError("На устройстве не настроена безопасная блокировка. Офлайн-данные не открыты.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  if (!isReady) {
    return (
      <Screen title="Проверка сохранённой сессии" subtitle="Читаем локальные данные на телефоне.">
        <ActivityIndicator />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen title="Не удалось открыть сессию" subtitle="Локальные данные не изменены.">
        <Card>
          <Text style={styles.text}>{loadError}</Text>
        </Card>
        <PrimaryButton label="Повторить" onPress={() => {
          setIsReady(false);
          setLoadError(null);
          setLoadAttempt((value) => value + 1);
        }} />
        <PrimaryButton label="Войти онлайн" onPress={() => router.replace("/(auth)/login")} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen title="Офлайн-доступ" subtitle="На телефоне нет сохранённого пользователя.">
        <Card>
          <Text style={styles.text}>Для первого входа нужен сервер. Проверьте Wi-Fi и адрес сервера.</Text>
        </Card>
        <PrimaryButton label="Войти онлайн" onPress={() => router.replace("/(auth)/login")} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Разблокировка приложения"
      subtitle="Сессия сохранена на устройстве. Подтвердите доступ, чтобы открыть загруженные задания без сервера."
    >
      <Card>
        <Text style={styles.label}>Сохранённый пользователь</Text>
        <Text style={styles.title}>{profile.fullName}</Text>
        <Text style={styles.text}>
          Новые данные появятся после восстановления связи. Локальные действия сохранятся на телефоне и отправятся позже.
        </Text>
      </Card>
      {requiresReenrollment ? (
        <Text style={styles.error}>Требуется повторная регистрация устройства. Локальные отчёты и очередь сохранены. Нажмите «Войти онлайн», когда сервер будет доступен.</Text>
      ) : null}
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
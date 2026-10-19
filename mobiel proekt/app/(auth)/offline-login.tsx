import * as LocalAuthentication from "expo-local-authentication";
import { resolvePatrolStartPath } from '@/services/patrolNavigationService';
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { isOfflineSessionValid } from "@/auth/offlineSession";
import { evaluateOfflineAccess } from "@/auth/offlineAccessPolicy";
import { consumePendingSessionRoute, markSessionUnlocked } from "@/auth/sessionGateState";
import { getOfflineSession, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getLocalUserProfile } from "@/db/repositories/bootstrapRepository";
import { runMobileRecoveryCycle } from "@/sync/syncTriggers";
import { useAppTheme } from "@/features/settings/themePreference";
import { ThemeColors } from "@/ui/atomTheme";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";

type LocalUserProfile = {
  serverUserId: string;
  fullName: string;
};

export default function OfflineLoginRoute() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
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

      const offlineSession = await getOfflineSession();
      const access = evaluateOfflineAccess(offlineSession, {
        authenticationSatisfied: true,
        expectedContourId: currentContourId
      });

      if (access.mode !== "full") {
        setAuthError("Офлайн-доступ недоступен: сохранённая сессия не разрешает открыть рабочие разделы приложения.");
        return;
      }
      markSessionUnlocked();

      // The network may have returned while the offline unlock screen was
      // open. NetInfo has already emitted its event in that case, so request
      // one non-blocking pass explicitly after unlocking the local session.
      void runMobileRecoveryCycle("appActive", "normal");
      router.replace((consumePendingSessionRoute() ?? await resolvePatrolStartPath()) as never);
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
        loading={isAuthenticating}
        label={isAuthenticating ? "Проверяем доступ..." : "Открыть сохранённую смену"}
        onPress={() => void continueOffline()}
      />
      <PrimaryButton label={requiresReenrollment ? "Подтвердить вход для синхронизации" : "Войти онлайн"} onPress={() => router.replace("/(auth)/login")} />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  label: {
    color: colors.mutedText,
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
    textTransform: "uppercase"
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontFamily: "Manrope_800ExtraBold"
  },
  text: {
    color: colors.mutedText,
    fontSize: 16,
    lineHeight: 24
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20
  }
});

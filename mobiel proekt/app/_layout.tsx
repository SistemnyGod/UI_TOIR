import "react-native-gesture-handler";
import "react-native-reanimated";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { bootstrapApplication } from "@/core/bootstrap";
import { SessionGateProvider, SessionGuard } from "@/auth/SessionGate";
import { isSessionUnlocked, setPendingSessionRoute } from "@/auth/sessionGateState";
import { ThemeProvider, useAppTheme } from "@/features/settings/themePreference";
import { registerPushNotifications, refreshPushRegistrationIfAllowed, syncMobileNotifications, subscribeToMobilePushEvents } from "@/services/notificationService";
import { installMobileErrorReporter, logMobileError } from "@/services/mobileErrorReporter";
import { sanitizeDiagnosticMessage } from "@/services/diagnosticReportPolicy";
import { registerBackgroundSyncTask } from "@/sync/backgroundSyncTask";
import { registerBackgroundNotificationTask } from "@/services/backgroundNotificationTask";
import { requestMobileDataRefresh, subscribeToNetworkSync, triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";

export default function RootLayout() {
  const queryClient = useMemo(() => new QueryClient(), []);
  const [isReady, setIsReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<unknown>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    let isMounted = true;

    void bootstrapApplication()
      .then(() => {
        if (!isMounted) {
          return;
        }
        setIsReady(true);
        installMobileErrorReporter();
      })
      .catch((error) => {
        logMobileError("app.bootstrap.failed", error);
        if (isMounted) {
          setBootstrapError(error);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [bootstrapAttempt]);

  useEffect(() => {
    if (!isReady) {
      return undefined;
    }

    const unsubscribeNetworkSync = subscribeToNetworkSync();
    void registerBackgroundSyncTask().catch(() => undefined);
    void registerBackgroundNotificationTask().catch(() => undefined);
    const unsubscribePushEvents = subscribeToMobilePushEvents({
      onNotification: () => {
        void syncMobileNotifications().catch(() => []);
        requestMobileDataRefresh("push", { force: true });
        triggerForegroundSyncWithRetry();
      },
      onNotificationResponse: (response) => {
        void syncMobileNotifications().catch(() => []);
        requestMobileDataRefresh("notificationResponse", { force: true });
        triggerForegroundSyncWithRetry();
        openNotificationTarget(response);
      }
    });

    void registerPushNotifications()
      .then(() => syncMobileNotifications())
      .then(() => {
        requestMobileDataRefresh("appActive", { force: true });
      })
      .catch(() => undefined);

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        requestMobileDataRefresh("appActive");
        triggerForegroundSyncWithRetry();
        void refreshPushRegistrationIfAllowed().catch(() => undefined);
      }
    });

    return () => {
      unsubscribeNetworkSync();
      unsubscribePushEvents();
      appStateSubscription.remove();
    };
  }, [isReady]);

  if (bootstrapError) {
    return (
      <BootstrapFailureScreen
        attempt={bootstrapAttempt + 1}
        error={bootstrapError}
        onRetry={() => {
          setIsReady(false);
          setBootstrapError(null);
          setBootstrapAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }

  if (!isReady) {
    return (
      <>
        <StatusBar style="dark" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Подготавливаем защищённое хранилище…</Text>
        </View>
      </>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionGateProvider>
          <SessionGuard>
            <RootStack />
          </SessionGuard>
        </SessionGateProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function BootstrapFailureScreen({
  attempt,
  error,
  onRetry
}: {
  attempt: number;
  error: unknown;
  onRetry: () => void;
}) {
  const technicalMessage = bootstrapErrorMessage(error);

  return (
    <>
      <StatusBar style="dark" />
      <View style={styles.failureScreen}>
      <Text accessibilityRole="header" style={styles.failureTitle}>Не удалось подготовить приложение</Text>
      <Text style={styles.failureMessage}>
        Локальное хранилище не инициализировано. Рабочие данные не изменены. Повторите запуск или обратитесь к администратору.
      </Text>
      <Text selectable style={styles.failureCode}>Код: P360-LOCAL-STORAGE · попытка {attempt}</Text>
      {technicalMessage ? <Text selectable style={styles.failureDetails}>{technicalMessage}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Повторно открыть защищённое локальное хранилище"
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
      >
        <Text style={styles.retryButtonText}>Повторить</Text>
      </Pressable>
      <Text style={styles.failureSupport}>Если ошибка повторяется, сообщите администратору код и текст выше.</Text>
      </View>
    </>
  );
}

function bootstrapErrorMessage(error: unknown) {
  const messages: string[] = [];
  let current = error;
  for (let depth = 0; depth < 3 && current instanceof Error; depth += 1) {
    const message = sanitizeDiagnosticMessage(current.message);
    if (message && !messages.includes(message)) {
      messages.push(message);
    }
    current = current.cause;
  }
  return messages.join(" Причина: ");
}

function openNotificationTarget(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data ?? {};
  const entityType = typeof data.entityType === "string" ? data.entityType : null;
  const entityId = typeof data.entityId === "string" ? data.entityId : null;

  const target = entityType === "patrolRequest" && entityId
    ? `/patrol/request/${entityId}`
    : "/patrol/request-board";

  if (isSessionUnlocked()) {
    router.push(target as never);
    return;
  }

  setPendingSessionRoute(target);
  router.replace("/");
}

function RootStack() {
  const { statusBarStyle } = useAppTheme();

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loadingText: {
    color: "#53627b",
    fontSize: 14,
    marginTop: 14
  },
  failureScreen: {
    alignItems: "center",
    backgroundColor: "#f4f7fb",
    flex: 1,
    justifyContent: "center",
    padding: 28
  },
  failureTitle: {
    color: "#14233d",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center"
  },
  failureMessage: {
    color: "#53627b",
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 420,
    textAlign: "center"
  },
  failureCode: {
    color: "#14233d",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 16,
    textAlign: "center"
  },
  failureDetails: {
    color: "#53627b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    maxWidth: 420,
    textAlign: "center"
  },
  retryButton: {
    backgroundColor: "#1769e0",
    borderRadius: 12,
    marginTop: 24,
    minWidth: 144,
    paddingHorizontal: 22,
    paddingVertical: 13
  },
  retryButtonPressed: {
    opacity: 0.78
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center"
  },
  failureSupport: {
    color: "#53627b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
    maxWidth: 360,
    textAlign: "center"
  }
});

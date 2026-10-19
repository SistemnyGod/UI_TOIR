import "react-native-gesture-handler";
import "react-native-reanimated";

import type * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFonts, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";

import { PrimaryButton } from "@/ui/PrimaryButton";
import { BootSplash } from "@/ui/BootSplash";
import { startConnectionMonitor } from "@/core/connectionStatus";
import { bootstrapApplication, runDeferredStartupMaintenance } from "@/core/bootstrap";
import { runAfterFirstRender } from "@/core/afterFirstRender";
import { classifyStartupError, StartupState } from "@/core/startupState";
import { SessionGateProvider, SessionGuard } from "@/auth/SessionGate";
import { AppUpdateGate } from "@/features/appUpdate/AppUpdateGate";
import { NfcGuardHost } from "@/features/patrol/NfcGuardHost";
import { isSessionUnlocked, setPendingSessionRoute } from "@/auth/sessionGateState";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { ThemeProvider, useAppTheme } from "@/features/settings/themePreference";
import { registerPushNotifications, refreshPushRegistrationIfAllowed, subscribeToMobilePushEvents } from "@/services/notificationService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { installCrashCapture } from "@/services/crashCapture";
import { AppErrorBoundary } from "@/ui/AppErrorBoundary";
import { sanitizeDiagnosticMessage } from "@/services/diagnosticReportPolicy";
import { registerBackgroundSyncTask, syncPendingReportsOnBackground } from "@/sync/backgroundSyncTask";
import { registerBackgroundNotificationTask } from "@/services/backgroundNotificationTask";
import { runMobileRecoveryCycle } from "@/sync/syncTriggers";
import { startPatrolSyncCoordinator } from "@/sync/PatrolSyncCoordinator";
import { startReportAutoSubmit } from "@/services/reportAutoSubmitLifecycle";
import { cancelNextOutboxRetry, scheduleNextOutboxRetry } from "@/sync/outboxRetryScheduler";
import { resolvePushNavigationTarget } from "@/services/pushNavigationResolver";

// Installed at module load, before bootstrap, so a crash while the database
// starts is still written to the crash file.
installCrashCapture();

export default function RootLayout() {
  return (
    <AppErrorBoundary onRecover={() => router.replace("/")}>
      <ThemeProvider><RootContent /></ThemeProvider>
    </AppErrorBoundary>
  );
}

function RootContent() {
  const { statusBarStyle } = useAppTheme();
  useEffect(() => { startConnectionMonitor(); }, []);
  const [startupState, setStartupState] = useState<StartupState>({ status: "initializing" });
  const isReady = startupState.status === "ready";
  const bootstrapError = startupState.status === "recoverableError" || startupState.status === "fatalDatabaseError"
    ? startupState.error
    : null;
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [fontsLoaded, fontError] = useFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const [fontWaitOver, setFontWaitOver] = useState(false);
  // Never hold startup on fonts: after a short wait the system font is used.
  useEffect(() => { const timer = setTimeout(() => setFontWaitOver(true), 2500); return () => clearTimeout(timer); }, []);
  const fontsReady = fontsLoaded || !!fontError || fontWaitOver;

  useEffect(() => {
    let isMounted = true;

    void bootstrapApplication()
      .then(() => {
        if (!isMounted) {
          return;
        }
        setStartupState({ status: "ready" });
        void getStoredOwnerUserId().then(scheduleNextOutboxRetry).catch((error) => {
          void logMobileError("sync.retry_schedule.failed", error);
        });
      })
      .catch((error) => {
        logMobileError("app.bootstrap.failed", error);
        if (isMounted) {
          setStartupState(classifyStartupError(error));
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

    const stopPatrolSync = startPatrolSyncCoordinator();
    const stopReportAutoSubmit = startReportAutoSubmit();
    void runMobileRecoveryCycle("appActive", "normal");
    // Registrations and housekeeping wait until the first screen has drawn.
    const cancelDeferredStartup = runAfterFirstRender(() => {
      void runDeferredStartupMaintenance().catch((error) => {
        void logMobileError("app.startup.maintenance.failed", error);
      });
      void registerBackgroundSyncTask().catch((error) => {
        void logMobileError("background.sync.registration.failed", error);
      });
      void registerBackgroundNotificationTask().catch((error) => {
        void logMobileError("background.notification.registration.failed", error);
      });
      void registerPushNotifications()
        .then(() => runMobileRecoveryCycle("appActive", "normal"))
        .catch(() => undefined);
    });
    const unsubscribePushEvents = subscribeToMobilePushEvents({
      onNotification: () => {
        void runMobileRecoveryCycle("push", "normal");
      },
      onNotificationResponse: (response) => {
        void runMobileRecoveryCycle("notificationResponse", "normal");
        openNotificationTarget(response);
      }
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void runMobileRecoveryCycle("appActive", "normal");
        void getStoredOwnerUserId().then(scheduleNextOutboxRetry).catch((error) => {
          void logMobileError("sync.retry_schedule.failed", error);
        });
        void refreshPushRegistrationIfAllowed().catch(() => undefined);
      } else if (state === "background") {
        void syncPendingReportsOnBackground().catch((error) => {
          void logMobileError("background.sync.handoff.failed", error);
        });
      }
    });

    return () => {
      cancelDeferredStartup();
      stopPatrolSync();
      stopReportAutoSubmit();
      unsubscribePushEvents();
      appStateSubscription.remove();
      cancelNextOutboxRetry();
    };
  }, [isReady]);

  if (bootstrapError) {
    return (
      <BootstrapFailureScreen
        attempt={bootstrapAttempt + 1}
        error={bootstrapError}
        onRetry={() => {
          setStartupState({ status: "initializing" });
          setBootstrapAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }

  if (!isReady || !fontsReady) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <BootSplash />
      </>
    );
  }

  return (
    <AppUpdateGate>
      <SessionGateProvider>
        <SessionGuard>
          <RootStack />
        </SessionGuard>
        <NfcGuardHost />
      </SessionGateProvider>
    </AppUpdateGate>
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
  const { colors, statusBarStyle } = useAppTheme();
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.failureScreen}>
      <Text accessibilityRole="header" style={[styles.failureTitle, { color: colors.text }]}>Не удалось подготовить приложение</Text>
      <Text style={[styles.failureMessage, { color: colors.mutedText }]}>
        Локальное хранилище не инициализировано. Рабочие данные не изменены. Повторите запуск или обратитесь к администратору.
      </Text>
      <Text selectable style={[styles.failureCode, { color: colors.text }]}>Код: P360-LOCAL-STORAGE · попытка {attempt}</Text>
      {showDetails && technicalMessage ? <Text selectable style={[styles.failureDetails, { color: colors.mutedText }]}>{technicalMessage}</Text> : null}
      <View style={{ alignSelf: "stretch", gap: 12, marginTop: 24 }}>
        <PrimaryButton label="Повторить" onPress={onRetry} icon="refresh-outline" />
        {technicalMessage ? <PrimaryButton label={showDetails ? "Скрыть технические сведения" : "Технические сведения"} onPress={() => setShowDetails(value => !value)} variant="secondary" /> : null}
      </View>
      <Text style={[styles.failureSupport, { color: colors.mutedText }]}>Если ошибка повторяется, сообщите администратору код и текст выше.</Text>
      </ScrollView>
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
  const target = resolvePushNavigationTarget(response.notification.request.content.data)?.path
    ?? "/patrol/request-board";

  if (isSessionUnlocked()) {
    router.push(target as never);
    return;
  }

  setPendingSessionRoute(target);
  router.replace("/");
}

function RootStack() {
  const { colors, statusBarStyle } = useAppTheme();

  return (
    <>
      <StatusBar style={statusBarStyle} />
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", animationDuration: 260, contentStyle: { backgroundColor: colors.background } }}>
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
    flexGrow: 1,
    justifyContent: "center",
    padding: 28
  },
  failureTitle: {
    color: "#14233d",
    fontSize: 22,
    fontFamily: "Manrope_800ExtraBold",
    marginBottom: 12,
    textAlign: "center"
  },
  failureMessage: {
    color: "#53627b",
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 420,
    textAlign: "center"
  },
  failureCode: {
    color: "#14233d",
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
    marginTop: 16,
    textAlign: "center"
  },
  failureDetails: {
    color: "#53627b",
    fontSize: 14,
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
    fontSize: 16,
    fontFamily: "Manrope_800ExtraBold",
    textAlign: "center"
  },
  failureSupport: {
    color: "#53627b",
    fontSize: 14,
    lineHeight: 18,
    marginTop: 14,
    maxWidth: 360,
    textAlign: "center"
  }
});

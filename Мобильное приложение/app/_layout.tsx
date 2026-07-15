import "react-native-gesture-handler";
import "react-native-reanimated";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";

import { bootstrapApplication } from "@/core/bootstrap";
import { ThemeProvider, useAppTheme } from "@/features/settings/themePreference";
import { registerPushNotifications, refreshPushRegistrationIfAllowed, syncMobileNotifications, subscribeToMobilePushEvents } from "@/services/notificationService";
import { installMobileErrorReporter, logMobileError } from "@/services/mobileErrorReporter";
import { registerBackgroundSyncTask } from "@/sync/backgroundSyncTask";
import { requestMobileDataRefresh, subscribeToNetworkSync, triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";

export default function RootLayout() {
  const queryClient = useMemo(() => new QueryClient(), []);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    void bootstrapApplication()
      .then(() => installMobileErrorReporter())
      .catch((error) => logMobileError("app.bootstrap.failed", error))
      .finally(() => setIsReady(true));
  }, []);

  useEffect(() => {
    if (!isReady) {
      return undefined;
    }

    const unsubscribeNetworkSync = subscribeToNetworkSync();
    void registerBackgroundSyncTask().catch(() => undefined);
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

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RootStack />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function openNotificationTarget(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data ?? {};
  const entityType = typeof data.entityType === "string" ? data.entityType : null;
  const entityId = typeof data.entityId === "string" ? data.entityId : null;

  if (entityType === "patrolRequest" && entityId) {
    router.push(`/patrol/request/${entityId}`);
    return;
  }

  router.push("/patrol/request-board");
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

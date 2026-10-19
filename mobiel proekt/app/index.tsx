import { Redirect, type Href } from "expo-router";
import { resolvePatrolStartPath } from '@/services/patrolNavigationService';
import { consumePendingSessionRoute, markSessionUnlocked } from '@/auth/sessionGateState';
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { recoveryScreenStyles as styles } from "@/ui/recoveryScreenStyles";
import { resolveSessionRestoreDecision } from "@/auth/sessionRestorePolicy";
import { clearAuthTokens, getAccessToken, getOfflineSession, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";

type AuthRoute = "/(auth)/login" | "/(auth)/offline-login";
type TargetRoute = AuthRoute | string;

type IndexState = {
  status: "checking" | "ready" | "error";
  target: TargetRoute | null;
  error: string | null;
};

export default function IndexRoute() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<IndexState>({ status: "checking", target: null, error: null });

  useEffect(() => {
    let isMounted = true;

    void Promise.all([getAccessToken(), getStoredOwnerUserId(), getOfflineSession()])
      .then(async ([accessToken, ownerUserId, offlineSession]) => {
        const decision = resolveSessionRestoreDecision({
          accessToken,
          ownerUserId,
          offlineSession,
          contourId: currentContourId
        });

        if (accessToken && offlineSession && decision === "login") {
          await clearAuthTokens();
        }

        if (!isMounted) {
          return;
        }

        if (decision === "resume") {
          markSessionUnlocked();
        }

        const target = decision === "resume"
            ? consumePendingSessionRoute() ?? await resolvePatrolStartPath()
            : decision === "offline-unlock"
              ? "/(auth)/offline-login"
              : "/(auth)/login";
        if (!isMounted) return;
        setState({
          status: "ready",
          target,
          error: null
        });
      })
      .catch(() => {
        if (isMounted) {
          setState({
            status: "error",
            target: null,
            error: "Не удалось прочитать сохранённую сессию. Данные не удалены. Повторите попытку."
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [attempt]);

  if (state.status === "error") {
    return (
      <View style={styles.errorScreen}>
        <Text accessibilityRole="header" style={styles.errorTitle}>Не удалось восстановить сессию</Text>
        <Text style={styles.errorMessage}>{state.error}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Повторить восстановление сессии"
          onPress={() => {
            setState({ status: "checking", target: null, error: null });
            setAttempt((value) => value + 1);
          }}
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
        >
          <Text style={styles.retryButtonText}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  if (state.status !== "ready" || !state.target) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Redirect href={state.target as Href} />;
}

import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { resolveSessionRestoreDecision } from "@/auth/sessionRestorePolicy";
import { markSessionUnlocked } from "@/auth/sessionGateState";
import { clearAuthTokens, getAccessToken, getOfflineSession, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";

const protectedRoute = "/(tabs)/patrol" as const;
type AuthRoute = "/(auth)/login" | "/(auth)/offline-login";
type TargetRoute = AuthRoute | typeof protectedRoute;

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

        setState({
          status: "ready",
          target: decision === "resume"
            ? protectedRoute
            : decision === "offline-unlock"
              ? "/(auth)/offline-login"
              : "/(auth)/login",
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

  return <Redirect href={state.target} />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center"
  },
  errorScreen: {
    alignItems: "center",
    backgroundColor: "#f4f7fb",
    flex: 1,
    justifyContent: "center",
    padding: 28
  },
  errorTitle: {
    color: "#14233d",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center"
  },
  errorMessage: {
    color: "#53627b",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
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
    fontWeight: "800"
  }
});
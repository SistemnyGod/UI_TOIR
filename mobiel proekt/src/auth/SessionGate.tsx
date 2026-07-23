import { usePathname, useRouter, useSegments } from "expo-router";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { resolveSessionRestoreDecision } from "@/auth/sessionRestorePolicy";
import { markSessionUnlocked, isSessionUnlocked, setPendingSessionRoute, subscribeToSessionGate } from "@/auth/sessionGateState";
import { clearAuthTokens, getAccessToken, getOfflineSession, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";

type SessionGateContextValue = {
  isUnlocked: boolean;
};

const SessionGateContext = createContext<SessionGateContextValue | null>(null);

export function SessionGateProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(isSessionUnlocked);
  const value = useMemo(() => ({ isUnlocked }), [isUnlocked]);

  useEffect(() => {
    const unsubscribe = subscribeToSessionGate(setIsUnlocked);
    return () => {
      unsubscribe();
    };
  }, []);

  return <SessionGateContext.Provider value={value}>{children}</SessionGateContext.Provider>;
}

export function SessionGuard({ children }: { children: ReactNode }) {
  const { isUnlocked } = useSessionGate();
  const pathname = usePathname();
  const router = useRouter();
  const segments = useSegments();
  const [status, setStatus] = useState<"checking" | "locked" | "error">("checking");
  const [authRoute, setAuthRoute] = useState<"/(auth)/login" | "/(auth)/offline-login" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const firstSegment = segments[0] as string | undefined;
  const isAuthRoute = firstSegment === "(auth)";
  const isIndexRoute = !firstSegment || firstSegment === "index";
  const isProtectedRoute = !isAuthRoute && !isIndexRoute;

  useEffect(() => {
    if (isUnlocked) {
      return undefined;
    }

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
          return;
        }

        setAuthRoute(decision === "offline-unlock" ? "/(auth)/offline-login" : "/(auth)/login");
        setStatus("locked");
      })
      .catch(() => {
        if (isMounted) {
          setAuthRoute(null);
          setErrorMessage("Не удалось проверить сохранённую сессию. Данные не удалены. Повторите попытку.");
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [checkAttempt, isUnlocked]);

  useEffect(() => {
    if (!isProtectedRoute || isUnlocked || status !== "locked" || !authRoute) {
      return;
    }

    setPendingSessionRoute(pathname);
    router.replace(authRoute);
  }, [authRoute, isProtectedRoute, isUnlocked, pathname, router, status]);

  if (isAuthRoute || isIndexRoute || isUnlocked) {
    return <>{children}</>;
  }

  if (isProtectedRoute && status === "error") {
    return (
      <View style={styles.errorScreen}>
        <Text accessibilityRole="header" style={styles.errorTitle}>Не удалось восстановить доступ</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Повторить проверку сессии"
          onPress={() => {
            setErrorMessage(null);
            setStatus("checking");
            setCheckAttempt((value) => value + 1);
          }}
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
        >
          <Text style={styles.retryButtonText}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" />
    </View>
  );
}

function useSessionGate() {
  const context = useContext(SessionGateContext);
  if (!context) {
    throw new Error("SessionGateProvider is missing");
  }

  return context;
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
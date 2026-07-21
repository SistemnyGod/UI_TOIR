import { usePathname, useRouter, useSegments } from "expo-router";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { isOfflineSessionValid } from "@/auth/offlineSession";
import { clearAuthTokens, getAccessToken, getOfflineSession, getStoredOwnerUserId } from "@/auth/tokenStorage";
import {
  isSessionUnlocked,
  setPendingSessionRoute,
  subscribeToSessionGate
} from "@/auth/sessionGateState";

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
  const [status, setStatus] = useState<"checking" | "locked">("checking");
  const [authRoute, setAuthRoute] = useState<"/(auth)/login" | "/(auth)/offline-login" | null>(null);
  const firstSegment = segments[0] as string | undefined;
  const isAuthRoute = firstSegment === "(auth)";
  const isIndexRoute = !firstSegment || firstSegment === "index";
  const isProtectedRoute = !isAuthRoute && !isIndexRoute;
  const effectiveStatus = isUnlocked ? "unlocked" : status;

  useEffect(() => {
    if (isUnlocked) {
      return undefined;
    }

    let isMounted = true;
    void Promise.all([getAccessToken(), getStoredOwnerUserId(), getOfflineSession()])
      .then(async ([token, ownerUserId, offlineSession]) => {
        const offlineAvailable = Boolean(
          ownerUserId
          && offlineSession
          && offlineSession.userId === ownerUserId
          && isOfflineSessionValid(offlineSession)
        );

        if (token && offlineSession && !isOfflineSessionValid(offlineSession)) {
          await clearAuthTokens();
        }

        if (isMounted) {
          setAuthRoute(offlineAvailable ? "/(auth)/offline-login" : "/(auth)/login");
          setStatus("locked");
        }
      })
      .catch(() => {
        if (isMounted) {
          setAuthRoute("/(auth)/login");
          setStatus("locked");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isUnlocked]);

  useEffect(() => {
    if (!isProtectedRoute || isUnlocked || effectiveStatus !== "locked" || !authRoute) {
      return;
    }

    setPendingSessionRoute(pathname);
    router.replace(authRoute);
  }, [authRoute, effectiveStatus, isProtectedRoute, isUnlocked, pathname, router]);

  if (isAuthRoute || isIndexRoute || isUnlocked) {
    return <>{children}</>;
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
  }
});

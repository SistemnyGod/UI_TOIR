import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { isOfflineSessionValid } from "@/auth/offlineSession";
import { clearAuthTokens, getAccessToken, getOfflineSession, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";

export default function IndexRoute() {
  const [target, setTarget] = useState<"/(auth)/login" | "/(auth)/offline-login" | "/(tabs)/patrol" | null>(null);

  useEffect(() => {
    void Promise.all([getAccessToken(), getStoredOwnerUserId(), getOfflineSession()]).then(async ([token, ownerUserId, offlineSession]) => {
      if (offlineSession && offlineSession.userId === ownerUserId && isOfflineSessionValid(offlineSession, currentContourId)) {
        setTarget("/(auth)/offline-login");
        return;
      }

      if (token && offlineSession && !isOfflineSessionValid(offlineSession, currentContourId)) {
        await clearAuthTokens();
      }

      setTarget(ownerUserId ? "/(auth)/offline-login" : "/(auth)/login");
    });
  }, []);

  if (!target) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Redirect href={target} />;
}

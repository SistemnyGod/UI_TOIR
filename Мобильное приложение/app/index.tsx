import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { getAccessToken, getStoredOwnerUserId } from "@/auth/tokenStorage";

export default function IndexRoute() {
  const [target, setTarget] = useState<"/(auth)/login" | "/(auth)/offline-login" | "/(tabs)/patrol" | null>(null);

  useEffect(() => {
    void Promise.all([getAccessToken(), getStoredOwnerUserId()]).then(([token, ownerUserId]) => {
      if (token) {
        setTarget("/(tabs)/patrol");
        return;
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

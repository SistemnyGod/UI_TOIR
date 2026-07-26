import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getLocalUserProfile } from "@/db/repositories/bootstrapRepository";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";

type LocalUserProfile = {
  serverUserId: string;
  fullName: string;
};

export default function OfflineEmergencyRoute() {
  const router = useRouter();
  const [profile, setProfile] = useState<LocalUserProfile | null>(null);

  useEffect(() => {
    let mounted = true;
    void getStoredOwnerUserId()
      .then((ownerUserId) => ownerUserId ? getLocalUserProfile(ownerUserId) : null)
      .then((value) => {
        if (mounted) {
          setProfile(value);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  if (!profile) {
    return (
      <Screen title="Emergency view" subtitle="Reading saved data.">
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen title="Emergency view" subtitle="Read-only mode. Work actions and uploads are blocked.">
      <Card>
        <Text style={styles.label}>Saved user</Text>
        <Text style={styles.title}>{profile.fullName}</Text>
        <Text style={styles.text}>The protected offline period has expired. Connect to the server and sign in online to continue patrols.</Text>
      </Card>
      <PrimaryButton label="Sign in online" onPress={() => router.replace("/(auth)/login")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: "#64748b", fontSize: 13, fontWeight: "700", textTransform: "uppercase" },
  title: { color: "#0f172a", fontSize: 20, fontWeight: "800", marginTop: 4 },
  text: { color: "#475569", fontSize: 15, lineHeight: 21, marginTop: 12 }
});

import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Text, View } from "react-native";
import { captureDataOwnerContext, assertDataOwnerContext } from "@/auth/dataOwnerContext";
import { getOfflineSession } from "@/auth/tokenStorage";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";

/** The account is independent of each assignment's performer. */
export function AccountIdentity() {
  const { colors } = useAppTheme();
  const [identity, setIdentity] = useState<{ account: string } | null>(null);
  const [error, setError] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      const owner = await captureDataOwnerContext();
      const session = await getOfflineSession();
      await assertDataOwnerContext(owner);
      if (active) {
        setIdentity({ account: session?.userId === owner.ownerUserId ? session.fullName : "Текущий аккаунт" });
        setError(false);
      }
    })().catch(() => { if (active) { setIdentity(null); setError(true); } });
    return () => { active = false; };
  }, []));
  return <Card>
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.mutedText, fontSize: 14, lineHeight: 20 }}>Аккаунт приложения</Text>
      <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: "700" }}>{identity?.account ?? (error ? "Не удалось прочитать аккаунт" : "Загрузка…")}</Text>
    </View>
  </Card>;
}

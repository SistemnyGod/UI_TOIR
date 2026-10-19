import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { loginHero } from "@/ui/brandPalette";
import { useThemedStyles } from "@/ui/useThemedStyles";
import { createLoginStyles } from "./loginStyles";
import type { LoginScreenState } from "./useLoginScreen";

type Props = Pick<LoginScreenState, "isSubmitting" | "serverBaseUrl" | "openServerSettings" | "showOtherDeviceLogin">;

/** Links under the card: connection settings, other-phone help and the support footer. */
export function LoginLinks({ isSubmitting, serverBaseUrl, openServerSettings, showOtherDeviceLogin }: Props) {
  const styles = useThemedStyles(createLoginStyles);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting}
        onPress={openServerSettings}
        accessibilityHint={serverBaseUrl ? `Текущий сервер: ${serverBaseUrl}` : undefined}
        style={styles.serverQuickLink}
      >
        <Text style={styles.serverQuickLinkText}>
          Настройки подключения
        </Text>
      </Pressable>

      <View style={styles.secondaryCard}>
        <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={showOtherDeviceLogin} style={styles.secondaryRow}>
          <Ionicons color={loginHero.phoneIcon} name="phone-portrait-outline" size={22} />
          <Text style={styles.secondaryText}>Как войти на другом телефоне</Text>
          <Ionicons color={loginHero.chevron} name="chevron-forward-outline" size={22} />
        </Pressable>
      </View>

      <Text style={styles.footer}>Поддержка сотрудников - Atom Minerals</Text>
    </>
  );
}

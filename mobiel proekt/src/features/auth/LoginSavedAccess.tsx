import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { useThemedStyles } from "@/ui/useThemedStyles";
import { createLoginStyles } from "./loginStyles";
import type { LoginScreenState } from "./useLoginScreen";

type Props = Pick<LoginScreenState, "offlineSessionName" | "biometricAvailable" | "isSubmitting" | "handleBiometricLogin" | "openOfflineLogin">;

/** Saved shift session and biometric unlock, shown under the login button when available. */
export function LoginSavedAccess({ offlineSessionName, biometricAvailable, isSubmitting, handleBiometricLogin, openOfflineLogin }: Props) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createLoginStyles);
  if (!offlineSessionName && !biometricAvailable) return null;
  return (
    <>
      <View style={styles.quickLoginWrap}>
        <View style={styles.line} />
        <Text style={styles.quickLoginText}>Сохранённый доступ</Text>
        <View style={styles.line} />
      </View>

      {offlineSessionName ? (
        <>
          <Text style={styles.offlineSessionText}>Аккаунт сохранённой смены: {offlineSessionName}</Text>
          <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={openOfflineLogin} style={[styles.loginButton, styles.quietButton, isSubmitting ? styles.loginButtonDisabled : null]}>
            <Text style={[styles.loginButtonText, styles.quietButtonText]}>Открыть сохранённую смену</Text>
          </Pressable>
        </>
      ) : null}
      {biometricAvailable ? (
        <>
          <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={handleBiometricLogin} accessibilityLabel="Войти с биометрией" style={styles.fingerprintButton}>
            <Ionicons color={colors.primary} name="finger-print-outline" size={32} />
          </Pressable>
          <Text style={styles.fingerprintText}>Войти с биометрией</Text>
        </>
      ) : null}
    </>
  );
}

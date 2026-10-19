import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import type { ThemeColors } from "@/ui/atomTheme";
import { loginStyles as styles, type LoginSkin } from "./loginStyles";
import type { LoginScreenState } from "./useLoginScreen";

type Props = Pick<LoginScreenState, "offlineSessionName" | "biometricAvailable" | "isSubmitting" | "handleBiometricLogin" | "openOfflineLogin">
  & { colors: ThemeColors; skin: LoginSkin };

/** Saved shift session and biometric unlock, shown under the login button when available. */
export function LoginSavedAccess({ offlineSessionName, biometricAvailable, isSubmitting, handleBiometricLogin, openOfflineLogin, colors, skin }: Props) {
  if (!offlineSessionName && !biometricAvailable) return null;
  return (
    <>
      <View style={styles.quickLoginWrap}>
        <View style={[styles.line, skin.line]} />
        <Text style={[styles.quickLoginText, skin.faint]}>Сохранённый доступ</Text>
        <View style={[styles.line, skin.line]} />
      </View>

      {offlineSessionName ? (
        <>
          <Text style={[styles.offlineSessionText, skin.muted]}>Аккаунт сохранённой смены: {offlineSessionName}</Text>
          <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={openOfflineLogin} style={[styles.loginButton, styles.quietButton, { backgroundColor: skin.quiet.backgroundColor }, isSubmitting ? styles.loginButtonDisabled : null]}>
            <Text style={[styles.loginButtonText, skin.link]}>Открыть сохранённую смену</Text>
          </Pressable>
        </>
      ) : null}
      {biometricAvailable ? (
        <>
          <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={handleBiometricLogin} accessibilityLabel="Войти с биометрией" style={[styles.fingerprintButton, skin.quiet]}>
            <Ionicons color={colors.primary} name="finger-print-outline" size={32} />
          </Pressable>
          <Text style={[styles.fingerprintText, skin.muted]}>Войти с биометрией</Text>
        </>
      ) : null}
    </>
  );
}

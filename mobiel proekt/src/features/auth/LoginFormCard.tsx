import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { useAppTheme } from "@/features/settings/themePreference";
import { loginHero } from "@/ui/brandPalette";
import { GradientFill } from "@/ui/GradientFill";
import { useThemedStyles } from "@/ui/useThemedStyles";
import { createLoginStyles } from "./loginStyles";
import type { LoginScreenState } from "./useLoginScreen";

type Props = Pick<LoginScreenState,
  | "login" | "password" | "rememberMe" | "rememberError" | "error" | "isSubmitting"
  | "hasSavedPassword" | "deviceLockAvailable"
  | "changeLogin" | "changePassword" | "toggleRememberChoice" | "handleSubmit" | "showPasswordRecovery"
> & { children?: ReactNode };

export function LoginFormCard(props: Props) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createLoginStyles);
  const { isSubmitting, rememberMe } = props;
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Логин</Text>
      <View style={styles.inputBox}>
        <Ionicons color={colors.primary} name="person-outline" size={21} />
        <TextInput
          testID="login-username"
          accessibilityLabel="Логин"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
          onChangeText={props.changeLogin}
          placeholder="Введите логин"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          value={props.login}
        />
      </View>

      <Text style={[styles.label, styles.passwordLabel]}>Пароль</Text>
      <View style={styles.inputBox}>
        <Ionicons color={colors.placeholder} name="lock-closed-outline" size={21} />
        <TextInput
          testID="login-password"
          accessibilityLabel="Пароль"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
          onChangeText={props.changePassword}
          placeholder={props.hasSavedPassword ? "Пароль сохранён на телефоне" : "Введите пароль"}
          placeholderTextColor={colors.placeholder}
          secureTextEntry
          style={styles.input}
          value={props.password}
        />
        <Ionicons accessibilityLabel="Пароль скрыт" color={colors.placeholder} name="eye-off-outline" size={20} />
      </View>
      {props.hasSavedPassword ? <SavedPasswordHint deviceLockAvailable={props.deviceLockAvailable} /> : null}

      <View style={styles.rowBetween}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="Запомнить логин и пароль"
          accessibilityState={{ checked: rememberMe }}
          disabled={isSubmitting}
          onPress={props.toggleRememberChoice}
          style={styles.rememberRow}
        >
          <View style={[styles.checkbox, rememberMe ? styles.checkboxActive : null]}>
            {rememberMe ? <Ionicons color={loginHero.ink} name="checkmark" size={16} /> : null}
          </View>
          <Text style={styles.rememberText}>Запомнить логин и пароль</Text>
        </Pressable>

        <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={props.showPasswordRecovery} style={styles.recoveryLink}>
          <Text style={styles.link}>Забыли пароль?</Text>
        </Pressable>
      </View>

      {props.rememberError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{props.rememberError}</Text> : null}
      {props.error ? <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>{props.error}</Text> : null}

      <Pressable
        testID="login-submit"
        accessibilityRole="button"
        disabled={isSubmitting}
        onPress={props.handleSubmit}
        style={({ pressed }) => [
          styles.loginButton,
          pressed ? styles.loginButtonPressed : null,
          isSubmitting ? styles.loginButtonDisabled : null
        ]}
      >
        {isSubmitting ? null : <GradientFill colors={colors} kind="accent" radius={18} />}
        {isSubmitting ? <ActivityIndicator color={loginHero.ink} /> : <Text style={styles.loginButtonText}>Войти на сервер</Text>}
      </Pressable>

      {props.children}
    </View>
  );
}

function SavedPasswordHint({ deviceLockAvailable }: { deviceLockAvailable: boolean | null }) {
  const styles = useThemedStyles(createLoginStyles);
  return deviceLockAvailable === false
    ? <Text testID="login-saved-password-hint" style={[styles.savedPasswordHint, styles.savedPasswordHintBlocked]}>На телефоне не настроена блокировка экрана, поэтому сохранённый пароль недоступен. Введите пароль вручную.</Text>
    : <Text testID="login-saved-password-hint" style={styles.savedPasswordHint}>Перед входом подтвердите отпечатком пальца или кодом блокировки телефона.</Text>;
}

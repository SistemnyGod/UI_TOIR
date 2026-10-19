import { Ionicons } from "@expo/vector-icons";
import { resolvePatrolStartPath } from '@/services/patrolNavigationService';
import * as LocalAuthentication from "expo-local-authentication";
import { forgetRememberedCredentials, prepareRememberedCredentialsSave, readRememberedCredentials } from "@/auth/rememberedCredentials";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { restoreSessionWithRefreshToken, signIn } from "@/auth/authService";
import { isOfflineSessionValid } from "@/auth/offlineSession";
import { currentContourId } from "@/core/environments";
import { consumePendingSessionRoute, markSessionUnlocked } from "@/auth/sessionGateState";
import { getOfflineSession, getRefreshToken, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getServerBaseUrl } from "@/core/serverSettings";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { useAppTheme } from "@/features/settings/themePreference";
import type { ThemeColors } from "@/ui/atomTheme";
import { BrandMark } from "@/ui/BrandMark";
import { GradientFill } from "@/ui/GradientFill";

const loginBackground = require("../../../assets/login-bg.png");

export function LoginScreen() {
  const router = useRouter();
  const { colors, effectiveScheme } = useAppTheme();
  const skin = loginSkin(colors, effectiveScheme === "dark");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [rememberError, setRememberError] = useState<string | null>(null);
  const credentialsEdited = useRef(false);
  const rememberEdited = useRef(false);
  const rememberChoice = useRef(false);
  // The saved password never enters the revealable field: it is kept here and
  // used only when the field is left empty for the same saved login.
  const savedPassword = useRef<{ login: string; password: string } | null>(null);
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const rememberVersion = useRef(0);
  const submitInFlight = useRef(false);
  const mounted = useRef(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverBaseUrl, setServerBaseUrl] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [offlineSessionName, setOfflineSessionName] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    mounted.current = true;
    void readRememberedCredentials().then(saved => {
      if (!isMounted) return;
      if (!rememberEdited.current) {
        rememberChoice.current = saved.remember;
        setRememberMe(saved.remember);
      }
      if (!credentialsEdited.current && rememberChoice.current) {
        setLogin(saved.login);
        if (saved.login && saved.password) {
          savedPassword.current = { login: saved.login, password: saved.password };
          setHasSavedPassword(true);
        }
      }
    }).catch(() => {
      if (isMounted) setRememberError("Не удалось прочитать сохранённый вход. Введите данные вручную.");
    });
    void getOfflineSession().then((session) => {
      if (isMounted && session && isOfflineSessionValid(session, currentContourId)) {
        setOfflineSessionName(session.fullName || session.userId);
      }
    }).catch(() => undefined);
    void LocalAuthentication.hasHardwareAsync()
      .then(async (hasHardware) => hasHardware && LocalAuthentication.isEnrolledAsync())
      .then((isAvailable) => {
        if (isMounted) {
          setBiometricAvailable(Boolean(isAvailable));
        }
      })
      .catch(() => {
        if (isMounted) {
          setBiometricAvailable(false);
        }
      });

    return () => {
      isMounted = false;
      mounted.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void getServerBaseUrl().then((value) => {
        if (isMounted) {
          setServerBaseUrl(value);
        }
      });

      return () => {
        isMounted = false;
      };
    }, [])
  );

  function discardSavedPassword() {
    savedPassword.current = null;
    setHasSavedPassword(false);
  }

  function toggleRememberChoice() {
    if (submitInFlight.current) return;
    rememberEdited.current = true;
    const next = !rememberChoice.current;
    const version = ++rememberVersion.current;
    rememberChoice.current = next;
    setRememberMe(next);
    setRememberError(null);
    if (!next) discardSavedPassword();
    if (!next) void forgetRememberedCredentials().catch(() => {
      if (mounted.current && version === rememberVersion.current) {
        setRememberError("Не удалось убрать сохранённые данные. Повторите попытку.");
      }
    });
  }

  async function handleSubmit() {
    if (submitInFlight.current) {
      return;
    }

    const normalizedLogin = login.trim();

    if (!normalizedLogin) {
      setError("Введите логин.");
      return;
    }

    const saved = savedPassword.current;
    const effectivePassword = password || (saved && saved.login.trim() === normalizedLogin ? saved.password : "");
    if (!effectivePassword) {
      setError("Введите пароль.");
      return;
    }

    submitInFlight.current = true;
    rememberEdited.current = true;
    const saveCredentials = rememberChoice.current ? prepareRememberedCredentialsSave() : null;
    setError(null);
    setRememberError(null);
    setIsSubmitting(true);

    try {
      if (!saveCredentials) {
        try { await forgetRememberedCredentials(); }
        catch { throw new Error("Не удалось убрать сохранённые данные. Повторите вход."); }
      }
      await signIn(normalizedLogin, effectivePassword);
      if (saveCredentials) {
        try { await saveCredentials(normalizedLogin, effectivePassword); }
        catch {
          Alert.alert("Данные для входа не сохранены", "Вход выполнен, но сохранить логин и пароль на телефоне не удалось. При следующем входе потребуется ввести их вручную.");
        }
      }
      markSessionUnlocked();
      router.replace((consumePendingSessionRoute() ?? await resolvePatrolStartPath()) as never);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Не удалось войти. Проверьте логин, пароль и подключение к серверу."
      );
    } finally {
      submitInFlight.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  }

  function showPasswordRecovery() {
    Alert.alert("Восстановление доступа", "Обратитесь к оператору или администратору панели.");
  }

  function showOtherDeviceLogin() {
    Alert.alert("Как войти на другом телефоне", "На другом зарегистрированном телефоне используйте логин и пароль, выданные оператором. Текущая локальная очередь на новый телефон не переносится.");
  }

  async function handleBiometricLogin() {
    if (submitInFlight.current) {
      return;
    }

    if (!biometricAvailable) {
      Alert.alert("Вход по отпечатку", "На устройстве не настроена биометрия.");
      return;
    }

    submitInFlight.current = true;
    setError(null);
    setIsSubmitting(true);
    try {
      const authResult = await LocalAuthentication.authenticateAsync({
        cancelLabel: "Отмена", fallbackLabel: "Ввести пароль", promptMessage: "Вход в Patrol360"
      });
      if (!authResult.success) return;
      const [offlineSession, ownerUserId] = await Promise.all([getOfflineSession(), getStoredOwnerUserId()]);
      if (offlineSession && ownerUserId === offlineSession.userId && isOfflineSessionValid(offlineSession, currentContourId)) {
        markSessionUnlocked();
        // If connectivity was restored before biometric confirmation, the
        // network event has already been consumed. Resume the retained outbox
        // explicitly after unlocking the local session.
        void triggerForegroundSyncWithRetry({ mode: "normal" });
        router.replace((consumePendingSessionRoute() ?? await resolvePatrolStartPath()) as never);
        return;
      }

      const savedRefreshToken = await getRefreshToken();
      if (!savedRefreshToken) {
        Alert.alert("Нет сохранённой сессии", "Для первого входа нужен сервер. После регистрации телефона повторный ввод пароля не потребуется.");
        return;
      }

      await restoreSessionWithRefreshToken();
      markSessionUnlocked();
      router.replace((consumePendingSessionRoute() ?? await resolvePatrolStartPath()) as never);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Не удалось войти по отпечатку. Проверьте подключение к серверу."
      );
    } finally {
      submitInFlight.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  }

  return (
    <ImageBackground source={loginBackground} resizeMode="cover" style={styles.background}>
      <StatusBar style="light" />
      <View style={[styles.overlay, skin.overlay]}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.logoBlock}>
                <View accessible accessibilityRole="image" accessibilityLabel="ATOM Minerals" style={styles.mark}>
                  <BrandMark size={64} light />
                </View>
                <Text style={styles.logoText}>ATOM</Text>
                <Text style={styles.logoSubText}>MINERALS</Text>
                <Text style={styles.title}>Система обхода территории</Text>
                <Text style={styles.subtitle}>Вход в мобильное приложение</Text>
              </View>

              <View style={[styles.card, skin.card]}>
                <Text style={[styles.label, skin.muted]}>Логин</Text>
                <View style={[styles.inputBox, skin.inputBox]}>
                  <Ionicons color={colors.primary} name="person-outline" size={21} />
                  <TextInput
                    accessibilityLabel="Логин"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSubmitting}
                    onChangeText={value => { credentialsEdited.current = true; discardSavedPassword(); setLogin(value); }}
                    placeholder="Введите логин"
                    placeholderTextColor={colors.placeholder}
                    style={[styles.input, skin.text]}
                    value={login}
                  />
                </View>

                <Text style={[styles.label, styles.passwordLabel, skin.muted]}>Пароль</Text>
                <View style={[styles.inputBox, skin.inputBox]}>
                  <Ionicons color={colors.placeholder} name="lock-closed-outline" size={21} />
                  <TextInput
                    accessibilityLabel="Пароль"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSubmitting}
                    onChangeText={value => { credentialsEdited.current = true; if (value) discardSavedPassword(); setPassword(value); }}
                    placeholder={hasSavedPassword ? "Пароль сохранён на телефоне" : "Введите пароль"}
                    placeholderTextColor={colors.placeholder}
                    secureTextEntry
                    style={[styles.input, skin.text]}
                    value={password}
                  />
                  <Ionicons accessibilityLabel="Пароль скрыт" color={colors.placeholder} name="eye-off-outline" size={20} />
                </View>

                <View style={styles.rowBetween}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel="Запомнить логин и пароль"
                    accessibilityState={{ checked: rememberMe }}
                    disabled={isSubmitting}
                    onPress={toggleRememberChoice}
                    style={styles.rememberRow}
                  >
                    <View style={[styles.checkbox, skin.checkbox, rememberMe ? styles.checkboxActive : null]}>
                      {rememberMe ? <Ionicons color="#ffffff" name="checkmark" size={16} /> : null}
                    </View>
                    <Text style={[styles.rememberText, skin.text]}>Запомнить логин и пароль</Text>
                  </Pressable>

                  <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={showPasswordRecovery} style={{ minHeight: 48, justifyContent: "center" }}>
                    <Text style={[styles.link, skin.link]}>Забыли пароль?</Text>
                  </Pressable>
                </View>

                {rememberError ? <Text accessibilityLiveRegion="polite" style={[styles.error, skin.error]}>{rememberError}</Text> : null}
                {error ? <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={[styles.error, skin.error]}>{error}</Text> : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    styles.loginButton,
                    pressed ? styles.loginButtonPressed : null,
                    isSubmitting ? styles.loginButtonDisabled : null
                  ]}
                >
                  {isSubmitting ? null : <GradientFill colors={colors} kind="accent" radius={18} />}
                  {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.loginButtonText}>Войти на сервер</Text>}
                </Pressable>

                {offlineSessionName || biometricAvailable ? <View style={styles.quickLoginWrap}>
                  <View style={[styles.line, skin.line]} />
                  <Text style={[styles.quickLoginText, skin.faint]}>Сохранённый доступ</Text>
                  <View style={[styles.line, skin.line]} />
                </View> : null}

                {offlineSessionName ? (
                  <>
                    <Text style={[styles.offlineSessionText, skin.muted]}>Аккаунт сохранённой смены: {offlineSessionName}</Text>
                    <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={() => router.push("/(auth)/offline-login")} style={[styles.loginButton, { backgroundColor: skin.quiet.backgroundColor, shadowOpacity: 0, elevation: 0 }, isSubmitting ? styles.loginButtonDisabled : null]}>
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
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={() => router.push("/(auth)/server-settings")}
                accessibilityHint={serverBaseUrl ? `Текущий сервер: ${serverBaseUrl}` : undefined}
                style={styles.serverQuickLink}
              >
                <Text style={styles.serverQuickLinkText}>
                  Настройки подключения
                </Text>
              </Pressable>

              <View style={styles.secondaryCard}>
                <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={showOtherDeviceLogin} style={styles.secondaryRow}>
                  <Ionicons color="#16a8ff" name="phone-portrait-outline" size={22} />
                  <Text style={styles.secondaryText}>Как войти на другом телефоне</Text>
                  <Ionicons color="#d6e9ff" name="chevron-forward-outline" size={22} />
                </Pressable>

              </View>

              <Text style={styles.footer}>Поддержка сотрудников - Atom Minerals</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: "#031b36",
    flex: 1
  },
  overlay: {
    backgroundColor: "rgba(9, 32, 92, 0.55)",
    flex: 1
  },
  safe: {
    flex: 1
  },
  keyboard: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 18
  },
  logoBlock: {
    alignItems: "center",
    marginBottom: 14
  },
  mark: { alignItems: "center", height: 64, justifyContent: "center", marginBottom: 12, width: 64 },
  logoText: {
    color: "#ffffff",
    fontSize: 34,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 5,
    lineHeight: 40,
    textAlign: "center"
  },
  logoSubText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontFamily: "Manrope_700Bold",
    letterSpacing: 6,
    textAlign: "center"
  },
  title: {
    color: "#ffffff",
    fontSize: 21,
    fontFamily: "Manrope_800ExtraBold",
    lineHeight: 26,
    marginTop: 18,
    textAlign: "center"
  },
  subtitle: {
    color: "#a9c5e7",
    fontSize: 16,
    lineHeight: 20,
    marginTop: 5,
    textAlign: "center"
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e6edf6",
    borderRadius: 28,
    borderWidth: 1,
    elevation: 12,
    padding: 20,
    shadowColor: "#000000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 16
  },
  label: {
    color: "#52637b",
    fontSize: 13,
    fontFamily: "Manrope_700Bold",
    marginBottom: 6
  },
  passwordLabel: {
    marginTop: 14
  },
  inputBox: {
    alignItems: "center",
    backgroundColor: "#f7f9fc",
    borderColor: "#dfe7f2",
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    paddingVertical: 6,
    paddingHorizontal: 13
  },
  input: {
    color: "#0f1a2b",
    flex: 1,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 16,
    minHeight: 48,
    paddingVertical: 8
  },
  rowBetween: {
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14
  },
  rememberRow: {
    minHeight: 48,
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  checkbox: {
    alignItems: "center",
    borderColor: "#2457f5",
    borderRadius: 8,
    borderWidth: 1.8,
    height: 24,
    justifyContent: "center",
    width: 24
  },
  checkboxActive: {
    backgroundColor: "#2457f5"
  },
  rememberText: {
    color: "#0f1a2b",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
    flexShrink: 1
  },
  link: {
    color: "#1e5bff",
    fontFamily: "Manrope_700Bold",
    fontSize: 14
  },
  error: {
    color: "#b42336",
    fontSize: 14,
    lineHeight: 18,
    marginTop: 10
  },
  loginButton: {
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#2457f5",
    borderRadius: 18,
    elevation: 6,
    minHeight: 56,
    shadowColor: "#2457f5",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    justifyContent: "center",
    marginTop: 18
  },
  loginButtonPressed: {
    backgroundColor: "#1846d8",
    transform: [{ scale: 0.97 }]
  },
  loginButtonDisabled: {
    opacity: 0.68
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 26,
    textAlign: "center",
    fontFamily: "Manrope_800ExtraBold"
  },
  quickLoginWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 18
  },
  line: {
    backgroundColor: "#e3eaf4",
    flex: 1,
    height: 1
  },
  quickLoginText: {
    color: "#66768c",
    fontSize: 14,
    flexShrink: 1
  },
  fingerprintButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#edf3ff",
    borderColor: "#c9d9ff",
    borderRadius: 27,
    borderWidth: 1.5,
    height: 54,
    justifyContent: "center",
    marginTop: 10,
    width: 54
  },
  fingerprintText: {
    color: "#52637b",
    fontSize: 14,
    marginTop: 6,
    textAlign: "center"
  },
  offlineSessionText: {
    color: "#52637b",
    fontSize: 14,
    marginTop: 10,
    textAlign: "center"
  },
  serverQuickLink: {
    minHeight: 48,
    justifyContent: "center",
    marginTop: 8,
    paddingVertical: 4
  },
  serverQuickLinkText: {
    color: "#9db7d7",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  localServerButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(19, 157, 255, 0.14)",
    borderColor: "rgba(19, 157, 255, 0.42)",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  localServerButtonPressed: {
    backgroundColor: "rgba(19, 157, 255, 0.24)"
  },
  localServerButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  localServerButtonUrl: {
    color: "#9db7d7",
    fontSize: 14,
    marginTop: 2
  },
  serverStatusText: {
    color: "#c7dbf4",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
    textAlign: "center"
  },
  secondaryCard: {
    backgroundColor: "rgba(5, 31, 58, 0.72)",
    borderColor: "rgba(122, 177, 232, 0.36)",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 5
  },
  secondaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 48
  },
  secondaryText: {
    color: "#ffffff",
    flex: 1,
    fontSize: 14
  },
  divider: {
    backgroundColor: "rgba(191, 216, 245, 0.18)",
    height: 1,
    marginLeft: 46
  },
  footer: {
    color: "#9db7d7",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center"
  },
  disabled: {
    opacity: 0.6
  }
});

/** Theme-dependent colours; the blue photo hero stays, the card follows the light or dark theme. */
function loginSkin(colors: ThemeColors, dark: boolean) {
  return {
    overlay: { backgroundColor: dark ? "rgba(3, 12, 32, 0.74)" : "rgba(9, 32, 92, 0.55)" },
    card: { backgroundColor: dark ? "#0b1a2f" : colors.card, borderColor: colors.cardBorder, shadowOpacity: dark ? 0.5 : 0.32 },
    inputBox: { backgroundColor: colors.field, borderColor: colors.border },
    text: { color: colors.text },
    muted: { color: colors.mutedText },
    faint: { color: colors.faintText },
    link: { color: colors.primary },
    error: { color: colors.danger },
    line: { backgroundColor: colors.border },
    checkbox: { borderColor: dark ? colors.primary : colors.accent },
    quiet: { backgroundColor: dark ? colors.tile : "#edf3ff", borderColor: dark ? colors.cardBorder : "#c9d9ff" }
  };
}

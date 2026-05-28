import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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

import { checkServerConnection } from "@/api/serverHealthApi";
import { restoreSessionWithRefreshToken, signIn } from "@/auth/authService";
import { getRefreshToken } from "@/auth/tokenStorage";
import { getServerBaseUrl, localLanServerBaseUrl, setLocalLanServerBaseUrl } from "@/core/serverSettings";

const rememberedLoginKey = "patrol360.rememberedLogin";
const legacyRememberedPasswordKey = "patrol360.rememberedPassword";
const rememberLoginKey = "patrol360.rememberLogin";
const loginBackground = require("../../../assets/login-bg.png");

export function LoginScreen() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverBaseUrl, setServerBaseUrl] = useState("");
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadRememberedLogin() {
      const shouldRemember = await SecureStore.getItemAsync(rememberLoginKey);
      const savedLogin = await SecureStore.getItemAsync(rememberedLoginKey);

      if (!isMounted) {
        return;
      }

      setRememberMe(shouldRemember !== "false");

      if (shouldRemember !== "false" && savedLogin) {
        setLogin(savedLogin);
      }
    }

    void loadRememberedLogin();
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

  async function saveRememberChoice(normalizedLogin: string) {
    if (rememberMe) {
      await SecureStore.setItemAsync(rememberLoginKey, "true");
      await SecureStore.setItemAsync(rememberedLoginKey, normalizedLogin);
      await SecureStore.deleteItemAsync(legacyRememberedPasswordKey);
      return;
    }

    await SecureStore.setItemAsync(rememberLoginKey, "false");
    await SecureStore.deleteItemAsync(rememberedLoginKey);
    await SecureStore.deleteItemAsync(legacyRememberedPasswordKey);
  }

  async function handleSubmit() {
    const normalizedLogin = login.trim();

    if (!normalizedLogin) {
      setError("Введите логин.");
      return;
    }

    if (!password) {
      setError("Введите пароль.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await signIn(normalizedLogin, password);
      await saveRememberChoice(normalizedLogin);
      router.replace("/(tabs)/patrol");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Не удалось войти. Проверьте логин, пароль и подключение к серверу."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUseLocalServer() {
    setError(null);
    setServerStatus("Проверяем локальный сервер...");

    try {
      const localUrl = await setLocalLanServerBaseUrl();
      setServerBaseUrl(localUrl);
      const result = await checkServerConnection(localUrl);
      setServerStatus(result.message);

      if (!result.ok) {
        setError(result.message);
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Не удалось подключить локальный сервер.";
      setServerStatus(message);
      setError(message);
    }
  }

  function showPasswordRecovery() {
    Alert.alert("Восстановление доступа", "Обратитесь к оператору или администратору панели.");
  }

  function showOtherDeviceLogin() {
    Alert.alert("Вход с другого устройства", "Для мобильного аккаунта используйте логин и пароль, выданные оператором.");
  }

  async function handleBiometricLogin() {
    if (!biometricAvailable) {
      Alert.alert("Вход по отпечатку", "На устройстве не настроена биометрия.");
      return;
    }

    const savedLogin = await SecureStore.getItemAsync(rememberedLoginKey);
    const savedRefreshToken = await getRefreshToken();

    if (!savedLogin || !savedRefreshToken) {
      Alert.alert("Нет сохраненной сессии", "Сначала войдите по логину и паролю. Повторный вход по отпечатку использует сохраненную сессию, а не пароль.");
      return;
    }

    const authResult = await LocalAuthentication.authenticateAsync({
      cancelLabel: "Отмена",
      fallbackLabel: "Ввести пароль",
      promptMessage: "Вход в Patrol360"
    });

    if (!authResult.success) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await SecureStore.deleteItemAsync(legacyRememberedPasswordKey);
      await restoreSessionWithRefreshToken();
      router.replace("/(tabs)/patrol");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Не удалось войти по отпечатку. Проверьте подключение к серверу."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ImageBackground source={loginBackground} resizeMode="cover" style={styles.background}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.logoBlock}>
                <Text style={styles.logoText}>AM</Text>
                <Text style={styles.logoSubText}>ATOM MINERALS</Text>
                <Text style={styles.title}>Система обхода территории</Text>
                <Text style={styles.subtitle}>Вход в мобильное приложение</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.label}>Логин</Text>
                <View style={styles.inputBox}>
                  <Ionicons color="#c6def7" name="person-outline" size={22} />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSubmitting}
                    onChangeText={setLogin}
                    placeholder="Введите логин"
                    placeholderTextColor="rgba(198, 222, 247, 0.58)"
                    style={styles.input}
                    value={login}
                  />
                </View>

                <Text style={[styles.label, styles.passwordLabel]}>Пароль</Text>
                <View style={styles.inputBox}>
                  <Ionicons color="#c6def7" name="lock-closed-outline" size={22} />
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSubmitting}
                    onChangeText={setPassword}
                    placeholder="Введите пароль"
                    placeholderTextColor="rgba(198, 222, 247, 0.58)"
                    secureTextEntry={!passwordVisible}
                    style={styles.input}
                    value={password}
                  />
                  <Pressable
                    accessibilityLabel={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                    accessibilityRole="button"
                    hitSlop={12}
                    onPress={() => setPasswordVisible((value) => !value)}
                  >
                    <Ionicons color="#c6def7" name={passwordVisible ? "eye-off-outline" : "eye-outline"} size={24} />
                  </Pressable>
                </View>

                <View style={styles.rowBetween}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: rememberMe }}
                    disabled={isSubmitting}
                    onPress={() => setRememberMe((value) => !value)}
                    style={styles.rememberRow}
                  >
                    <View style={[styles.checkbox, rememberMe ? styles.checkboxActive : null]}>
                      {rememberMe ? <Ionicons color="#ffffff" name="checkmark" size={16} /> : null}
                    </View>
                    <Text style={styles.rememberText}>Запомнить меня</Text>
                  </Pressable>

                  <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={showPasswordRecovery}>
                    <Text style={styles.link}>Забыли пароль?</Text>
                  </Pressable>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting || login.trim().length === 0 || password.length === 0}
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    styles.loginButton,
                    pressed ? styles.loginButtonPressed : null,
                    isSubmitting || login.trim().length === 0 || password.length === 0 ? styles.loginButtonDisabled : null
                  ]}
                >
                  {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.loginButtonText}>Войти</Text>}
                </Pressable>

                <View style={styles.quickLoginWrap}>
                  <View style={styles.line} />
                  <Text style={styles.quickLoginText}>или быстро войти</Text>
                  <View style={styles.line} />
                </View>

                <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={handleBiometricLogin} style={styles.fingerprintButton}>
                  <Ionicons color="#16a8ff" name="finger-print-outline" size={34} />
                </Pressable>
                <Text style={styles.fingerprintText}>По отпечатку</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={() => router.push("/(auth)/server-settings")}
                style={styles.serverQuickLink}
              >
                <Text style={styles.serverQuickLinkText}>
                  {serverBaseUrl ? `Сервер: ${serverBaseUrl}` : "Настроить адрес сервера"}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={handleUseLocalServer}
                style={({ pressed }) => [
                  styles.localServerButton,
                  pressed && !isSubmitting ? styles.localServerButtonPressed : null,
                  isSubmitting ? styles.disabled : null
                ]}
              >
                <Text style={styles.localServerButtonText}>Подключить локальный сервер</Text>
                <Text style={styles.localServerButtonUrl}>{localLanServerBaseUrl}</Text>
              </Pressable>

              {serverStatus ? <Text style={styles.serverStatusText}>{serverStatus}</Text> : null}

              <View style={styles.secondaryCard}>
                <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={showOtherDeviceLogin} style={styles.secondaryRow}>
                  <Ionicons color="#16a8ff" name="phone-portrait-outline" size={22} />
                  <Text style={styles.secondaryText}>Вход с другого устройства</Text>
                  <Ionicons color="#d6e9ff" name="chevron-forward-outline" size={22} />
                </Pressable>

                <View style={styles.divider} />

                <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={showPasswordRecovery} style={styles.secondaryRow}>
                  <Ionicons color="#16a8ff" name="refresh-outline" size={23} />
                  <Text style={styles.secondaryText}>Восстановление</Text>
                  <Ionicons color="#d6e9ff" name="chevron-forward-outline" size={22} />
                </Pressable>
              </View>

              <Text style={styles.footer}>Поддержка сотрудников • Atom Minerals</Text>
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
    backgroundColor: "rgba(2, 18, 38, 0.28)",
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
  logoText: {
    color: "#ffffff",
    fontSize: 44,
    fontWeight: "900",
    lineHeight: 48,
    textAlign: "center"
  },
  logoSubText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    marginTop: -2,
    textAlign: "center"
  },
  title: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 26,
    marginTop: 18,
    textAlign: "center"
  },
  subtitle: {
    color: "#a9c5e7",
    fontSize: 15,
    lineHeight: 20,
    marginTop: 5,
    textAlign: "center"
  },
  card: {
    backgroundColor: "rgba(5, 31, 58, 0.78)",
    borderColor: "rgba(122, 177, 232, 0.36)",
    borderRadius: 18,
    borderWidth: 1,
    elevation: 12,
    padding: 16,
    shadowColor: "#000000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 16
  },
  label: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8
  },
  passwordLabel: {
    marginTop: 14
  },
  inputBox: {
    alignItems: "center",
    borderColor: "rgba(190, 221, 250, 0.48)",
    borderRadius: 13,
    borderWidth: 1.2,
    flexDirection: "row",
    gap: 10,
    height: 48,
    paddingHorizontal: 13
  },
  input: {
    color: "#ffffff",
    flex: 1,
    fontSize: 16,
    height: "100%"
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14
  },
  rememberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  checkbox: {
    alignItems: "center",
    borderColor: "#16a8ff",
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    width: 22
  },
  checkboxActive: {
    backgroundColor: "#16a8ff"
  },
  rememberText: {
    color: "#ffffff",
    fontSize: 14
  },
  link: {
    color: "#18aaff",
    fontSize: 14
  },
  error: {
    color: "#fecaca",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10
  },
  loginButton: {
    alignItems: "center",
    backgroundColor: "#129fff",
    borderRadius: 13,
    height: 52,
    justifyContent: "center",
    marginTop: 18
  },
  loginButtonPressed: {
    backgroundColor: "#007ee8"
  },
  loginButtonDisabled: {
    opacity: 0.68
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800"
  },
  quickLoginWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 18
  },
  line: {
    backgroundColor: "rgba(191, 216, 245, 0.28)",
    flex: 1,
    height: 1
  },
  quickLoginText: {
    color: "#9db7d7",
    fontSize: 13
  },
  fingerprintButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(19, 157, 255, 0.08)",
    borderColor: "rgba(19, 157, 255, 0.35)",
    borderRadius: 27,
    borderWidth: 1.5,
    height: 54,
    justifyContent: "center",
    marginTop: 10,
    width: 54
  },
  fingerprintText: {
    color: "#c7dbf4",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center"
  },
  serverQuickLink: {
    marginTop: 8,
    paddingVertical: 4
  },
  serverQuickLinkText: {
    color: "#9db7d7",
    fontSize: 11,
    lineHeight: 15,
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
    fontSize: 13,
    fontWeight: "800"
  },
  localServerButtonUrl: {
    color: "#9db7d7",
    fontSize: 11,
    marginTop: 2
  },
  serverStatusText: {
    color: "#c7dbf4",
    fontSize: 11,
    lineHeight: 15,
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
    minHeight: 46
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
    fontSize: 11,
    marginTop: 12,
    textAlign: "center"
  },
  disabled: {
    opacity: 0.6
  }
});

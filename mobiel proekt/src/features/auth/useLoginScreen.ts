import { resolvePatrolStartPath } from '@/services/patrolNavigationService';
import * as LocalAuthentication from "expo-local-authentication";
import { forgetRememberedCredentials, prepareRememberedCredentialsSave, readRememberedCredentials } from "@/auth/rememberedCredentials";
import { hasDeviceLock, savedPasswordUnlockMessages, unlockSavedPassword } from "@/auth/savedPasswordUnlock";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import { restoreSessionWithRefreshToken, signIn } from "@/auth/authService";
import { isOfflineSessionValid } from "@/auth/offlineSession";
import { currentContourId } from "@/core/environments";
import { consumePendingSessionRoute, markSessionUnlocked } from "@/auth/sessionGateState";
import { getOfflineSession, getRefreshToken, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getServerBaseUrl } from "@/core/serverSettings";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";

/** Login screen state: credentials, remember choice, saved access and submit. */
export function useLoginScreen() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [rememberError, setRememberError] = useState<string | null>(null);
  const credentialsEdited = useRef(false);
  const rememberEdited = useRef(false);
  const rememberChoice = useRef(false);
  // Only the login a password was saved for is kept here. The password itself
  // stays in SecureStore and is read only after the device lock confirms the
  // phone owner, and it never enters the revealable field.
  const savedPasswordLogin = useRef<string | null>(null);
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [deviceLockAvailable, setDeviceLockAvailable] = useState<boolean | null>(null);
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
          savedPasswordLogin.current = saved.login;
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
    void hasDeviceLock().then((available) => {
      if (isMounted) setDeviceLockAvailable(available);
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
    savedPasswordLogin.current = null;
    setHasSavedPassword(false);
  }

  function changeLogin(value: string) {
    credentialsEdited.current = true;
    discardSavedPassword();
    setLogin(value);
  }

  function changePassword(value: string) {
    credentialsEdited.current = true;
    if (value) discardSavedPassword();
    setPassword(value);
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

  /** Releases the saved password for this login after device authentication, or explains why not. */
  async function releaseSavedPassword(normalizedLogin: string): Promise<string | null> {
    const unlock = await unlockSavedPassword();
    if (unlock !== "unlocked") {
      if (unlock === "no-device-lock" && mounted.current) setDeviceLockAvailable(false);
      throw new Error(savedPasswordUnlockMessages[unlock]);
    }
    let saved;
    try { saved = await readRememberedCredentials(); }
    catch { throw new Error("Не удалось прочитать сохранённый вход. Введите пароль вручную."); }
    return saved.remember && saved.password && saved.login.trim() === normalizedLogin ? saved.password : null;
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

    const savedLogin = savedPasswordLogin.current;
    const useSavedPassword = !password && savedLogin !== null && savedLogin.trim() === normalizedLogin;
    if (!password && !useSavedPassword) {
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
      let effectivePassword = password;
      if (useSavedPassword) {
        const released = await releaseSavedPassword(normalizedLogin);
        if (!released) {
          if (mounted.current) discardSavedPassword();
          throw new Error("Введите пароль.");
        }
        effectivePassword = released;
      }
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

  return {
    login,
    password,
    rememberMe,
    rememberError,
    hasSavedPassword,
    deviceLockAvailable,
    isSubmitting,
    error,
    serverBaseUrl,
    biometricAvailable,
    offlineSessionName,
    changeLogin,
    changePassword,
    toggleRememberChoice,
    handleSubmit,
    handleBiometricLogin,
    showPasswordRecovery,
    showOtherDeviceLogin,
    openOfflineLogin: () => router.push("/(auth)/offline-login"),
    openServerSettings: () => router.push("/(auth)/server-settings")
  };
}

export type LoginScreenState = ReturnType<typeof useLoginScreen>;

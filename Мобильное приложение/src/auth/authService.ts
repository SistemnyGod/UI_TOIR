import { Platform } from "react-native";

import { login, logout } from "@/api/authApi";
import { refreshStoredAccessToken } from "@/api/httpClient";
import { getBootstrap } from "@/api/mobileApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { clearTokens, getStoredOwnerUserId, setStoredOwnerUserId, setTokens } from "@/auth/tokenStorage";
import { clearLocalUserData, hasLocalUserData, saveBootstrap } from "@/db/repositories/bootstrapRepository";
import { registerPushNotifications, syncMobileNotifications } from "@/services/notificationService";
import { syncWorkTasks } from "@/services/workTaskService";

const defaultDeviceName = "Kenshi Armor C1s";
const appVersion = "0.1.0";

export async function signIn(loginName: string, password: string) {
  const deviceId = await getOrCreateDeviceId();
  const previousOwnerUserId = await getStoredOwnerUserId();
  const result = await login({
    login: loginName,
    password,
    deviceId,
    deviceName: defaultDeviceName,
    platform: Platform.OS,
    appVersion
  });

  const bootstrap = await getBootstrap(result.accessToken);

  const shouldClearLocalData =
    previousOwnerUserId
      ? previousOwnerUserId !== result.user.serverUserId
      : await hasLocalUserData();

  if (shouldClearLocalData) {
    await clearTokens();
    await clearLocalUserData();
  }

  await saveBootstrap(bootstrap);

  await setTokens(result.accessToken, result.refreshToken);
  await setStoredOwnerUserId(result.user.serverUserId);

  await syncWorkTasks().catch(() => []);
  await registerPushNotifications().catch(() => null);
  await syncMobileNotifications().catch(() => []);

  return result;
}

export async function restoreSessionWithRefreshToken() {
  const previousOwnerUserId = await getStoredOwnerUserId();
  const accessToken = await refreshStoredAccessToken();
  const bootstrap = await getBootstrap(accessToken);
  const shouldClearLocalData =
    previousOwnerUserId
      ? previousOwnerUserId !== bootstrap.user.serverUserId
      : await hasLocalUserData();

  if (shouldClearLocalData) {
    await clearLocalUserData();
  }

  await saveBootstrap(bootstrap);
  await setStoredOwnerUserId(bootstrap.user.serverUserId);

  await syncWorkTasks().catch(() => []);
  await registerPushNotifications().catch(() => null);
  await syncMobileNotifications().catch(() => []);

  return bootstrap;
}

export async function signOut() {
  await logout().catch(() => undefined);
  await clearTokens();
  await clearLocalUserData();
}

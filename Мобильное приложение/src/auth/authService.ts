import { Platform } from "react-native";

import { login, logout } from "@/api/authApi";
import { refreshStoredAccessToken } from "@/api/httpClient";
import { getBootstrap } from "@/api/mobileApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { clearTokens, getStoredOwnerUserId, setStoredOwnerUserId, setTokens } from "@/auth/tokenStorage";
import {
  clearLocalUserData,
  countBlockingLocalUserData,
  hasLocalUserData,
  replaceLocalUserDataWithBootstrap,
  saveBootstrap
} from "@/db/repositories/bootstrapRepository";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
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

  const shouldClearLocalData = previousOwnerUserId
    ? previousOwnerUserId !== result.user.serverUserId
    : await hasLocalUserData();

  if (shouldClearLocalData) {
    await assertNoPendingLocalChanges("Нельзя сменить пользователя: на телефоне есть неотправленные отчеты или действия. Сначала выполните синхронизацию.");
    await replaceLocalUserDataWithBootstrap(bootstrap);
  } else {
    await saveBootstrap(bootstrap);
  }

  await setTokens(result.accessToken, result.refreshToken);
  await setStoredOwnerUserId(result.user.serverUserId);

  await syncWorkTasks().catch(() => []);
  await registerPushNotifications().catch(() => null);
  await syncMobileNotifications().catch(() => []);

  void logMobileAction({
    eventType: "auth.signIn",
    entityType: "mobileAccount",
    entityId: result.user.serverUserId,
    message: "Вход выполнен, данные смены загружены.",
    payload: {
      requestCount: bootstrap.requestBoard.length,
      assignmentCount: bootstrap.assignments.length
    }
  }).catch(() => undefined);

  return result;
}

export async function restoreSessionWithRefreshToken() {
  const previousOwnerUserId = await getStoredOwnerUserId();
  const accessToken = await refreshStoredAccessToken();
  const bootstrap = await getBootstrap(accessToken);
  const shouldClearLocalData = previousOwnerUserId
    ? previousOwnerUserId !== bootstrap.user.serverUserId
    : await hasLocalUserData();

  if (shouldClearLocalData) {
    await assertNoPendingLocalChanges("Нельзя восстановить другую сессию: на телефоне есть неотправленные отчеты или действия.");
    await replaceLocalUserDataWithBootstrap(bootstrap);
  } else {
    await saveBootstrap(bootstrap);
  }
  await setStoredOwnerUserId(bootstrap.user.serverUserId);

  await syncWorkTasks().catch(() => []);
  await registerPushNotifications().catch(() => null);
  await syncMobileNotifications().catch(() => []);

  void logMobileAction({
    eventType: "auth.restore",
    entityType: "mobileAccount",
    entityId: bootstrap.user.serverUserId,
    message: "Сессия восстановлена через refresh-token."
  }).catch(() => undefined);

  return bootstrap;
}

export async function signOut() {
  await assertNoPendingLocalChanges("Нельзя выйти из аккаунта: на телефоне есть неотправленные отчеты или действия. Сначала выполните синхронизацию.");
  await logout().catch(() => undefined);
  await clearTokens();
  await clearLocalUserData();
}

async function assertNoPendingLocalChanges(message: string) {
  const pendingCount = await countBlockingLocalUserData();
  if (pendingCount > 0) {
    throw new Error(`${message} Локальных незавершенных записей: ${pendingCount}.`);
  }
}

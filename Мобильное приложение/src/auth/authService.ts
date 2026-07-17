import Constants from "expo-constants";
import { Platform } from "react-native";

import { login, logout } from "@/api/authApi";
import { refreshStoredAccessToken } from "@/api/httpClient";
import { getBootstrap } from "@/api/mobileApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import {
  clearTokens,
  getStoredOwnerUserId,
  getStoredSessionSnapshot,
  restoreStoredSessionSnapshot,
  setOfflineSession,
  setStoredOwnerUserId,
  setTokens
} from "@/auth/tokenStorage";
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
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";

const defaultDeviceName = "Kenshi Armor C1s";
const appVersion = Constants.expoConfig?.version ?? "unknown";

export async function signIn(loginName: string, password: string) {
  const deviceId = await getOrCreateDeviceId();
  const previousSession = await getStoredSessionSnapshot();
  const previousOwnerUserId = previousSession.ownerUserId;
  const result = await login({
    login: loginName,
    password,
    deviceId,
    deviceName: defaultDeviceName,
    platform: Platform.OS,
    appVersion
  });

  let bootstrap: Awaited<ReturnType<typeof getBootstrap>>;
  try {
    bootstrap = await getBootstrap(result.accessToken);

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
    await setOfflineSession({
      userId: result.user.serverUserId,
      fullName: result.user.fullName,
      lastOnlineLoginAt: new Date().toISOString(),
      expiresAt: result.refreshExpiresAt
    });
  } catch (error) {
    await logout(result.accessToken).catch(() => undefined);
    await restoreStoredSessionSnapshot(previousSession);
    throw error;
  }

  await syncWorkTasks().catch(() => []);
  await registerPushNotifications().catch(() => null);
  await syncMobileNotifications().catch(() => []);
  // Resume reports and patrol actions that were safely retained while the
  // session was expired.  This is intentionally non-blocking for login UI.
  void triggerForegroundSyncWithRetry({ forceRetry: true });

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
  void triggerForegroundSyncWithRetry({ forceRetry: true });

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
    throw new Error(`${message} Локальных незавершённых записей: ${pendingCount}.`);
  }
}

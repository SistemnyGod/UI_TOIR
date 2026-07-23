import Constants from "expo-constants";
import { Platform } from "react-native";

import { login, logout } from "@/api/authApi";
import { isReauthenticationRequiredError } from "@/auth/sessionErrors";
import { refreshStoredAccessToken } from "@/api/httpClient";
import { getBootstrap } from "@/api/mobileApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { getDeviceDisplayName } from "@/auth/deviceInfo";
import {
  clearLocalSessionKeepingRefreshToken,
  clearTokens,
  getAccessToken,
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
  hasUnscopedLocalData,
  replaceLocalUserDataWithBootstrap,
  saveBootstrap
} from "@/db/repositories/bootstrapRepository";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { completePendingLogoutIntents, enqueueLogoutIntent, getPendingLogoutContourId } from "@/db/repositories/logoutQueueRepository";
import { registerPushNotifications, syncMobileNotifications } from "@/services/notificationService";
import { syncWorkItems } from "@/services/workTaskService";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { currentContourId } from "@/core/environments";

const appVersion = Constants.expoConfig?.version ?? "unknown";

export async function flushPendingLogout() {
  const pendingContourId = await getPendingLogoutContourId();
  if (pendingContourId === undefined) {
    return true;
  }
  if (pendingContourId !== currentContourId) {
    return false;
  }

  try {
    await revokeServerSession();
    await completePendingLogoutIntents();
    await clearTokens();
    return true;
  } catch (error) {
    if (error instanceof Error && isReauthenticationRequiredError(error.message)) {
      await completePendingLogoutIntents();
      await clearTokens();
      return true;
    }

    return false;
  }
}

async function revokeServerSession() {
  const accessToken = await getAccessToken();
  try {
    await logout(accessToken ?? await refreshStoredAccessToken());
  } catch {
    await logout(await refreshStoredAccessToken());
  }
}

export async function signIn(loginName: string, password: string) {
  if (!(await flushPendingLogout())) {
    throw new Error("Предыдущая сессия ожидает отзыва. Подключите сервер и повторите вход.");
  }
  const deviceId = await getOrCreateDeviceId();
  const previousSession = await getStoredSessionSnapshot();
  const previousOwnerUserId = previousSession.ownerUserId;
  const previousContourId = previousSession.offlineSession?.contourId;
  const contourMismatch = Boolean(previousOwnerUserId && previousContourId !== currentContourId);
  const result = await login({
    login: loginName,
    password,
    deviceId,
    deviceName: getDeviceDisplayName(),
    platform: Platform.OS,
    appVersion
  });

  if (result.contourId !== currentContourId) {
    throw new Error(`Сервер вернул сессию другого контура (${result.contourId}). Вход остановлен.`);
  }

  let bootstrap: Awaited<ReturnType<typeof getBootstrap>>;
  try {
    bootstrap = await getBootstrap(result.accessToken);
    if (bootstrap.contourId !== currentContourId) {
      throw new Error(`Bootstrap относится к другому контуру (${bootstrap.contourId}). Локальные данные не изменены.`);
    }

    const shouldClearLocalData = contourMismatch || await hasUnscopedLocalData() || (previousOwnerUserId
      ? previousOwnerUserId !== result.user.serverUserId
      : await hasLocalUserData());

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
      contourId: currentContourId,
      fullName: result.user.fullName,
      lastOnlineLoginAt: new Date().toISOString(),
      expiresAt: result.refreshExpiresAt
    });
  } catch (error) {
    await logout(result.accessToken).catch(() => undefined);
    await restoreStoredSessionSnapshot(previousSession);
    throw error;
  }

  await syncWorkItems().catch(() => []);
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
  const previousSession = await getStoredSessionSnapshot();
  const previousOwnerUserId = await getStoredOwnerUserId();
  const contourMismatch = Boolean(previousSession.ownerUserId && previousSession.offlineSession?.contourId !== currentContourId);
  const accessToken = await refreshStoredAccessToken();
  const bootstrap = await getBootstrap(accessToken);
  if (bootstrap.contourId !== currentContourId) {
    throw new Error(`Bootstrap относится к другому контуру (${bootstrap.contourId}). Локальные данные не изменены.`);
  }
  const shouldClearLocalData = contourMismatch || await hasUnscopedLocalData() || (previousOwnerUserId
    ? previousOwnerUserId !== bootstrap.user.serverUserId
    : await hasLocalUserData());

  if (shouldClearLocalData) {
    await assertNoPendingLocalChanges("Нельзя восстановить другую сессию: на телефоне есть неотправленные отчеты или действия.");
    await replaceLocalUserDataWithBootstrap(bootstrap);
  } else {
    await saveBootstrap(bootstrap);
  }
  await setStoredOwnerUserId(bootstrap.user.serverUserId);

  await syncWorkItems().catch(() => []);
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
  const ownerUserId = await getStoredOwnerUserId();
  await enqueueLogoutIntent(ownerUserId);

  let serverRevoked = false;
  try {
    await revokeServerSession();
    serverRevoked = true;
  } catch (error) {
    if (error instanceof Error && isReauthenticationRequiredError(error.message)) {
      serverRevoked = true;
    }
  }

  if (serverRevoked) {
    await completePendingLogoutIntents();
    await clearTokens();
  } else {
    // Remove the active session locally, but retain the refresh token in
    // SecureStore so the queued server-side revoke can be completed later.
    await clearLocalSessionKeepingRefreshToken();
  }

  await clearLocalUserData();
  return serverRevoked;
}

async function assertNoPendingLocalChanges(message: string) {
  const pendingCount = await countBlockingLocalUserData();
  if (pendingCount > 0) {
    throw new Error(`${message} Локальных незавершённых записей: ${pendingCount}.`);
  }
}

import { login, logout } from "@/api/authApi";
import { isReauthenticationRequiredError } from "@/auth/sessionErrors";
import { beginAuthTransition, refreshStoredAccessToken } from "@/api/httpClient";
import { getBootstrap } from "@/api/mobileApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { createLoginPayload, getAppRuntimeMetadata } from "@/auth/appMetadata";
import {
  clearLocalSessionKeepingRefreshToken,
  clearTokens,
  getAccessToken,
  getStoredOwnerUserId,
  getStoredSessionSnapshot,
  restoreStoredSessionSnapshot,
  storeSessionEnvelope,
} from "@/auth/tokenStorage";
import {
  clearLocalUserData,
  cleanupPreviousUserPhotos,
  completePendingAuthTransition,
  countBlockingLocalUserData,
  hasLocalUserData,
  hasUnscopedLocalData,
  getPendingAuthTransition,
  replaceLocalUserDataWithBootstrap,
  saveBootstrap
} from "@/db/repositories/bootstrapRepository";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { completePendingLogoutIntents, enqueueLogoutIntent, getPendingLogoutContourId } from "@/db/repositories/logoutQueueRepository";
import { registerPushNotifications, syncMobileNotifications } from "@/services/notificationService";
import { syncWorkItems } from "@/services/workTaskService";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { cancelNextOutboxRetry, scheduleNextOutboxRetry } from "@/sync/outboxRetryScheduler";
import { currentContourId } from "@/core/environments";

export async function flushPendingLogout() {
  const pendingContourId = await getPendingLogoutContourId();
  if (pendingContourId === undefined) {
    return true;
  }
  if (pendingContourId !== currentContourId) {
    return false;
  }

  const ownerUserId = await getStoredOwnerUserId();
  cancelNextOutboxRetry();

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

    void scheduleNextOutboxRetry(ownerUserId);
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
  beginAuthTransition();
  if (!(await flushPendingLogout())) {
    throw new Error("Предыдущая сессия ожидает отзыва. Подключите сервер и повторите вход.");
  }
  const deviceId = await getOrCreateDeviceId();
  const previousSession = await getStoredSessionSnapshot();
  const previousOwnerUserId = previousSession.ownerUserId;
  const previousContourId = previousSession.offlineSession?.contourId;
  const contourMismatch = Boolean(previousOwnerUserId && previousContourId !== currentContourId);
  const result = await login(createLoginPayload({
    login: loginName,
    password,
    deviceId
  }, getAppRuntimeMetadata()));

  if (result.contourId !== currentContourId) {
    throw new Error(`Сервер вернул сессию другого контура (${result.contourId}). Вход остановлен.`);
  }

  const pendingTransition = await getPendingAuthTransition();
  if (pendingTransition && pendingTransition.targetOwnerUserId !== result.user.serverUserId) {
    await logout(result.accessToken).catch(() => undefined);
    throw new Error("На телефоне не завершён переход к другому аккаунту. Войдите в целевой аккаунт для восстановления.");
  }

  let bootstrap: Awaited<ReturnType<typeof getBootstrap>>;
  let replacementCommitted = Boolean(pendingTransition);
  let sessionPublished = false;
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
      replacementCommitted = true;
    } else {
      await saveBootstrap(bootstrap);
    }

    await storeSessionEnvelope({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessExpiresAt: result.expiresAt,
      refreshExpiresAt: result.refreshExpiresAt,
      ownerUserId: result.user.serverUserId,
      refreshOperationId: null,
      offlineSession: {
        userId: result.user.serverUserId,
        contourId: currentContourId,
        fullName: result.user.fullName,
        lastOnlineLoginAt: new Date().toISOString(),
        expiresAt: result.refreshExpiresAt,
        offlineExpiresAt: result.refreshExpiresAt,
        deviceTrusted: result.device.trusted,
        userBlockedAt: (result.user as typeof result.user & { blockedAt?: string | null }).blockedAt ?? null,
        deviceBlockedAt: result.device.blockedAt
      }
    });
    sessionPublished = true;
    if (replacementCommitted) await completePendingAuthTransition(result.user.serverUserId);
  } catch (error) {
    if (!sessionPublished) await logout(result.accessToken).catch(() => undefined);
    if (!replacementCommitted) await restoreStoredSessionSnapshot(previousSession);
    if (!replacementCommitted) void scheduleNextOutboxRetry(previousOwnerUserId);
    throw error;
  }

  if (replacementCommitted) {
    await cleanupPreviousUserPhotos().catch(() => undefined);
  }

  await syncWorkItems().catch(() => []);
  await registerPushNotifications().catch(() => null);
  await syncMobileNotifications().catch(() => []);
  // Resume reports and patrol actions that were safely retained while the
  // session was expired.  This is intentionally non-blocking for login UI.
  void triggerForegroundSyncWithRetry({ mode: "normal" });

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
  const pendingTransition = await getPendingAuthTransition();
  if (pendingTransition && pendingTransition.targetOwnerUserId !== bootstrap.user.serverUserId) {
    throw new Error("Незавершённый переход принадлежит другому аккаунту. Требуется целевой вход с паролем.");
  }
  const shouldClearLocalData = contourMismatch || await hasUnscopedLocalData() || (previousOwnerUserId
    ? previousOwnerUserId !== bootstrap.user.serverUserId
    : await hasLocalUserData());

  let replacementCommitted = Boolean(pendingTransition);
  if (shouldClearLocalData) {
    await assertNoPendingLocalChanges("Нельзя восстановить другую сессию: на телефоне есть неотправленные отчеты или действия.");
    await replaceLocalUserDataWithBootstrap(bootstrap);
    replacementCommitted = true;
  } else {
    await saveBootstrap(bootstrap);
  }
  const refreshedSession = await getStoredSessionSnapshot();
  const previousOfflineSession = refreshedSession.offlineSession;
  if (!refreshedSession.refreshToken || !previousOfflineSession?.expiresAt || !previousOfflineSession.offlineExpiresAt) {
    throw new Error("Сессия восстановления неполна. Выполните целевой вход с паролем.");
  }
  await storeSessionEnvelope({
    ...refreshedSession,
    ownerUserId: bootstrap.user.serverUserId,
    offlineSession: {
      ...previousOfflineSession,
      userId: bootstrap.user.serverUserId,
      contourId: currentContourId,
      fullName: bootstrap.user.fullName
    }
  });
  if (replacementCommitted) {
    await completePendingAuthTransition(bootstrap.user.serverUserId);
    await cleanupPreviousUserPhotos().catch(() => undefined);
  }

  await syncWorkItems().catch(() => []);
  await registerPushNotifications().catch(() => null);
  await syncMobileNotifications().catch(() => []);
  void triggerForegroundSyncWithRetry({ mode: "normal" });

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
  beginAuthTransition();
  cancelNextOutboxRetry();
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

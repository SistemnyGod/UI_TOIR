import {
  classifyMobileNetworkError,
  fetchWithTimeout,
  MobileNetworkError
} from "@/api/networkTimeout";
import { shouldTryNextMobileServer } from "@/api/serverFailoverPolicy";
import { refreshResponseSchema } from "@/api/schemas";
import { invalidateServerHealthCache, probeServerHealthCached } from "@/api/serverHealthApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { assertSessionOwner } from "@/auth/sessionIdentity";
import { isMobileSessionKeyUnavailableError } from "@/auth/sessionErrors";
import {
  getAccessToken,
  getAccessTokenExpiresAt,
  getRefreshToken,
  getOrCreateRefreshOperationId,
  clearRefreshOperationId,
  clearVolatileTokens,
  getStoredOwnerUserId,
  preserveOfflineSessionAfterRefreshFailure,
  revokeStoredSession,
  setOfflineSession,
  setStoredOwnerUserId,
  setTokens
} from "@/auth/tokenStorage";
import { hasUsableNetwork } from "@/core/network";
import { getMobileRuntimeConfig, getServerCandidateBaseUrls } from "@/core/serverSettings";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { logMobileError } from "@/services/mobileErrorReporter";
import { MobileApiProtocolError, parseMobileResponse } from "@/api/protocolValidation";
import { shouldRefreshAccessToken } from "@/auth/tokenExpiryPolicy";
import type { ZodType } from "zod";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  accessToken?: string | null;
  skipAuthRefresh?: boolean;
};

let refreshPromise: Promise<string> | null = null;

let authEpoch = 0;

export function beginAuthTransition() {
  authEpoch += 1;
}

class StaleAuthResponseError extends Error {
  constructor() {
    super("Stale authentication response ignored.");
    this.name = "StaleAuthResponseError";
  }
}

export async function mobileRequest<TResponse>(
  path: string,
  schema: ZodType<TResponse>,
  options: RequestOptions = {}
) {
  const token = options.accessToken === undefined ? await getAccessToken() : options.accessToken;
  const runtimeConfig = await getMobileRuntimeConfig();
  let { apiBaseUrl, response } = await sendMobileRequestWithFailover(runtimeConfig.apiBaseUrl, path, options, token);

  let refreshedSession = false;
  // A queued report may reach this point after the access token was cleared
  // locally while the refresh token is still valid. Login/refresh/logout opt
  // out explicitly, so a normal API request should always try recovery.
  if (response.status === 401 && !options.skipAuthRefresh) {
    const latestStoredToken = options.accessToken === undefined ? await getAccessToken() : null;
    if (latestStoredToken && latestStoredToken !== token) {
      ({ response } = await sendMobileRequestWithFailover(apiBaseUrl, path, options, latestStoredToken));
    }

    if (response.status === 401) {
      const refreshedToken = await refreshAccessToken(apiBaseUrl);
      refreshedSession = true;
      ({ response } = await sendMobileRequestWithFailover(apiBaseUrl, path, options, refreshedToken));
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      if (path.endsWith("/auth/login")) {
        const failureCode = await readAuthFailureCode(response);
        throw new Error(loginFailureMessage(failureCode, apiBaseUrl));
      }

      if (refreshedSession) {
        throw new Error(
          `Сервер временно не принял обновлённую сессию. Очередь отправки сохранена и будет повторена. Адрес: ${apiBaseUrl}`
        );
      }

      throw new Error(
        `Мобильная сессия временно недоступна. Локальные отчёты и очередь отправки сохранены; повтор будет выполнен автоматически. Адрес: ${apiBaseUrl}`
      );
    }

    const message = await readErrorMessage(response);
    throw new Error(message ?? `Ошибка mobile API: ${response.status}`);
  }

  if (response.status === 204) {
    return parseMobileResponse(schema, undefined);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MobileApiProtocolError("Ответ сервера не является корректным JSON mobile API. Локальные данные сохранены.");
  }

  return parseMobileResponse(schema, payload);
}

async function sendMobileRequestWithFailover(
  preferredApiBaseUrl: string,
  path: string,
  options: RequestOptions,
  token: string | null
) {
  const apiBaseUrls = await getServerCandidateBaseUrls(preferredApiBaseUrl);
  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (const apiBaseUrl of apiBaseUrls) {
    try {
      const health = await probeServerHealthCached(apiBaseUrl);
      if (!health.ok) {
        lastError = health.errorKind
          ? new MobileNetworkError(
            health.errorKind,
            undefined,
            health.message ?? `Сервер не прошёл проверку контура: ${apiBaseUrl}`
          )
          : new Error(health.message ?? `Сервер не прошёл проверку контура: ${apiBaseUrl}`);
        continue;
      }

      const response = await sendMobileRequest(apiBaseUrl, path, options, token);
      if (shouldTryNextServer(response, path) && apiBaseUrl !== apiBaseUrls[apiBaseUrls.length - 1]) {
        lastResponse = response;
        continue;
      }

      return { apiBaseUrl, response };
    } catch (error) {
      invalidateServerHealthCache(apiBaseUrl);
      lastError = error;
    }
  }

  if (lastResponse) {
    return { apiBaseUrl: apiBaseUrls[apiBaseUrls.length - 1], response: lastResponse };
  }

  if (lastError instanceof Error) {
    throw await appendRequestFailureContext(lastError, `Проверенные адреса: ${apiBaseUrls.join(", ")}`);
  }

  throw await appendRequestFailureContext(
    new MobileNetworkError("network", lastError),
    `Проверенные адреса: ${apiBaseUrls.join(", ")}`
  );
}

function shouldTryNextServer(response: Response, path: string) {
  if (path.startsWith("/api/v1/mobile/")) {
    return shouldTryNextMobileServer(response.status, response.headers.get("content-type"));
  }

  return false;
}

async function sendMobileRequest(apiBaseUrl: string, path: string, options: RequestOptions, token: string | null) {
  const runtimeConfig = await getMobileRuntimeConfig();

  try {
    return await fetchWithTimeout(`${apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Patrol360-Client": "mobile-app",
        "X-Mobile-Sync-Protocol": runtimeConfig.syncProtocolVersion,
        "X-Patrol360-Contour": runtimeConfig.contourId,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    throw await appendRequestFailureContext(error, `Адрес: ${apiBaseUrl}`);
  }
}

async function refreshAccessToken(apiBaseUrl: string) {
  const requestEpoch = authEpoch;
  refreshPromise ??= refreshAccessTokenInternal(apiBaseUrl, requestEpoch)
    .then((accessToken) => {
      void logMobileAction({
        eventType: "auth.refresh.recovered",
        entityType: "mobileSession",
        message: "Мобильная сессия успешно восстановлена."
      }).catch(() => undefined);
      return accessToken;
    })
    .catch((error) => {
      if (error instanceof StaleAuthResponseError) {
        throw error;
      }
      if (error instanceof Error && isMobileSessionKeyUnavailableError(error.message)) {
        void logMobileAction({
          eventType: "auth.refresh.skipped",
          entityType: "mobileSession",
          message: "\u0410\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435 \u0441\u0435\u0441\u0441\u0438\u0438 \u043e\u0436\u0438\u0434\u0430\u0435\u0442 \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e\u0433\u043e \u0432\u0445\u043e\u0434\u0430. \u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b."
        }).catch(() => undefined);
      } else {
        void logMobileError("auth.refresh.failed", error);
      }
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function refreshAccessTokenInternal(apiBaseUrl: string, requestEpoch: number) {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new Error("Ключ мобильной сессии недоступен. Локальные отчёты сохранены; автоматическая отправка приостановлена.");
  }

  const runtimeConfig = await getMobileRuntimeConfig();
  const deviceId = await getOrCreateDeviceId();
  const clientOperationId = await getOrCreateRefreshOperationId();
  const apiBaseUrls = await getServerCandidateBaseUrls(apiBaseUrl);
  let response: Response | null = null;
  let lastResponse: Response | null = null;
  let activeApiBaseUrl = apiBaseUrl;
  let lastError: unknown = null;

  for (const candidateApiBaseUrl of apiBaseUrls) {
    try {
      const health = await probeServerHealthCached(candidateApiBaseUrl);
      if (!health.ok) {
        lastError = health.errorKind
          ? new MobileNetworkError(
            health.errorKind,
            undefined,
            health.message ?? `Сервер не прошёл проверку контура: ${candidateApiBaseUrl}`
          )
          : new Error(health.message ?? `Сервер не прошёл проверку контура: ${candidateApiBaseUrl}`);
        continue;
      }

      response = await fetchWithTimeout(`${candidateApiBaseUrl}/api/v1/mobile/auth/refresh`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Patrol360-Client": "mobile-app",
          "X-Patrol360-Contour": runtimeConfig.contourId
        },
        body: JSON.stringify({ deviceId, refreshToken, contourId: runtimeConfig.contourId, clientOperationId })
      });
      if (shouldTryNextMobileServer(response.status, response.headers.get("content-type"))
          && candidateApiBaseUrl !== apiBaseUrls[apiBaseUrls.length - 1]) {
        lastResponse = response;
        response = null;
        continue;
      }

      activeApiBaseUrl = candidateApiBaseUrl;
      break;
    } catch (error) {
      invalidateServerHealthCache(candidateApiBaseUrl);
      lastError = error;
    }
  }

  if (!response && !lastResponse) {
    if (lastError instanceof Error) {
      throw await appendRequestFailureContext(lastError, `Проверенные адреса: ${apiBaseUrls.join(", ")}`);
    }

    throw await appendRequestFailureContext(
    new MobileNetworkError("network", lastError),
    `Проверенные адреса: ${apiBaseUrls.join(", ")}`
  );
  }

  if (!response) {
    response = lastResponse!;
  }

  if (requestEpoch !== authEpoch) {
    throw new StaleAuthResponseError();
  }

  if (response.status === 401) {
    const failureCode = await readAuthFailureCode(response);
    if (failureCode === "device_reenrollment_required"
      || failureCode === "device_session_not_found"
      || failureCode === "device_mismatch"
      || failureCode === "refresh_expired") {
      if (requestEpoch !== authEpoch) {
        throw new StaleAuthResponseError();
      }
      await preserveOfflineSessionAfterRefreshFailure(failureCode);
      await clearRefreshOperationId();
      await clearVolatileTokens();
      throw new Error(recoverableRefreshFailureMessage(failureCode));
    }

    if (failureCode === "session_revoked"
      || failureCode === "device_revoked"
      || failureCode === "account_disabled"
      || failureCode === "refresh_token_reuse") {
      if (requestEpoch !== authEpoch) {
        throw new StaleAuthResponseError();
      }
      await revokeStoredSession(failureCode);
      throw new Error(explicitRevocationMessage(failureCode));
    }

    throw new Error(
      `Обновление мобильной сессии временно отклонено (${failureCode ?? "unknown"}). Локальные отчёты сохранены; повтор будет выполнен автоматически.`
    );
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? `Не удалось обновить сессию: ${response.status}. Адрес: ${activeApiBaseUrl}`);
  }

  let session: ReturnType<typeof refreshResponseSchema.parse>;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MobileApiProtocolError("Ответ refresh сессии не является корректным JSON. Локальные данные сохранены.");
  }
  session = parseMobileResponse(refreshResponseSchema, payload);

  if (session.contourId !== runtimeConfig.contourId) {
    throw new Error(`Сервер вернул сессию другого контура (${session.contourId}). Токены не сохранены.`);
  }

  const expectedOwnerUserId = await getStoredOwnerUserId();
  try {
    assertSessionOwner(expectedOwnerUserId, session.user.serverUserId);
  } catch (error) {
    await revokeStoredSession("session_owner_mismatch");
    throw error;
  }

  if (requestEpoch !== authEpoch) {
    throw new StaleAuthResponseError();
  }

  await setTokens(session.accessToken, session.refreshToken, {
    accessExpiresAt: session.expiresAt,
    refreshExpiresAt: session.refreshExpiresAt
  });
  await setOfflineSession({
    userId: session.user.serverUserId,
    contourId: runtimeConfig.contourId,
    fullName: session.user.fullName,
    lastOnlineLoginAt: new Date().toISOString(),
    expiresAt: session.refreshExpiresAt,
    offlineExpiresAt: session.refreshExpiresAt,
    deviceTrusted: session.device.trusted,
    userBlockedAt: (session.user as typeof session.user & { blockedAt?: string | null }).blockedAt ?? null,
    deviceBlockedAt: session.device.blockedAt
  });
  // Bind legacy installations that have a valid refresh token but predate the
  // stored owner id. This avoids an unnecessary sign-in while reports are queued.
  if (!expectedOwnerUserId) {
    await setStoredOwnerUserId(session.user.serverUserId);
  }

  return session.accessToken;
}

export async function refreshStoredAccessToken() {
  const runtimeConfig = await getMobileRuntimeConfig();
  return refreshAccessToken(runtimeConfig.apiBaseUrl);
}

export async function refreshStoredAccessTokenIfNeeded() {
  const [accessToken, accessExpiresAt, refreshToken] = await Promise.all([
    getAccessToken(),
    getAccessTokenExpiresAt(),
    getRefreshToken()
  ]);

  if (!accessToken) {
    return refreshToken ? refreshStoredAccessToken() : null;
  }

  if (shouldRefreshAccessToken(accessExpiresAt)) {
    return refreshStoredAccessToken();
  }

  return accessToken;
}

async function appendRequestFailureContext(error: unknown, context: string) {
  if (!(error instanceof MobileNetworkError)) {
    return error instanceof Error
      ? new Error(`${error.message} ${context}`)
      : classifyMobileNetworkError(error, { context });
  }

  const networkAvailable = error.kind === "network"
    ? await hasUsableNetwork().catch(() => true)
    : undefined;
  return classifyMobileNetworkError(error, { networkAvailable, context });
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    return null;
  }

  try {
    const body = (await response.json()) as {
      title?: string;
      detail?: string;
      errors?: Record<string, string[]>;
    };
    const firstFieldError = body.errors ? Object.values(body.errors).flat().find(Boolean) : null;
    return firstFieldError ?? body.detail ?? body.title ?? null;
  } catch {
    return null;
  }
}

async function readAuthFailureCode(response: Response) {
  try {
    const body = await response.json() as { code?: unknown };
    return typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}

function loginFailureMessage(code: string | null, apiBaseUrl: string) {
  switch (code) {
    case "device_revoked":
      return "Устройство заблокировано администратором. Обратитесь к ответственному за Patrol360.";
    case "device_enrollment_required":
      return "Для этого аккаунта требуется предварительная привязка устройства.";
    case "device_bound_to_another_account":
      return "Устройство уже привязано к другому аккаунту.";
    case "account_disabled":
      return "Мобильный аккаунт отключён администратором.";
    case "account_not_linked":
      return "Аккаунт не привязан к сотруднику. Обратитесь к администратору.";
    case "wrong_contour":
      return "Аккаунт относится к другому контуру системы.";
    default:
      return `Сервер доступен, но вход отклонён (${code ?? "invalid_credentials"}). Проверьте логин, пароль и привязку аккаунта. Адрес: ${apiBaseUrl}`;
  }
}

function explicitRevocationMessage(code: "session_revoked" | "device_revoked" | "account_disabled" | "refresh_expired" | "refresh_token_reuse" | "device_reenrollment_required" | "device_session_not_found" | "device_mismatch" | "device_enrollment_required" | "device_bound_to_another_account") {
  switch (code) {
    case "session_revoked":
      return "Мобильная сессия явно отозвана. Локальные отчёты сохранены.";
    case "device_revoked":
      return "Это устройство явно отозвано администратором. Локальные отчёты сохранены.";
    case "account_disabled":
      return "Учётная запись заблокирована администратором. Локальные отчёты сохранены.";
    case "device_session_not_found":
      return "Серверная запись сессии недоступна. Локальная работа и очередь сохранены; повторите вход при наличии сети.";
    case "device_mismatch":
      return "Сервер не подтвердил это устройство. Локальная работа и очередь сохранены; проверьте регистрацию при наличии сети.";
    case "device_enrollment_required":
    case "device_bound_to_another_account":
    case "device_reenrollment_required":
    case "refresh_expired":
      return "Онлайн-сессия требует повторной регистрации. Локальная работа и очередь сохранены.";
    case "refresh_token_reuse":
      return "Обнаружено повторное использование refresh-токена. Сессия отозвана, локальные отчёты сохранены.";
  }
}

function recoverableRefreshFailureMessage(
  code: "refresh_expired" | "device_reenrollment_required" | "device_session_not_found" | "device_mismatch"
) {
  return "Сервер временно не восстановил мобильную сессию (" + code + "). Локальная работа и очередь отчётов сохранены; приложение повторит отправку автоматически.";
}

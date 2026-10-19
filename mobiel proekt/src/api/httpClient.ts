import { OperationDeadline } from "@/api/operationDeadline";
import { advanceSessionGeneration, getSessionGeneration } from "@/auth/sessionGeneration";
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
  getStoredOwnerUserId,
  preserveOfflineSessionAfterRefreshFailure,
  revokeStoredSession,
  updateSessionEnvelope
} from "@/auth/tokenStorage";
import { hasUsableNetwork } from "@/core/network";
import { getMobileRuntimeConfig, getServerCandidateBaseUrls, setServerBaseUrl } from "@/core/serverSettings";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { markPendingOutboxCommandsAuthRequired } from "@/db/repositories/outboxRepository";
import { logMobileError } from "@/services/mobileErrorReporter";
import { MobileApiProtocolError, parseMobileResponse } from "@/api/protocolValidation";
import { shouldRefreshAccessToken } from "@/auth/tokenExpiryPolicy";
import { getMobileConnectionContextGeneration, invalidateMobileConnectionContext, recordMobileConnectionOutcome } from "@/core/connectionStateEvents";
import type { ZodType } from "zod";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  accessToken?: string | null;
  skipAuthRefresh?: boolean;
  headers?: Record<string, string>;
  connectionContextGeneration?: number;
  deadline?: OperationDeadline;
};

let refreshPromise: Promise<string> | null = null;

let authEpoch = 0;

export function beginAuthTransition() {
  authEpoch += 1;
  refreshPromise = null;
  advanceSessionGeneration();
  invalidateMobileConnectionContext();
}

class StaleAuthResponseError extends Error {
  constructor() {
    super("Сессия обновилась во время запроса. Повторите синхронизацию; локальные данные сохранены.");
    this.name = "StaleAuthResponseError";
  }
}

export class MobileHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MobileHttpError";
  }
}

export async function mobileRequest<TResponse>(
  path: string,
  schema: ZodType<TResponse>,
  options: RequestOptions = {}
) {
  const deadline = new OperationDeadline();
  try {
    return await deadline.wait(mobileRequestWithinDeadline(path, schema, { ...options, deadline }));
  } finally { deadline.cancel(); }
}

async function mobileRequestWithinDeadline<TResponse>(path: string, schema: ZodType<TResponse>, options: RequestOptions) {
  const connectionContextGeneration = getMobileConnectionContextGeneration();
  const sessionGeneration = getSessionGeneration();
  // Keep the guard's captured values separate across the native async boundary.
  // The release runtime lost fields of the object containing an awaited value,
  // causing valid stored-session requests to be rejected before HTTP.
  const usesStoredSession = options.accessToken === undefined;
  const requestOwnerUserId = usesStoredSession ? await getStoredOwnerUserId() : null;
  const assertRequestSession = async () => {
    options.deadline?.remaining();
    if (!usesStoredSession) return;
    const ownerUserId = await getStoredOwnerUserId();
    options.deadline?.remaining();
    if (sessionGeneration !== getSessionGeneration()
      || requestOwnerUserId !== ownerUserId) {
      throw new StaleAuthResponseError();
    }
  };
  const requestOptions = { ...options, connectionContextGeneration, assertSession: assertRequestSession };
  await assertRequestSession();
  const token = options.accessToken === undefined ? await getAccessToken() : options.accessToken;
  const runtimeConfig = await getMobileRuntimeConfig();
  await assertRequestSession();
  let requestResult = await sendMobileRequestWithFailover(runtimeConfig.apiBaseUrl, path, requestOptions, token);
  let { apiBaseUrl, response, contextGeneration: responseContextGeneration } = requestResult;

  let refreshedSession = false;
  // A queued report may reach this point after the access token was cleared
  // locally while the refresh token is still valid. Login/refresh/logout opt
  // out explicitly, so a normal API request should always try recovery.
  if (response.status === 401 && !options.skipAuthRefresh) {
    await assertRequestSession();
    const latestStoredToken = options.accessToken === undefined ? await getAccessToken() : null;
    if (latestStoredToken && latestStoredToken !== token) {
      await assertRequestSession();
      requestResult = await sendMobileRequestWithFailover(apiBaseUrl, path, requestOptions, latestStoredToken);
      ({ apiBaseUrl, response, contextGeneration: responseContextGeneration } = requestResult);
    }

    if (response.status === 401) {
      await assertRequestSession();
      options.deadline?.remaining();
      const refreshedToken = await options.deadline!.wait(refreshAccessToken(apiBaseUrl));
      await assertRequestSession();
      refreshedSession = true;
      requestResult = await sendMobileRequestWithFailover(apiBaseUrl, path, requestOptions, refreshedToken);
      ({ apiBaseUrl, response, contextGeneration: responseContextGeneration } = requestResult);
    }
  }

  await assertRequestSession();
  if (!response.ok) {
    if (response.status === 401) {
      recordMobileConnectionOutcome("authorizationRequired", responseContextGeneration);
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
    await assertRequestSession();
    throw new MobileHttpError(message ?? `Ошибка mobile API: ${response.status}`, response.status);
  }

  if (response.status === 204) {
    const result = parseMobileResponse(schema, undefined);
    recordMobileConnectionOutcome("connected", responseContextGeneration);
    return result;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MobileApiProtocolError("Ответ сервера не является корректным JSON mobile API. Локальные данные сохранены.");
  }

  await assertRequestSession();
  const result = parseMobileResponse(schema, payload);
  recordMobileConnectionOutcome("connected", responseContextGeneration);
  return result;
}

async function sendMobileRequestWithFailover(
  preferredApiBaseUrl: string,
  path: string,
  options: RequestOptions & { assertSession?: () => Promise<void> },
  token: string | null
) {
  const apiBaseUrls = await getServerCandidateBaseUrls(preferredApiBaseUrl);
  let lastError: unknown = null;
  let lastResponse: Response | null = null;

  for (const apiBaseUrl of apiBaseUrls) {
    options.deadline?.remaining();
    await options.assertSession?.();
    try {
      const health = await options.deadline!.wait(probeServerHealthCached(apiBaseUrl));
      await options.assertSession?.();
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
      await options.assertSession?.();
      if (shouldTryNextServer(response, path) && apiBaseUrl !== apiBaseUrls[apiBaseUrls.length - 1]) {
        lastResponse = response;
        continue;
      }

      options.deadline?.remaining();
      const contextBeforePersist = getMobileConnectionContextGeneration();
      if (contextBeforePersist === options.connectionContextGeneration) {
        await setServerBaseUrl(
          apiBaseUrl,
          () => getMobileConnectionContextGeneration() === options.connectionContextGeneration
        ).catch(() => undefined);
      }
      const currentContext = getMobileConnectionContextGeneration();
      return {
        apiBaseUrl,
        response,
        // A failover can itself change the configured address and therefore
        // advance the connection context. Preserve a stale request's
        // original generation when another context changed concurrently.
        contextGeneration: contextBeforePersist === options.connectionContextGeneration
          ? currentContext
          : options.connectionContextGeneration ?? currentContext
      };
    } catch (error) {
      if (error instanceof StaleAuthResponseError) throw error;
      invalidateServerHealthCache(apiBaseUrl);
      recordMobileConnectionOutcome("serverUnavailable", options.connectionContextGeneration);
      lastError = error;
    }
  }

  recordMobileConnectionOutcome("serverUnavailable", options.connectionContextGeneration);
  if (lastResponse) {
    return {
      apiBaseUrl: apiBaseUrls[apiBaseUrls.length - 1],
      response: lastResponse,
      contextGeneration: options.connectionContextGeneration ?? getMobileConnectionContextGeneration()
    };
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

async function sendMobileRequest(apiBaseUrl: string, path: string, options: RequestOptions & { assertSession?: () => Promise<void> }, token: string | null) {
  const runtimeConfig = await getMobileRuntimeConfig();
  await options.assertSession?.();

  try {
    const timeoutMs = Math.min(10_000, options.deadline!.remaining());
    return await fetchWithTimeout(`${apiBaseUrl}${path}`, {
      signal: options.deadline!.signal,
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Patrol360-Client": "mobile-app",
        "X-Mobile-Sync-Protocol": runtimeConfig.syncProtocolVersion,
        "X-Patrol360-Contour": runtimeConfig.contourId,
        ...(options.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    }, timeoutMs);
  } catch (error) {
    throw await appendRequestFailureContext(error, `Адрес: ${apiBaseUrl}`);
  }
}

async function refreshAccessToken(apiBaseUrl: string) {
  if (refreshPromise) return refreshPromise;
  const requestEpoch = authEpoch;
  const requestConnectionGeneration = getMobileConnectionContextGeneration();
  const deadline = new OperationDeadline();
  let request!: Promise<string>;
  request = deadline.wait(refreshAccessTokenInternal(apiBaseUrl, requestEpoch, deadline))
    .then((accessToken) => {
      // A refresh may finish after the employee changed account/address. Do
      // not publish recovery for the newer context; the caller will reject
      // the stale response through its session guard.
      if (requestEpoch === authEpoch && requestConnectionGeneration === getMobileConnectionContextGeneration()) {
        recordMobileConnectionOutcome("authorizationRecovered", requestConnectionGeneration);
      }
      void logMobileAction({
        eventType: "auth.refresh.recovered",
        entityType: "mobileSession",
        message: "Мобильная сессия успешно восстановлена."
      }).catch(() => undefined);
      return accessToken;
    })
    .catch((error) => {
      if (requestEpoch !== authEpoch) throw new StaleAuthResponseError();
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
      deadline.cancel();
      if (refreshPromise === request) refreshPromise = null;
    });
  refreshPromise = request;
  return request;
}

async function refreshAccessTokenInternal(apiBaseUrl: string, requestEpoch: number, deadline: OperationDeadline) {
  const assertCurrent = () => {
    if (requestEpoch !== authEpoch) throw new StaleAuthResponseError();
    deadline.remaining();
  };
  const connectionContextGeneration = getMobileConnectionContextGeneration();
  const refreshToken = await getRefreshToken();
  assertCurrent();
  if (!refreshToken) {
    if (requestEpoch === authEpoch) recordMobileConnectionOutcome("authorizationRequired", connectionContextGeneration);
    throw new Error("Ключ мобильной сессии недоступен. Локальные отчёты сохранены; автоматическая отправка приостановлена.");
  }

  const runtimeConfig = await getMobileRuntimeConfig();
  assertCurrent();
  const deviceId = await getOrCreateDeviceId();
  assertCurrent();
  const clientOperationId = await getOrCreateRefreshOperationId(assertCurrent);
  assertCurrent();
  const apiBaseUrls = await getServerCandidateBaseUrls(apiBaseUrl);
  assertCurrent();
  let response: Response | null = null;
  let lastResponse: Response | null = null;
  let activeApiBaseUrl = apiBaseUrl;
  let lastError: unknown = null;

  for (const candidateApiBaseUrl of apiBaseUrls) {
    assertCurrent();
    try {
      const health = await deadline.wait(probeServerHealthCached(candidateApiBaseUrl));
      assertCurrent();
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
        signal: deadline.signal,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Patrol360-Client": "mobile-app",
          "X-Patrol360-Contour": runtimeConfig.contourId
        },
        body: JSON.stringify({ deviceId, refreshToken, contourId: runtimeConfig.contourId, clientOperationId })
      }, Math.min(10_000, deadline.remaining()));
      assertCurrent();
      if (shouldTryNextMobileServer(response.status, response.headers.get("content-type"))
          && candidateApiBaseUrl !== apiBaseUrls[apiBaseUrls.length - 1]) {
        lastResponse = response;
        response = null;
        continue;
      }

      activeApiBaseUrl = candidateApiBaseUrl;
      break;
    } catch (error) {
      assertCurrent();
      invalidateServerHealthCache(candidateApiBaseUrl);
      lastError = error;
    }
  }

  if (!response && !lastResponse) {
    if (requestEpoch === authEpoch) recordMobileConnectionOutcome("serverUnavailable", connectionContextGeneration);
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

  assertCurrent();

  if (response.status === 401) {
    recordMobileConnectionOutcome("authorizationRequired", connectionContextGeneration);
    const failureCode = await deadline.wait(readAuthFailureCode(response));
    assertCurrent();
    if (failureCode === "device_reenrollment_required"
      || failureCode === "device_session_not_found"
      || failureCode === "device_mismatch"
      || failureCode === "refresh_expired") {
      if (requestEpoch !== authEpoch) {
        throw new StaleAuthResponseError();
      }
      await preserveOfflineSessionAfterRefreshFailure(failureCode, assertCurrent);
      const message = recoverableRefreshFailureMessage(failureCode);
      const ownerUserId = await getStoredOwnerUserId();
      assertCurrent();
      if (ownerUserId) {
        await markPendingOutboxCommandsAuthRequired(ownerUserId, message).catch((error) => {
          void logMobileError("auth.refresh.mark-waiting-auth.failed", error);
        });
      }
      throw new Error(message);
    }

    if (failureCode === "session_revoked"
      || failureCode === "device_revoked"
      || failureCode === "account_disabled"
      || failureCode === "refresh_token_reuse") {
      if (requestEpoch !== authEpoch) {
        throw new StaleAuthResponseError();
      }
      await revokeStoredSession(failureCode, assertCurrent);
      throw new Error(explicitRevocationMessage(failureCode));
    }

    throw new Error(
      `Обновление мобильной сессии временно отклонено (${failureCode ?? "unknown"}). Локальные отчёты сохранены; повтор будет выполнен автоматически.`
    );
  }

  if (!response.ok) {
    const message = await deadline.wait(readErrorMessage(response));
    assertCurrent();
    throw new Error(message ?? `Не удалось обновить сессию: ${response.status}. Адрес: ${activeApiBaseUrl}`);
  }

  let session: ReturnType<typeof refreshResponseSchema.parse>;
  let payload: unknown;
  try {
    payload = await deadline.wait(response.json());
  } catch (error) {
    if (error instanceof MobileNetworkError) throw error;
    throw new MobileApiProtocolError("Ответ refresh сессии не является корректным JSON. Локальные данные сохранены.");
  }
  session = parseMobileResponse(refreshResponseSchema, payload);
  assertCurrent();

  if (session.contourId !== runtimeConfig.contourId) {
    throw new Error(`Сервер вернул сессию другого контура (${session.contourId}). Токены не сохранены.`);
  }

  const expectedOwnerUserId = await getStoredOwnerUserId();
  assertCurrent();
  try {
    assertSessionOwner(expectedOwnerUserId, session.user.serverUserId);
  } catch (error) {
    await revokeStoredSession("session_owner_mismatch", assertCurrent);
    throw error;
  }

  if (requestEpoch !== authEpoch) {
    throw new StaleAuthResponseError();
  }

  await updateSessionEnvelope(current => ({
    ...current,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    accessExpiresAt: session.expiresAt,
    refreshExpiresAt: session.refreshExpiresAt,
    refreshOperationId: null,
    ownerUserId: session.user.serverUserId,
    offlineSession: {
      userId: session.user.serverUserId,
      contourId: runtimeConfig.contourId,
      fullName: session.user.fullName,
      lastOnlineLoginAt: new Date().toISOString(),
      expiresAt: session.refreshExpiresAt,
      offlineExpiresAt: session.refreshExpiresAt,
      deviceTrusted: session.device.trusted,
      userBlockedAt: (session.user as typeof session.user & { blockedAt?: string | null }).blockedAt ?? null,
      deviceBlockedAt: session.device.blockedAt
    }
  }), assertCurrent);

  return session.accessToken;
}

export async function refreshStoredAccessToken() {
  const requestEpoch = authEpoch;
  const runtimeConfig = await getMobileRuntimeConfig();
  if (requestEpoch !== authEpoch) throw new StaleAuthResponseError();
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
  return "Для серверной синхронизации требуется повторный вход (" + code + "). Локальная работа и очередь отчётов сохранены; продолжайте работать офлайн.";
}

import { fetchWithTimeout, serverUnavailableMessage } from "@/api/networkTimeout";
import { shouldTryNextMobileServer } from "@/api/serverFailoverPolicy";
import { loginResponseSchema } from "@/api/schemas";
import { probeServerHealth } from "@/api/serverHealthApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { assertSessionOwner } from "@/auth/sessionIdentity";
import {
  getAccessToken,
  getRefreshToken,
  getStoredOwnerUserId,
  markSessionNeedsReenrollment,
  revokeStoredSession,
  setOfflineSession,
  setStoredOwnerUserId,
  setTokens
} from "@/auth/tokenStorage";
import { getMobileRuntimeConfig, getServerCandidateBaseUrls, setServerBaseUrl } from "@/core/serverSettings";
import type { ZodType } from "zod";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  accessToken?: string | null;
  skipAuthRefresh?: boolean;
};

let refreshPromise: Promise<string> | null = null;

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
    const refreshedToken = await refreshAccessToken(apiBaseUrl);
    refreshedSession = true;
    ({ response } = await sendMobileRequestWithFailover(apiBaseUrl, path, options, refreshedToken));
  }

  if (!response.ok) {
    if (response.status === 401) {
      if (path.endsWith("/auth/login")) {
        throw new Error(`Сервер доступен (${apiBaseUrl}), но вход отклонён. Проверьте логин, пароль и привязку аккаунта.`);
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

  return parseMobileResponse(schema, await response.json());
}

export function parseMobileResponse<TResponse>(schema: ZodType<TResponse>, value: unknown): TResponse {
  try {
    return schema.parse(value);
  } catch {
    throw new Error("Сервер вернул несовместимый ответ mobile API. Локальные данные сохранены.");
  }
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
      const health = await probeServerHealth(apiBaseUrl);
      if (!health.ok) {
        lastError = new Error(health.message ?? `Сервер не прошёл проверку контура: ${apiBaseUrl}`);
        continue;
      }

      const response = await sendMobileRequest(apiBaseUrl, path, options, token);
      if (shouldTryNextServer(response, path) && apiBaseUrl !== apiBaseUrls[apiBaseUrls.length - 1]) {
        lastResponse = response;
        continue;
      }

      await setServerBaseUrl(apiBaseUrl).catch(() => undefined);
      return { apiBaseUrl, response };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) {
    return { apiBaseUrl: apiBaseUrls[apiBaseUrls.length - 1], response: lastResponse };
  }

  if (lastError instanceof Error) {
    throw new Error(`${lastError.message} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
  }

  throw new Error(`${serverUnavailableMessage} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
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
  } catch {
    throw new Error(`${serverUnavailableMessage} Адрес: ${apiBaseUrl}`);
  }
}

async function refreshAccessToken(apiBaseUrl: string) {
  refreshPromise ??= refreshAccessTokenInternal(apiBaseUrl).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function refreshAccessTokenInternal(apiBaseUrl: string) {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new Error("Ключ мобильной сессии недоступен. Локальные отчёты сохранены; автоматическая отправка приостановлена.");
  }

  const runtimeConfig = await getMobileRuntimeConfig();
  const deviceId = await getOrCreateDeviceId();
  const apiBaseUrls = await getServerCandidateBaseUrls(apiBaseUrl);
  let response: Response | null = null;
  let lastResponse: Response | null = null;
  let activeApiBaseUrl = apiBaseUrl;
  let lastError: unknown = null;

  for (const candidateApiBaseUrl of apiBaseUrls) {
    try {
      const health = await probeServerHealth(candidateApiBaseUrl);
      if (!health.ok) {
        lastError = new Error(health.message ?? `Сервер не прошёл проверку контура: ${candidateApiBaseUrl}`);
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
        body: JSON.stringify({ deviceId, refreshToken, contourId: runtimeConfig.contourId })
      });
      if (shouldTryNextMobileServer(response.status, response.headers.get("content-type"))
          && candidateApiBaseUrl !== apiBaseUrls[apiBaseUrls.length - 1]) {
        lastResponse = response;
        response = null;
        continue;
      }

      activeApiBaseUrl = candidateApiBaseUrl;
      await setServerBaseUrl(candidateApiBaseUrl).catch(() => undefined);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response && !lastResponse) {
    if (lastError instanceof Error) {
      throw new Error(`${lastError.message} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
    }

    throw new Error(`${serverUnavailableMessage} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
  }

  if (!response) {
    response = lastResponse!;
  }

  if (response.status === 401) {
    const failureCode = await readAuthFailureCode(response);
    if (failureCode === "device_reenrollment_required"
      || failureCode === "device_session_not_found"
      || failureCode === "device_mismatch"
      || failureCode === "refresh_expired") {
      await markSessionNeedsReenrollment("device_reenrollment_required");
      throw new Error(explicitRevocationMessage("device_reenrollment_required"));
    }

    if (failureCode === "session_revoked"
      || failureCode === "device_revoked"
      || failureCode === "account_disabled"
      || failureCode === "refresh_token_reuse") {
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

  let session: ReturnType<typeof loginResponseSchema.parse>;
  try {
    session = parseMobileResponse(loginResponseSchema, await response.json());
  } catch {
    throw new Error("Не удалось обновить сессию. Повторите позже.");
  }

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

  await setTokens(session.accessToken, session.refreshToken);
  await setOfflineSession({
    userId: session.user.serverUserId,
    contourId: runtimeConfig.contourId,
    fullName: session.user.fullName,
    lastOnlineLoginAt: new Date().toISOString(),
    expiresAt: session.refreshExpiresAt
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

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
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

function explicitRevocationMessage(code: "session_revoked" | "device_revoked" | "account_disabled" | "refresh_expired" | "refresh_token_reuse" | "device_reenrollment_required" | "device_session_not_found" | "device_mismatch") {
  switch (code) {
    case "session_revoked":
      return "Мобильная сессия явно отозвана. Локальные отчёты сохранены.";
    case "device_revoked":
      return "Это устройство явно отозвано администратором. Локальные отчёты сохранены.";
    case "account_disabled":
      return "Учётная запись заблокирована администратором. Локальные отчёты сохранены.";
    case "device_reenrollment_required":
    case "device_session_not_found":
    case "device_mismatch":
      return "Требуется повторная регистрация устройства. Локальные отчёты и очередь сохранены.";
    case "refresh_expired":
      return "Срок мобильной сессии истёк. Локальные отчёты сохранены; требуется повторная регистрация устройства.";
    case "refresh_token_reuse":
      return "Обнаружено повторное использование refresh-токена. Сессия отозвана, локальные отчёты сохранены.";
  }
}
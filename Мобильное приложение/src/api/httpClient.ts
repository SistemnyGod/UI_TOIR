import { fetchWithTimeout, serverUnavailableMessage } from "@/api/networkTimeout";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { clearAuthTokens, getAccessToken, getRefreshToken, setTokens } from "@/auth/tokenStorage";
import { getMobileRuntimeConfig, getServerCandidateBaseUrls, setServerBaseUrl } from "@/core/serverSettings";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  accessToken?: string | null;
  skipAuthRefresh?: boolean;
};

let refreshPromise: Promise<string> | null = null;

export async function mobileRequest<TResponse>(path: string, options: RequestOptions = {}) {
  const token = options.accessToken === undefined ? await getAccessToken() : options.accessToken;
  const runtimeConfig = await getMobileRuntimeConfig();
  let { apiBaseUrl, response } = await sendMobileRequestWithFailover(runtimeConfig.apiBaseUrl, path, options, token);

  if (response.status === 401 && token && !options.skipAuthRefresh) {
    const refreshedToken = await refreshAccessToken(apiBaseUrl);
    ({ response } = await sendMobileRequestWithFailover(apiBaseUrl, path, options, refreshedToken));
  }

  if (!response.ok) {
    if (response.status === 401) {
      if (path.endsWith("/auth/login")) {
        throw new Error(`Server is reachable (${apiBaseUrl}), but mobile login was rejected. Check login, password, and account binding.`);
      }

      await clearAuthTokens();
      throw new Error(`Mobile session is invalid (${apiBaseUrl}). Sign in again before sending reports.`);
    }

    const message = await readErrorMessage(response);
    throw new Error(message ?? `Ошибка mobile API: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
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
    const contentType = response.headers.get("content-type") ?? "";
    const unexpectedOkResponse = response.ok && response.status !== 204 && !contentType.includes("application/json");

    return (
      unexpectedOkResponse ||
      response.status === 404 ||
      response.status === 405 ||
      response.status === 501 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    );
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
    await clearAuthTokens();
    throw new Error("Сессия истекла. Войдите в аккаунт повторно.");
  }

  const deviceId = await getOrCreateDeviceId();
  const apiBaseUrls = await getServerCandidateBaseUrls(apiBaseUrl);
  let response: Response | null = null;
  let activeApiBaseUrl = apiBaseUrl;
  let lastError: unknown = null;

  for (const candidateApiBaseUrl of apiBaseUrls) {
    try {
      response = await fetchWithTimeout(`${candidateApiBaseUrl}/api/v1/mobile/auth/refresh`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Patrol360-Client": "mobile-app"
        },
        body: JSON.stringify({ deviceId, refreshToken })
      });
      activeApiBaseUrl = candidateApiBaseUrl;
      await setServerBaseUrl(candidateApiBaseUrl).catch(() => undefined);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response) {
    if (lastError instanceof Error) {
      throw new Error(`${lastError.message} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
    }

    throw new Error(`${serverUnavailableMessage} Проверенные адреса: ${apiBaseUrls.join(", ")}`);
  }

  if (response.status === 401 || response.status === 403) {
    await clearAuthTokens();
    throw new Error("Сессия истекла. Войдите в аккаунт повторно.");
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? `Не удалось обновить сессию: ${response.status}. Адрес: ${activeApiBaseUrl}`);
  }

  let session: {
    accessToken: string;
    refreshToken: string;
  };

  try {
    session = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
    };
  } catch {
    throw new Error("Не удалось обновить сессию. Повторите позже.");
  }

  await setTokens(session.accessToken, session.refreshToken);

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

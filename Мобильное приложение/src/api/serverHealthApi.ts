import { getAccessToken } from "@/auth/tokenStorage";
import { fetchWithTimeout, serverHealthTimeoutMs, serverUnavailableMessage } from "@/api/networkTimeout";
import { getServerBaseUrl, getServerCandidateBaseUrls, normalizeServerBaseUrl, setServerBaseUrl } from "@/core/serverSettings";

export type ServerConnectionCheckResult = {
  ok: boolean;
  message: string;
  status?: number;
  url?: string;
};

export async function checkServerConnection(rawServerBaseUrl?: string): Promise<ServerConnectionCheckResult> {
  let serverBaseUrls: string[];

  try {
    const serverBaseUrl = rawServerBaseUrl ? normalizeServerBaseUrl(rawServerBaseUrl) : await getServerBaseUrl();
    serverBaseUrls = await getServerCandidateBaseUrls(serverBaseUrl);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Укажите корректный адрес сервера."
    };
  }

  const checkedUrls: string[] = [];
  let lastStatus: number | undefined;

  for (const serverBaseUrl of serverBaseUrls) {
    checkedUrls.push(serverBaseUrl);

    try {
      const token = await getAccessToken();
      const healthUrl = `${serverBaseUrl}/api/v1/mobile/health`;
      const bootstrapUrl = `${serverBaseUrl}/api/v1/mobile/bootstrap`;
      const response = token
        ? await fetchWithTimeout(
            bootstrapUrl,
            {
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
                "X-Mobile-Sync-Protocol": "1.0",
                "X-Patrol360-Client": "mobile-app"
              }
            },
            serverHealthTimeoutMs
          )
        : await fetchWithTimeout(
            healthUrl,
            {
              headers: {
                Accept: "application/json",
                "X-Mobile-Sync-Protocol": "1.0",
                "X-Patrol360-Client": "mobile-app"
              }
            },
            serverHealthTimeoutMs
          );

      if (response.ok) {
        await setServerBaseUrl(serverBaseUrl).catch(() => undefined);
        return {
          ok: true,
          message: `Сервер доступен: ${serverBaseUrl}`,
          status: response.status,
          url: token ? bootstrapUrl : healthUrl
        };
      }

      if (response.status === 401 || response.status === 403) {
        await setServerBaseUrl(serverBaseUrl).catch(() => undefined);
        return {
          ok: true,
          message: `Сервер доступен, требуется повторный вход: ${serverBaseUrl}`,
          status: response.status,
          url: token ? bootstrapUrl : healthUrl
        };
      }

      lastStatus = response.status;
    } catch {
      // Try the next configured local endpoint before reporting a connection failure.
    }
  }

  return {
    ok: false,
    message: lastStatus
      ? `Сервер ответил с ошибкой ${lastStatus}. Проверенные адреса: ${checkedUrls.join(", ")}`
      : `${serverUnavailableMessage} Проверенные адреса: ${checkedUrls.join(", ")}`,
    status: lastStatus,
    url: checkedUrls.map((value) => `${value}/api/v1/mobile/health`).join(", ")
  };
}

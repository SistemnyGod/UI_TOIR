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
  let lastProblem: string | null = null;

  for (const serverBaseUrl of serverBaseUrls) {
    checkedUrls.push(serverBaseUrl);

    try {
      const healthUrl = `${serverBaseUrl}/api/v1/mobile/health`;
      const response = await fetchWithTimeout(
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
        const isMobileHealth = await isMobileHealthResponse(response);
        if (!isMobileHealth) {
          lastStatus = response.status;
          lastProblem = "Адрес отвечает, но это не mobile API Patrol360.";
          continue;
        }

        await setServerBaseUrl(serverBaseUrl).catch(() => undefined);
        return {
          ok: true,
          message: `Сервер доступен: ${serverBaseUrl}`,
          status: response.status,
          url: healthUrl
        };
      }

      if (response.status === 401 || response.status === 403) {
        await setServerBaseUrl(serverBaseUrl).catch(() => undefined);
        return {
          ok: true,
          message: `Сервер доступен, требуется повторный вход: ${serverBaseUrl}`,
          status: response.status,
          url: healthUrl
        };
      }

      lastStatus = response.status;
      lastProblem = null;
    } catch {
      // Try the next configured local endpoint before reporting a connection failure.
    }
  }

  return {
    ok: false,
    message: lastProblem
      ? `${lastProblem} Проверенные адреса: ${checkedUrls.join(", ")}`
      : lastStatus
        ? `Сервер ответил с ошибкой ${lastStatus}. Проверенные адреса: ${checkedUrls.join(", ")}`
        : `${serverUnavailableMessage} Проверенные адреса: ${checkedUrls.join(", ")}`,
    status: lastStatus,
    url: checkedUrls.map((value) => `${value}/api/v1/mobile/health`).join(", ")
  };
}

async function isMobileHealthResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return false;
  }

  try {
    const body = (await response.json()) as {
      status?: string;
      syncProtocolVersion?: string;
    };

    return body.status === "ok" && body.syncProtocolVersion === "1.0";
  } catch {
    return false;
  }
}

import { fetchWithTimeout, serverHealthTimeoutMs, serverUnavailableMessage } from "@/api/networkTimeout";
import { getServerBaseUrl, getServerCandidateBaseUrls, normalizeServerBaseUrl, setServerBaseUrl } from "@/core/serverSettings";
import { currentContourId } from "@/core/environments";

export type ServerConnectionCheckResult = {
  ok: boolean;
  message: string;
  status?: number;
  url?: string;
  contourId?: string;
};

export type ServerHealthProbe = {
  ok: boolean;
  status?: number;
  contourId?: string;
  message?: string;
};

export async function probeServerHealth(serverBaseUrl: string, expectedContourId = currentContourId): Promise<ServerHealthProbe> {
  const healthUrl = `${serverBaseUrl}/api/v1/mobile/health`;

  try {
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

    if (!response.ok) {
      return { ok: false, status: response.status, message: `Сервер ответил с ошибкой ${response.status}.` };
    }

    const body = await readMobileHealthResponse(response);
    if (!body || body.status !== "ok" || body.syncProtocolVersion !== "1.0") {
      return { ok: false, status: response.status, message: "Адрес не является совместимым mobile API Patrol360." };
    }

    if (body.contourId !== expectedContourId) {
      return {
        ok: false,
        status: response.status,
        contourId: body.contourId,
        message: `Сервер относится к другому контуру (${body.contourId ?? "неизвестный"}). Ожидался ${expectedContourId}.`
      };
    }

    return { ok: true, status: response.status, contourId: body.contourId };
  } catch {
    return { ok: false, message: serverUnavailableMessage };
  }
}

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
    const probe = await probeServerHealth(serverBaseUrl);
    lastStatus = probe.status ?? lastStatus;

    if (probe.ok) {
      await setServerBaseUrl(serverBaseUrl).catch(() => undefined);
      return {
        ok: true,
        message: `Сервер доступен: ${serverBaseUrl}`,
        status: probe.status,
        url: `${serverBaseUrl}/api/v1/mobile/health`,
        contourId: probe.contourId
      };
    }

    lastProblem = probe.message ?? lastProblem;
  }

  return {
    ok: false,
    message: lastProblem
      ? `${lastProblem} Проверенные адреса: ${checkedUrls.join(", ")}`
      : `${serverUnavailableMessage} Проверенные адреса: ${checkedUrls.join(", ")}`,
    status: lastStatus,
    url: checkedUrls.map((value) => `${value}/api/v1/mobile/health`).join(", ")
  };
}

async function readMobileHealthResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return (await response.json()) as {
      status?: string;
      syncProtocolVersion?: string;
      contourId?: string;
    };
  } catch {
    return null;
  }
}
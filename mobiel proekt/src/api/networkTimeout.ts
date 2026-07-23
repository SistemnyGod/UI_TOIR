export const serverUnavailableMessage = "Сервер недоступен. Проверьте Wi-Fi, мобильную сеть и адрес сервера.";

export const mobileRequestTimeoutMs = 10_000;
export const serverHealthTimeoutMs = 8_000;
export const photoUploadTimeoutMs = 60_000;
export const videoUploadTimeoutMs = 180_000;

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = mobileRequestTimeoutMs) {
  const controller = new AbortController();
  const externalSignal = init.signal;
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    const kind: NetworkErrorKind = timedOut
      ? "timeout"
      : externalSignal?.aborted
        ? "cancelled"
        : "network";
    throw new MobileNetworkError(kind, error, getNetworkErrorMessage(kind));
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message = serverUnavailableMessage,
  onTimeout?: () => void | Promise<void>
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new MobileNetworkError("timeout", new Error(message), message));
      void Promise.resolve(onTimeout?.()).catch(() => undefined);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export type NetworkErrorKind = "timeout" | "offline" | "cancelled" | "network";

export function getNetworkErrorMessage(kind: NetworkErrorKind) {
  switch (kind) {
    case "timeout":
      return "Превышено время ожидания ответа сервера. Данные сохранены на телефоне.";
    case "offline":
      return "Нет подключения к сети. Данные сохранены на телефоне.";
    case "cancelled":
      return "Сетевой запрос отменён. Данные сохранены на телефоне.";
    case "network":
      return serverUnavailableMessage;
  }
}

export function classifyMobileNetworkError(
  error: unknown,
  options: { networkAvailable?: boolean; context?: string } = {}
) {
  const sourceKind = error instanceof MobileNetworkError ? error.kind : "network";
  const kind = sourceKind === "network" && options.networkAvailable === false ? "offline" : sourceKind;
  const context = options.context?.trim();
  const message = `${getNetworkErrorMessage(kind)}${context ? ` ${context}` : ""}`;

  return new MobileNetworkError(kind, error, message);
}

export class MobileNetworkError extends Error {
  readonly kind: NetworkErrorKind;

  constructor(kind: NetworkErrorKind, cause?: unknown, message = serverUnavailableMessage) {
    super(message);
    this.name = "MobileNetworkError";
    this.kind = kind;
    this.cause = cause;
  }
}

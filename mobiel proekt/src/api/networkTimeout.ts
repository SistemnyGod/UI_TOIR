export const serverUnavailableMessage = "Сервер недоступен. Проверьте Wi-Fi, мобильную сеть и адрес сервера.";

export const mobileRequestTimeoutMs = 10_000;
export const serverHealthTimeoutMs = 8_000;
export const photoUploadTimeoutMs = 60_000;
export const videoUploadTimeoutMs = 180_000;

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = mobileRequestTimeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    throw new MobileNetworkError(controller.signal.aborted ? "timeout" : "network", error);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message = serverUnavailableMessage) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export type NetworkErrorKind = "timeout" | "network";

export class MobileNetworkError extends Error {
  readonly kind: NetworkErrorKind;

  constructor(kind: NetworkErrorKind, cause?: unknown) {
    super(serverUnavailableMessage);
    this.name = "MobileNetworkError";
    this.kind = kind;
    this.cause = cause;
  }
}

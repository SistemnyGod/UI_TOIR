export const serverUnavailableMessage = "Сервер недоступен. Проверьте Wi-Fi и адрес сервера.";

export const mobileRequestTimeoutMs = 10_000;
export const serverHealthTimeoutMs = 8_000;
export const photoUploadTimeoutMs = 60_000;

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = mobileRequestTimeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch {
    throw new Error(serverUnavailableMessage);
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

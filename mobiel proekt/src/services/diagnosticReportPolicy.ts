export const diagnosticReportIntervalMs = 24 * 60 * 60 * 1000;

export function isDailyDiagnosticReportDue(periodStart: Date, now: Date) {
  return now.getTime() - periodStart.getTime() >= diagnosticReportIntervalMs;
}

export function sanitizeDiagnosticMessage(message: string) {
  return truncate(
    message
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[redacted-token]")
      .replace(
        /((?:access|refresh)[_-]?token|authorization|password|passwd|secret|api[-_]?key|cookie)(["']?\s*[:=]\s*["']?)[^,\s"'&}]+/gi,
        "$1$2[redacted]"
      )
      .replace(
        /([?&](?:(?:access|refresh)[_-]?token|password|secret|api[-_]?key)=)[^&#\s]+/gi,
        "$1[redacted]"
      )
      .replace(/(https?:\/\/)[^/\s@]+@/gi, "$1[redacted]@"),
    500
  );
}

export function getDiagnosticEventMessage(eventType: string) {
  const normalizedEventType = eventType.toLowerCase();
  if (normalizedEventType.startsWith("auth.refresh")) {
    return "Сбой или ожидание восстановления мобильной сессии.";
  }
  if (normalizedEventType.startsWith("network.")) {
    return "Сетевая ошибка при работе приложения.";
  }
  if (normalizedEventType.startsWith("sync.")) {
    return "Ошибка, конфликт или ожидание синхронизации.";
  }
  if (normalizedEventType.startsWith("mobile.data.refresh") || normalizedEventType.startsWith("mobile.refresh")) {
    return "Не удалось полностью обновить рабочие данные с сервера.";
  }
  if (normalizedEventType.startsWith("app.crash") || normalizedEventType.startsWith("app.error")) {
    return "Техническая ошибка мобильного приложения.";
  }
  return "Техническое событие мобильного приложения.";
}
export function truncateDiagnosticValue(value: string, maxLength: number) {
  return truncate(value, maxLength);
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

/** A 4xx other than auth, timeout or rate limit means resending the same report cannot succeed. */
export function isPermanentDiagnosticRejection(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error ? (error as { status?: unknown }).status : null;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}

/**
 * Median and maximum of save-to-acknowledgement times. Negative or unreadable
 * durations (a phone clock changed in between) are left out.
 */
export function summarizeDeliveryLatencies(durationsSeconds: number[]) {
  const valid = durationsSeconds
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (valid.length === 0) {
    return { count: 0, medianSeconds: null, maxSeconds: null };
  }
  const middle = Math.floor(valid.length / 2);
  const median = valid.length % 2 === 1 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
  return {
    count: valid.length,
    medianSeconds: Math.round(median),
    maxSeconds: Math.round(valid[valid.length - 1])
  };
}

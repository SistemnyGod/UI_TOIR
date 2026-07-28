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

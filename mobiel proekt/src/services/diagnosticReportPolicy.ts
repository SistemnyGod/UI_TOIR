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

export function truncateDiagnosticValue(value: string, maxLength: number) {
  return truncate(value, maxLength);
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

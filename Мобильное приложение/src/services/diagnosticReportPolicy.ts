export const diagnosticReportIntervalMs = 24 * 60 * 60 * 1000;

export function isDailyDiagnosticReportDue(periodStart: Date, now: Date) {
  return now.getTime() - periodStart.getTime() >= diagnosticReportIntervalMs;
}

export function sanitizeDiagnosticMessage(message: string) {
  return truncate(
    message
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[redacted-token]"),
    500
  );
}

export function truncateDiagnosticValue(value: string, maxLength: number) {
  return truncate(value, maxLength);
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

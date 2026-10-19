import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { sanitizeDiagnosticMessage } from "@/services/diagnosticReportPolicy";

// Uncaught errors and crashes are captured by crashCapture (crash file),
// not here, so they are not counted twice in the diagnostic report.
export function logMobileError(eventType: string, error: unknown) {
  const message = sanitizeDiagnosticMessage(error instanceof Error ? error.message : String(error));
  // Database diagnostics are unavailable when bootstrap is the failure.
  // Keep a native logcat/console fallback for support.
  console.error(`[${eventType}] ${message || "Unknown mobile error"}`, error);
  return logMobileAction({
    eventType,
    entityType: "mobileApp",
    message: message || "Unknown mobile error"
  }).catch(() => undefined);
}

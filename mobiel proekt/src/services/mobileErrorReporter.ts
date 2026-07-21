import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { sanitizeDiagnosticMessage } from "@/services/diagnosticReportPolicy";

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsApi = {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
};

let installed = false;

export function installMobileErrorReporter() {
  if (installed) {
    return;
  }

  const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsApi }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) {
    return;
  }

  installed = true;
  const previousHandler = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    void logMobileError(isFatal ? "app.crash" : "app.error", error);
    previousHandler?.(error, isFatal);
  });
}

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

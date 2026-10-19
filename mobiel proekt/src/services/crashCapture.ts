import { recordCrash } from "@/services/crashRecordStore";

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsApi = {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
};
type RejectionTrackerOptions = {
  allRejections: boolean;
  onUnhandled: (id: number, rejection: unknown) => void;
  onHandled: (id: number) => void;
};
type HermesInternalApi = {
  enablePromiseRejectionTracker?: (options: RejectionTrackerOptions) => void;
};

export type CrashCaptureEnvironment = {
  errorUtils?: ErrorUtilsApi;
  hermes?: HermesInternalApi;
  /** In development React Native already reports rejections through LogBox. */
  isDevelopment?: boolean;
};

/** One session cannot write the crash file more often than this. */
const MAX_WRITES_PER_SESSION = 200;

let installed = false;
let writes = 0;

function record(kind: Parameters<typeof recordCrash>[0], error: unknown, componentStack?: string | null) {
  if (writes >= MAX_WRITES_PER_SESSION) return;
  writes += 1;
  recordCrash(kind, error, { componentStack });
}

/**
 * Installs the global JS error handler and the Hermes unhandled-rejection
 * tracker. Runs at module load of the root layout, before bootstrap, so a
 * crash during database start-up is still captured.
 */
export function installCrashCapture(environment: CrashCaptureEnvironment = readRuntimeEnvironment()) {
  if (installed) return;
  installed = true;

  const errorUtils = environment.errorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previousHandler = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      record(isFatal ? "js.fatal" : "js.error", error);
      previousHandler?.(error, isFatal);
    });
  }

  if (!environment.isDevelopment && environment.hermes?.enablePromiseRejectionTracker) {
    environment.hermes.enablePromiseRejectionTracker({
      allRejections: true,
      onUnhandled: (_id, rejection) => record("unhandledRejection", rejection),
      onHandled: () => undefined
    });
  }
}

export function recordRenderCrash(error: unknown, componentStack?: string | null) {
  record("render", error, componentStack);
}

export function resetCrashCaptureForTests() {
  installed = false;
  writes = 0;
}

function readRuntimeEnvironment(): CrashCaptureEnvironment {
  const runtime = globalThis as typeof globalThis & {
    ErrorUtils?: ErrorUtilsApi;
    HermesInternal?: HermesInternalApi;
    __DEV__?: boolean;
  };
  return {
    errorUtils: runtime.ErrorUtils,
    hermes: runtime.HermesInternal,
    isDevelopment: runtime.__DEV__ === true
  };
}

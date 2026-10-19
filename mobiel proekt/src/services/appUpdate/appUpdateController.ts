import type { AppUpdateManifestResponse } from "@/api/appUpdateApi";
import type { InstalledAppVersion } from "@/core/appVersion";
import {
  appVersionCodeHeader,
  evaluateAppUpdate,
  formatMegabytes,
  isAppUpdateBlocking,
  requiredFreeSpaceBytes,
  resolveApkDownloadUrl,
  shouldCheckForAppUpdate,
  verifyDownloadedApk,
  type AppUpdateCheckReason,
  type AppUpdateDecision,
  type AppUpdateManifest
} from "@/domain/appUpdate/appUpdatePolicy";
import type { ApkFileSystem } from "@/services/appUpdate/apkFiles";

export type AppUpdateDownloadState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "downloading"; bytesWritten: number; totalBytes: number }
  | { status: "verifying"; processedBytes: number; totalBytes: number }
  | { status: "installing" }
  | { status: "installerClosed" }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export type AppUpdateState = {
  installed: InstalledAppVersion;
  decision: AppUpdateDecision;
  /** The server answered 426 since the last successful check. */
  serverRequiresUpdate: boolean;
  checking: boolean;
  lastCheckedAt: number | null;
  lastCheckError: string | null;
  dismissedVersionCode: number | null;
  download: AppUpdateDownloadState;
};

export type AppUpdateControllerDeps = {
  installed: () => InstalledAppVersion;
  fetchManifest: () => Promise<AppUpdateManifestResponse>;
  contourId: () => Promise<string>;
  files: ApkFileSystem;
  now?: () => number;
  log?: (event: string, error: unknown) => void;
};

const busyDownloadStatuses = new Set<AppUpdateDownloadState["status"]>(["preparing", "downloading", "verifying", "installing"]);

export function offeredManifest(state: AppUpdateState): AppUpdateManifest | null {
  const { decision } = state;
  return decision.kind === "available" || decision.kind === "required" ? decision.manifest : null;
}

export function isAppUpdateBlockingState(state: AppUpdateState) {
  return isAppUpdateBlocking(state.decision, state.serverRequiresUpdate);
}

export function isAppUpdateDownloadBusy(state: AppUpdateState) {
  return busyDownloadStatuses.has(state.download.status);
}

/** The non-blocking banner: a newer, optional build the employee has not postponed. */
export function shouldShowAppUpdateBanner(state: AppUpdateState) {
  const manifest = offeredManifest(state);
  if (!manifest || state.decision.kind !== "available" || isAppUpdateBlockingState(state)) return false;
  return state.dismissedVersionCode !== manifest.versionCode || isAppUpdateDownloadBusy(state);
}

export function createAppUpdateController(deps: AppUpdateControllerDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => undefined);
  const listeners = new Set<() => void>();
  let state: AppUpdateState = {
    installed: deps.installed(),
    decision: { kind: "unknown" },
    serverRequiresUpdate: false,
    checking: false,
    lastCheckedAt: null,
    lastCheckError: null,
    dismissedVersionCode: null,
    download: { status: "idle" }
  };
  let lastAttemptAt: number | null = null;
  let activeCheck: Promise<AppUpdateState> | null = null;
  let activeDownload: { cancelled: boolean; cancel: () => Promise<void> } | null = null;
  let apiBaseUrl: string | null = null;
  let readyApk: { versionCode: number; fileUri: string; sizeBytes: number } | null = null;
  let leftoversRemoved = false;

  function setState(patch: Partial<AppUpdateState>) {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  }

  function setDownload(download: AppUpdateDownloadState) {
    setState({ download });
  }

  async function discardDownloadedApk() {
    const apk = readyApk;
    readyApk = null;
    if (apk) await deps.files.deleteFile(apk.fileUri).catch((error) => log("app_update.delete.failed", error));
  }

  async function removeLeftovers() {
    // A previous process either installed its APK (and was replaced) or
    // stopped mid-download: nothing in the update folder is useful now.
    if (leftoversRemoved || activeDownload || readyApk) return;
    leftoversRemoved = true;
    await deps.files.deleteUpdatesDirectory().catch((error) => log("app_update.cleanup.failed", error));
  }

  function checkForUpdates(reason: AppUpdateCheckReason): Promise<AppUpdateState> {
    if (activeCheck) return activeCheck;
    if (!shouldCheckForAppUpdate({ reason, now: now(), lastAttemptAt, checkInFlight: false })) {
      return Promise.resolve(state);
    }

    lastAttemptAt = now();
    setState({ checking: true });
    const request = (async () => {
      await removeLeftovers();
      try {
        const response = await deps.fetchManifest();
        apiBaseUrl = response.apiBaseUrl;
        const decision = evaluateAppUpdate(state.installed.versionCode, response.manifest);
        if (readyApk && offeredManifestOf(decision)?.versionCode !== readyApk.versionCode) {
          await discardDownloadedApk();
          if (!isAppUpdateDownloadBusy(state)) setDownload({ status: "idle" });
        }
        setState({
          decision,
          // A fresh answer replaces an earlier 426, unless this build cannot
          // tell its own version and therefore cannot evaluate the answer.
          serverRequiresUpdate: decision.kind === "unknown" ? state.serverRequiresUpdate : false,
          checking: false,
          lastCheckedAt: now(),
          lastCheckError: null
        });
      } catch (error) {
        log("app_update.check.failed", error);
        setState({
          checking: false,
          lastCheckError: "Не удалось проверить обновления. Проверьте связь с сервером Patrol360."
        });
      }
      return state;
    })().finally(() => { activeCheck = null; });
    activeCheck = request;
    return request;
  }

  function handleServerRequiresUpdate() {
    if (!state.serverRequiresUpdate) setState({ serverRequiresUpdate: true });
    void checkForUpdates("serverRequired");
  }

  async function fail(message: string, fileUri?: string) {
    activeDownload = null;
    if (fileUri) await deps.files.deleteFile(fileUri).catch((error) => log("app_update.delete.failed", error));
    setDownload({ status: "failed", message });
  }

  async function install() {
    const apk = readyApk;
    if (!apk) return;
    setDownload({ status: "installing" });
    try {
      await deps.files.openInstaller(apk.fileUri);
      // Back from the installer without being replaced: cancelled, or
      // Android asked to allow installs from this source first.
      setDownload({ status: "installerClosed" });
    } catch (error) {
      log("app_update.installer.failed", error);
      await discardDownloadedApk();
      setDownload({
        status: "failed",
        message: "Не удалось открыть установщик Android. Файл обновления удалён, повторите загрузку."
      });
    }
  }

  async function startUpdate() {
    const manifest = offeredManifest(state);
    if (!manifest || isAppUpdateDownloadBusy(state)) return;

    if (readyApk?.versionCode === manifest.versionCode) {
      const size = await deps.files.fileSize(readyApk.fileUri).catch(() => null);
      if (size === readyApk.sizeBytes) {
        await install();
        return;
      }
      await discardDownloadedApk();
    }

    setDownload({ status: "preparing" });
    let url: string;
    try {
      url = resolveApkDownloadUrl(apiBaseUrl ?? "", manifest.downloadUrl);
    } catch (error) {
      await fail(error instanceof Error ? error.message : String(error));
      return;
    }

    const freeBytes = await deps.files.freeDiskBytes();
    const neededBytes = requiredFreeSpaceBytes(manifest.apkSizeBytes);
    if (freeBytes !== null && freeBytes < neededBytes) {
      await fail(`Недостаточно места на телефоне: нужно ${formatMegabytes(neededBytes)}, свободно ${formatMegabytes(freeBytes)}. Рабочие данные не затронуты.`);
      return;
    }

    const fileUri = `${deps.files.updatesDirectoryUri()}patrol360-${manifest.versionCode}.apk`;
    const token = { cancelled: false, cancel: async () => undefined as void };
    activeDownload = token;
    try {
      await deps.files.prepareUpdatesDirectory();
      const headers: Record<string, string> = { "X-Patrol360-Contour": await deps.contourId() };
      if (state.installed.versionCode) headers[appVersionCodeHeader] = String(state.installed.versionCode);
      if (token.cancelled) {
        await finishCancelled(fileUri);
        return;
      }
      setDownload({ status: "downloading", bytesWritten: 0, totalBytes: manifest.apkSizeBytes });
      const task = deps.files.startDownload(url, fileUri, headers, (progress) => {
        if (activeDownload === token && !token.cancelled) {
          setDownload({
            status: "downloading",
            bytesWritten: progress.bytesWritten,
            totalBytes: progress.totalBytes > 0 ? progress.totalBytes : manifest.apkSizeBytes
          });
        }
      });
      token.cancel = task.cancel;
      const result = await task.result;
      if (token.cancelled || result === null) {
        await finishCancelled(fileUri);
        return;
      }
      if (result.status !== 200) {
        await fail(downloadStatusMessage(result.status), fileUri);
        if (result.status === 404) void checkForUpdates("manual");
        return;
      }
    } catch (error) {
      if (token.cancelled) {
        await finishCancelled(fileUri);
        return;
      }
      log("app_update.download.failed", error);
      await fail("Не удалось скачать обновление: нет связи с сервером Patrol360. Повторите, когда связь восстановится.", fileUri);
      return;
    }

    const sizeCheck = verifyDownloadedApk({
      expectedSizeBytes: manifest.apkSizeBytes,
      expectedSha256: manifest.sha256,
      actualSizeBytes: await deps.files.fileSize(fileUri).catch(() => null)
    });
    if (!sizeCheck.ok) {
      await fail(sizeCheck.message, fileUri);
      return;
    }

    setDownload({ status: "verifying", processedBytes: 0, totalBytes: manifest.apkSizeBytes });
    let actualSha256: string | null;
    try {
      actualSha256 = await deps.files.sha256(
        fileUri,
        manifest.apkSizeBytes,
        (processedBytes) => {
          if (!token.cancelled) setDownload({ status: "verifying", processedBytes, totalBytes: manifest.apkSizeBytes });
        },
        () => token.cancelled
      );
    } catch (error) {
      log("app_update.verify.failed", error);
      actualSha256 = null;
    }
    if (token.cancelled) {
      await finishCancelled(fileUri);
      return;
    }
    const hashCheck = verifyDownloadedApk({
      expectedSizeBytes: manifest.apkSizeBytes,
      expectedSha256: manifest.sha256,
      actualSizeBytes: manifest.apkSizeBytes,
      actualSha256
    });
    if (!hashCheck.ok) {
      await fail(hashCheck.message, fileUri);
      return;
    }

    activeDownload = null;
    readyApk = { versionCode: manifest.versionCode, fileUri, sizeBytes: manifest.apkSizeBytes };
    await install();
  }

  async function finishCancelled(fileUri: string) {
    activeDownload = null;
    await deps.files.deleteFile(fileUri).catch((error) => log("app_update.delete.failed", error));
    setDownload({ status: "cancelled" });
  }

  async function cancelDownload() {
    const token = activeDownload;
    if (!token || token.cancelled) return;
    token.cancelled = true;
    await token.cancel().catch((error) => log("app_update.cancel.failed", error));
  }

  /** «Позже»: hide the banner for this build and drop a downloaded APK. */
  async function postpone() {
    const manifest = offeredManifest(state);
    if (!manifest || state.decision.kind !== "available" || isAppUpdateDownloadBusy(state)) return;
    await discardDownloadedApk();
    setState({ dismissedVersionCode: manifest.versionCode, download: { status: "idle" } });
  }

  async function openInstallPermissionSettings() {
    try {
      await deps.files.openInstallPermissionSettings();
    } catch (error) {
      log("app_update.permission_settings.failed", error);
      setDownload({
        status: "failed",
        message: "Не удалось открыть настройки. Откройте «Настройки → Приложения → Patrol360 → Установка неизвестных приложений» и разрешите установку."
      });
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    checkForUpdates,
    handleServerRequiresUpdate,
    startUpdate,
    cancelDownload,
    postpone,
    openInstallPermissionSettings
  };
}

export type AppUpdateController = ReturnType<typeof createAppUpdateController>;

function offeredManifestOf(decision: AppUpdateDecision) {
  return decision.kind === "available" || decision.kind === "required" ? decision.manifest : null;
}

function downloadStatusMessage(status: number) {
  if (status === 404) return "Опубликованная версия изменилась. Проверьте обновления ещё раз.";
  if (status === 429 || status === 503) return "Сервер занят: обновление скачивают много телефонов. Повторите через минуту.";
  return `Сервер не отдал файл обновления (HTTP ${status}). Повторите позже или сообщите администратору.`;
}

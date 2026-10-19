// Pure rules of the in-app update flow. No Expo or React Native imports:
// everything here is exercised directly by Vitest.

export const appVersionCodeHeader = "X-Mobile-App-Version-Code";
export const appUpdateRequiredCode = "app_update_required";
export const appUpdateApkPathPrefix = "/api/v1/mobile/app-update/apk/";

/** Foreground checks are throttled; start-up and manual checks are not. */
export const foregroundCheckIntervalMs = 30 * 60 * 1000;
/** A 426 from the server triggers a check, but a burst of them only one. */
export const serverRequiredCheckIntervalMs = 60 * 1000;

export type AppUpdateManifest = {
  versionName: string;
  versionCode: number;
  minimumVersionCode: number;
  apkSizeBytes: number;
  sha256: string;
  releaseNotes: string;
  downloadUrl: string;
  publishedAt: string | null;
};

export type AppUpdateDecision =
  | { kind: "unknown" }
  | { kind: "notPublished" }
  | { kind: "upToDate"; manifest: AppUpdateManifest }
  | { kind: "available"; manifest: AppUpdateManifest }
  | { kind: "required"; manifest: AppUpdateManifest };

export type AppUpdateCheckReason = "start" | "foreground" | "manual" | "serverRequired";

/** A positive Android versionCode, or null when the value is not one. */
export function parseVersionCode(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && /^\s*\d+\s*$/.test(value)) {
    return parseVersionCode(Number(value.trim()));
  }
  return null;
}

export function compareVersionCodes(left: number, right: number): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Decides what the installed build should do with the published one.
 * An unknown installed version (a development build) is never blocked, and
 * an update is only required when there is a newer APK that satisfies it.
 */
export function evaluateAppUpdate(
  installedVersionCode: number | null,
  manifest: AppUpdateManifest | null
): AppUpdateDecision {
  if (!manifest) return { kind: "notPublished" };
  if (installedVersionCode === null) return { kind: "unknown" };
  if (compareVersionCodes(manifest.versionCode, installedVersionCode) <= 0) {
    return { kind: "upToDate", manifest };
  }
  return compareVersionCodes(installedVersionCode, manifest.minimumVersionCode) < 0
    ? { kind: "required", manifest }
    : { kind: "available", manifest };
}

/**
 * The blocking screen is shown when the published release requires it, or
 * when the server has just answered 426 and no newer check said otherwise.
 * Nothing is persisted: a phone restarted offline keeps working and its
 * queue is still accepted by the server.
 */
export function isAppUpdateBlocking(decision: AppUpdateDecision, serverRequiresUpdate: boolean) {
  if (decision.kind === "required") return true;
  return serverRequiresUpdate && decision.kind !== "upToDate" && decision.kind !== "available";
}

export function shouldCheckForAppUpdate(input: {
  reason: AppUpdateCheckReason;
  now: number;
  lastAttemptAt: number | null;
  checkInFlight: boolean;
}) {
  if (input.checkInFlight) return false;
  if (input.reason === "start" || input.reason === "manual" || input.lastAttemptAt === null) return true;
  const interval = input.reason === "serverRequired" ? serverRequiredCheckIntervalMs : foregroundCheckIntervalMs;
  return input.now - input.lastAttemptAt >= interval;
}

/**
 * The APK must come from the same Patrol360 server as the manifest: only a
 * relative path of the update endpoint is accepted.
 */
export function resolveApkDownloadUrl(apiBaseUrl: string, downloadUrl: string) {
  const path = downloadUrl.trim();
  if (!path.startsWith(appUpdateApkPathPrefix) || !/^\/[A-Za-z0-9/_-]+$/.test(path) || path.includes("//")) {
    throw new Error("Сервер вернул недопустимый адрес файла обновления.");
  }
  return apiBaseUrl.replace(/\/+$/, "") + path;
}

export function normalizeSha256(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

export type ApkVerificationResult =
  | { ok: true }
  | { ok: false; reason: "size" | "sha256"; message: string };

export function verifyDownloadedApk(input: {
  expectedSizeBytes: number;
  expectedSha256: string;
  actualSizeBytes: number | null;
  actualSha256?: string | null;
}): ApkVerificationResult {
  if (input.actualSizeBytes !== input.expectedSizeBytes) {
    return {
      ok: false,
      reason: "size",
      message: "Файл обновления скачан не полностью. Повторите загрузку."
    };
  }
  if (input.actualSha256 === undefined) return { ok: true };
  const expected = normalizeSha256(input.expectedSha256);
  const actual = input.actualSha256 ? normalizeSha256(input.actualSha256) : null;
  if (!expected || !actual || expected !== actual) {
    return {
      ok: false,
      reason: "sha256",
      message: "Файл обновления повреждён: контрольная сумма SHA-256 не совпала. Файл удалён, повторите загрузку."
    };
  }
  return { ok: true };
}

/** Free space needed for the APK plus room for Android to unpack it. */
export function requiredFreeSpaceBytes(apkSizeBytes: number) {
  return Math.ceil(apkSizeBytes * 1.2) + 20 * 1024 * 1024;
}

export function formatMegabytes(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1).replace(".", ",")} МБ`;
}

import Constants from "expo-constants";
import { File, FileMode } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

import { StreamingSha256 } from "@/sync/streamingSha256";

// Native side of the update flow. Kept thin: the decisions live in
// appUpdateController/appUpdatePolicy and are tested with fakes of this API.

const apkMimeType = "application/vnd.android.package-archive";
const flagGrantReadUriPermission = 0x00000001;
const hashChunkBytes = 256 * 1024;
const fallbackPackageName = "ru.patrol360.mobile";

export type ApkDownloadProgress = { bytesWritten: number; totalBytes: number };

export type ApkDownloadTask = {
  /** Resolves with the HTTP status, or null when the download was cancelled. */
  result: Promise<{ status: number } | null>;
  cancel: () => Promise<void>;
};

export type InstallerOutcome = "closed";

export type ApkFileSystem = {
  updatesDirectoryUri: () => string;
  prepareUpdatesDirectory: () => Promise<void>;
  deleteUpdatesDirectory: () => Promise<void>;
  deleteFile: (fileUri: string) => Promise<void>;
  fileSize: (fileUri: string) => Promise<number | null>;
  freeDiskBytes: () => Promise<number | null>;
  startDownload: (
    url: string,
    fileUri: string,
    headers: Record<string, string>,
    onProgress: (progress: ApkDownloadProgress) => void
  ) => ApkDownloadTask;
  sha256: (
    fileUri: string,
    totalBytes: number,
    onProgress: (processedBytes: number) => void,
    isCancelled: () => boolean
  ) => Promise<string | null>;
  openInstaller: (fileUri: string) => Promise<InstallerOutcome>;
  openInstallPermissionSettings: () => Promise<void>;
};

export const expoApkFileSystem: ApkFileSystem = {
  updatesDirectoryUri: () => `${FileSystem.cacheDirectory ?? ""}app-updates/`,
  async prepareUpdatesDirectory() {
    const directory = this.updatesDirectoryUri();
    // Only one APK is ever kept: an older or partial one is discarded.
    await FileSystem.deleteAsync(directory, { idempotent: true });
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  },
  async deleteUpdatesDirectory() {
    await FileSystem.deleteAsync(this.updatesDirectoryUri(), { idempotent: true });
  },
  async deleteFile(fileUri) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  },
  async fileSize(fileUri) {
    const info = await FileSystem.getInfoAsync(fileUri);
    return info.exists && !info.isDirectory ? info.size : null;
  },
  async freeDiskBytes() {
    try {
      return await FileSystem.getFreeDiskStorageAsync();
    } catch {
      return null;
    }
  },
  startDownload(url, fileUri, headers, onProgress) {
    const download = FileSystem.createDownloadResumable(
      url,
      fileUri,
      { headers, cache: false },
      (data) => onProgress({ bytesWritten: data.totalBytesWritten, totalBytes: data.totalBytesExpectedToWrite })
    );
    return {
      result: download.downloadAsync().then((result) => (result ? { status: result.status } : null)),
      cancel: () => download.cancelAsync()
    };
  },
  async sha256(fileUri, totalBytes, onProgress, isCancelled) {
    const handle = new File(fileUri).open(FileMode.ReadOnly);
    const hasher = new StreamingSha256();
    let processedBytes = 0;
    try {
      while (processedBytes < totalBytes) {
        if (isCancelled()) return null;
        const chunk = handle.readBytes(Math.min(hashChunkBytes, totalBytes - processedBytes));
        if (chunk.byteLength === 0) break;
        hasher.update(chunk);
        processedBytes += chunk.byteLength;
        onProgress(processedBytes);
        // Keep the UI responsive: hashing ~85 MB runs on the JS thread.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      handle.close();
    }
    return processedBytes === totalBytes ? hasher.digestHex() : null;
  },
  async openInstaller(fileUri) {
    // expo-file-system's FileProvider exposes the cache directory, so the
    // system installer receives a content:// URI with a read grant.
    const contentUri = await FileSystem.getContentUriAsync(fileUri);
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      type: apkMimeType,
      // No FLAG_ACTIVITY_NEW_TASK: it would return a cancel result at once.
      flags: flagGrantReadUriPermission
    });
    // The promise resolves only when the installer returns without
    // replacing the app: a successful install restarts the process.
    return "closed";
  },
  async openInstallPermissionSettings() {
    const packageName = Constants.expoConfig?.android?.package ?? fallbackPackageName;
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
      data: `package:${packageName}`
    });
  }
};

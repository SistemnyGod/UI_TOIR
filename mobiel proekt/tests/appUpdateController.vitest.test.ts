import { createHash, randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppUpdateManifest } from '@/domain/appUpdate/appUpdatePolicy';
import type { ApkDownloadProgress, ApkFileSystem } from '@/services/appUpdate/apkFiles';
import {
  createAppUpdateController,
  isAppUpdateBlockingState,
  shouldShowAppUpdateBanner,
  type AppUpdateController
} from '@/services/appUpdate/appUpdateController';
import { StreamingSha256 } from '@/sync/streamingSha256';

const apk = randomBytes(300_000);
const apkSha256 = createHash('sha256').update(apk).digest('hex');
const published = (patch: Partial<AppUpdateManifest> = {}): AppUpdateManifest => ({
  versionName: '0.1.53', versionCode: 53, minimumVersionCode: 50, apkSizeBytes: apk.length, sha256: apkSha256,
  releaseNotes: 'Исправлена отправка фото.', downloadUrl: '/api/v1/mobile/app-update/apk/53', publishedAt: null, ...patch
});

/** In-memory stand-in for the cache folder, the download task and the installer. */
function fakeFiles() {
  const files = new Map<string, Uint8Array>();
  const calls = {
    downloads: [] as { url: string; fileUri: string; headers: Record<string, string> }[],
    installers: [] as string[],
    permissionSettings: 0
  };
  let pendingDownload: { resolve: (status: number | null) => void; reject: (error: Error) => void; progress: (p: ApkDownloadProgress) => void; fileUri: string } | null = null;
  const control = {
    body: apk as Uint8Array,
    status: 200,
    autoComplete: true,
    freeBytes: 10 * 1024 * 1024 * 1024 as number | null,
    installer: async (_fileUri: string) => 'closed' as const,
    finishDownload(status = control.status) {
      const download = pendingDownload!;
      pendingDownload = null;
      if (status === 200) files.set(download.fileUri, control.body);
      download.progress({ bytesWritten: control.body.length, totalBytes: control.body.length });
      download.resolve(status);
    },
    failDownload(error: Error) { const download = pendingDownload!; pendingDownload = null; download.reject(error); },
    progress(bytesWritten: number) { pendingDownload!.progress({ bytesWritten, totalBytes: control.body.length }); }
  };
  const fs: ApkFileSystem = {
    updatesDirectoryUri: () => 'file:///cache/app-updates/',
    prepareUpdatesDirectory: async () => { for (const key of [...files.keys()]) if (key.startsWith('file:///cache/app-updates/')) files.delete(key); },
    deleteUpdatesDirectory: async () => { for (const key of [...files.keys()]) if (key.startsWith('file:///cache/app-updates/')) files.delete(key); },
    deleteFile: async (fileUri) => { files.delete(fileUri); },
    fileSize: async (fileUri) => files.get(fileUri)?.length ?? null,
    freeDiskBytes: async () => control.freeBytes,
    startDownload(url, fileUri, headers, onProgress) {
      calls.downloads.push({ url, fileUri, headers });
      const result = new Promise<{ status: number } | null>((resolve, reject) => {
        pendingDownload = { resolve: (status) => resolve(status === null ? null : { status }), reject, progress: onProgress, fileUri };
      });
      if (control.autoComplete) queueMicrotask(() => control.finishDownload());
      return { result, cancel: async () => { if (pendingDownload) { const d = pendingDownload; pendingDownload = null; d.resolve(null); } } };
    },
    // The real hashing code, run over the in-memory file in chunks.
    async sha256(fileUri, totalBytes, onProgress, isCancelled) {
      const bytes = files.get(fileUri);
      if (!bytes) return null;
      const hasher = new StreamingSha256();
      let processed = 0;
      while (processed < Math.min(totalBytes, bytes.length)) {
        if (isCancelled()) return null;
        const chunk = bytes.subarray(processed, processed + 64 * 1024);
        hasher.update(chunk);
        processed += chunk.length;
        onProgress(processed);
        await Promise.resolve();
      }
      return processed === totalBytes ? hasher.digestHex() : null;
    },
    async openInstaller(fileUri) { calls.installers.push(fileUri); return control.installer(fileUri); },
    async openInstallPermissionSettings() { calls.permissionSettings += 1; }
  };
  return { fs, files, calls, control };
}

let files: ReturnType<typeof fakeFiles>;
let fetchManifest: ReturnType<typeof vi.fn>;
let installedVersionCode: number | null;
let clock: number;
let controller: AppUpdateController;

function makeController() {
  return createAppUpdateController({
    installed: () => ({ versionName: '0.1.51', versionCode: installedVersionCode }),
    fetchManifest: fetchManifest as never,
    contourId: async () => 'patrol360-local-enterprise',
    files: files.fs,
    now: () => clock
  });
}

beforeEach(() => {
  files = fakeFiles();
  installedVersionCode = 52;
  clock = 1_000_000;
  fetchManifest = vi.fn(async () => ({ apiBaseUrl: 'https://192.168.2.194', manifest: published() }));
  controller = makeController();
});

describe('checking', () => {
  it('offers an optional update in a banner and removes leftovers of an earlier install', async () => {
    files.files.set('file:///cache/app-updates/patrol360-52.apk', new Uint8Array(10));
    const state = await controller.checkForUpdates('start');
    expect(state.decision.kind).toBe('available');
    expect(shouldShowAppUpdateBanner(state)).toBe(true);
    expect(isAppUpdateBlockingState(state)).toBe(false);
    expect(files.files.size).toBe(0);
  });

  it('shows the blocking screen below the minimum version', async () => {
    installedVersionCode = 49;
    controller = makeController();
    const state = await controller.checkForUpdates('start');
    expect(isAppUpdateBlockingState(state)).toBe(true);
    expect(shouldShowAppUpdateBanner(state)).toBe(false);
  });

  it('throttles foreground checks but always honours the settings button', async () => {
    await controller.checkForUpdates('start');
    clock += 60_000;
    await controller.checkForUpdates('foreground');
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    await controller.checkForUpdates('manual');
    expect(fetchManifest).toHaveBeenCalledTimes(2);
    clock += 31 * 60_000;
    await controller.checkForUpdates('foreground');
    expect(fetchManifest).toHaveBeenCalledTimes(3);
  });

  it('shares one request between concurrent checks', async () => {
    await Promise.all([controller.checkForUpdates('start'), controller.checkForUpdates('manual')]);
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  it('keeps the last decision and reports a failed check without blocking', async () => {
    await controller.checkForUpdates('start');
    fetchManifest.mockRejectedValueOnce(new Error('offline'));
    const state = await controller.checkForUpdates('manual');
    expect(state.decision.kind).toBe('available');
    expect(state.lastCheckError).toMatch(/Не удалось проверить обновления/);
  });

  it('a server 426 blocks the app until a fresh check says the build is still supported', async () => {
    fetchManifest.mockImplementation(() => new Promise(() => undefined));
    controller.handleServerRequiresUpdate();
    expect(isAppUpdateBlockingState(controller.getState())).toBe(true);

    fetchManifest = vi.fn(async () => ({ apiBaseUrl: 'https://192.168.2.194', manifest: published({ minimumVersionCode: 40 }) }));
    controller = makeController();
    controller.handleServerRequiresUpdate();
    await vi.waitFor(() => expect(controller.getState().checking).toBe(false));
    expect(isAppUpdateBlockingState(controller.getState())).toBe(false);
  });

  it('a phone with nothing published or an unknown build version is never blocked', async () => {
    fetchManifest.mockResolvedValue({ apiBaseUrl: 'https://192.168.2.194', manifest: null });
    expect(isAppUpdateBlockingState(await controller.checkForUpdates('start'))).toBe(false);
    installedVersionCode = null;
    fetchManifest.mockResolvedValue({ apiBaseUrl: 'https://192.168.2.194', manifest: published() });
    controller = makeController();
    const state = await controller.checkForUpdates('start');
    expect(state.decision.kind).toBe('unknown');
    expect(isAppUpdateBlockingState(state)).toBe(false);
    expect(shouldShowAppUpdateBanner(state)).toBe(false);
  });
});

describe('download, verification and install', () => {
  it('downloads from the same server, verifies size and SHA-256, then opens the installer', async () => {
    await controller.checkForUpdates('start');
    const statuses: string[] = [];
    controller.subscribe(() => statuses.push(controller.getState().download.status));

    await controller.startUpdate();

    expect(files.calls.downloads).toEqual([{
      url: 'https://192.168.2.194/api/v1/mobile/app-update/apk/53',
      fileUri: 'file:///cache/app-updates/patrol360-53.apk',
      headers: { 'X-Patrol360-Contour': 'patrol360-local-enterprise', 'X-Mobile-App-Version-Code': '52' }
    }]);
    expect(files.calls.installers).toEqual(['file:///cache/app-updates/patrol360-53.apk']);
    expect([...new Set(statuses)]).toEqual(['preparing', 'downloading', 'verifying', 'installing', 'installerClosed']);
  });

  it('a corrupted APK is rejected by the hash check, deleted and never installed', async () => {
    const corrupted = Uint8Array.from(apk);
    corrupted[1234] ^= 0xff;
    files.control.body = corrupted;
    await controller.checkForUpdates('start');

    await controller.startUpdate();

    expect(controller.getState().download).toMatchObject({ status: 'failed', message: expect.stringMatching(/SHA-256/) });
    expect(files.calls.installers).toEqual([]);
    expect(files.files.size).toBe(0);
  });

  it('a truncated APK is rejected by the size check and deleted', async () => {
    files.control.body = apk.subarray(0, apk.length - 1);
    await controller.checkForUpdates('start');

    await controller.startUpdate();

    expect(controller.getState().download).toMatchObject({ status: 'failed', message: expect.stringMatching(/не полностью/) });
    expect(files.calls.installers).toEqual([]);
    expect(files.files.size).toBe(0);
  });

  it('cancelling the download deletes the partial file', async () => {
    files.control.autoComplete = false;
    await controller.checkForUpdates('start');
    const update = controller.startUpdate();
    await vi.waitFor(() => expect(controller.getState().download.status).toBe('downloading'));
    files.control.progress(1000);
    expect(controller.getState().download).toMatchObject({ status: 'downloading', bytesWritten: 1000 });

    await controller.cancelDownload();
    await update;

    expect(controller.getState().download.status).toBe('cancelled');
    expect(files.files.size).toBe(0);
    expect(files.calls.installers).toEqual([]);
  });

  it('a second tap while downloading does not start another download', async () => {
    files.control.autoComplete = false;
    await controller.checkForUpdates('start');
    const first = controller.startUpdate();
    await vi.waitFor(() => expect(controller.getState().download.status).toBe('downloading'));
    await controller.startUpdate();
    expect(files.calls.downloads).toHaveLength(1);
    files.control.finishDownload();
    await first;
  });

  it('a network failure or HTTP error ends in a retryable failure without a file', async () => {
    files.control.autoComplete = false;
    await controller.checkForUpdates('start');
    const update = controller.startUpdate();
    await vi.waitFor(() => expect(controller.getState().download.status).toBe('downloading'));
    files.control.failDownload(new Error('socket closed'));
    await update;
    expect(controller.getState().download).toMatchObject({ status: 'failed', message: expect.stringMatching(/нет связи/) });

    files.control.autoComplete = true;
    files.control.status = 429;
    await controller.startUpdate();
    expect(controller.getState().download).toMatchObject({ status: 'failed', message: expect.stringMatching(/Сервер занят/) });
    expect(files.files.size).toBe(0);
  });

  it('a version replaced on the server during download triggers a new check', async () => {
    await controller.checkForUpdates('start');
    files.control.status = 404;
    await controller.startUpdate();
    expect(controller.getState().download).toMatchObject({ status: 'failed', message: expect.stringMatching(/изменилась/) });
    await vi.waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(2));
  });

  it('does not download without enough free space', async () => {
    files.control.freeBytes = 1024;
    await controller.checkForUpdates('start');
    await controller.startUpdate();
    expect(controller.getState().download).toMatchObject({ status: 'failed', message: expect.stringMatching(/Недостаточно места/) });
    expect(files.calls.downloads).toEqual([]);
  });

  it('after the installer is closed, «Установить» reuses the verified file and «Позже» deletes it', async () => {
    await controller.checkForUpdates('start');
    await controller.startUpdate();
    expect(controller.getState().download.status).toBe('installerClosed');

    await controller.openInstallPermissionSettings();
    expect(files.calls.permissionSettings).toBe(1);
    await controller.startUpdate();
    expect(files.calls.downloads).toHaveLength(1);
    expect(files.calls.installers).toHaveLength(2);

    await controller.postpone();
    expect(files.files.size).toBe(0);
    expect(shouldShowAppUpdateBanner(controller.getState())).toBe(false);
  });

  it('an installer that cannot be opened is reported and its file deleted', async () => {
    files.control.installer = async () => { throw new Error('No Activity found to handle Intent'); };
    await controller.checkForUpdates('start');
    await controller.startUpdate();
    expect(controller.getState().download).toMatchObject({ status: 'failed', message: expect.stringMatching(/установщик/) });
    expect(files.files.size).toBe(0);
  });

  it('a required update cannot be postponed', async () => {
    installedVersionCode = 49;
    controller = makeController();
    await controller.checkForUpdates('start');
    await controller.postpone();
    expect(controller.getState().dismissedVersionCode).toBeNull();
    expect(isAppUpdateBlockingState(controller.getState())).toBe(true);
  });

  it('refuses an APK URL that points away from the Patrol360 server', async () => {
    fetchManifest.mockResolvedValue({ apiBaseUrl: 'https://192.168.2.194', manifest: published({ downloadUrl: 'https://evil.example/patrol360.apk' }) });
    await controller.checkForUpdates('start');
    await controller.startUpdate();
    expect(controller.getState().download).toMatchObject({ status: 'failed', message: expect.stringMatching(/недопустимый адрес/) });
    expect(files.calls.downloads).toEqual([]);
  });
});

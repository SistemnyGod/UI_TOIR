import { describe, expect, it } from 'vitest';

import {
  compareVersionCodes,
  evaluateAppUpdate,
  foregroundCheckIntervalMs,
  isAppUpdateBlocking,
  normalizeSha256,
  parseVersionCode,
  requiredFreeSpaceBytes,
  resolveApkDownloadUrl,
  serverRequiredCheckIntervalMs,
  shouldCheckForAppUpdate,
  verifyDownloadedApk,
  type AppUpdateManifest
} from '@/domain/appUpdate/appUpdatePolicy';
import { describeAppUpdateDownload, describeQueueDeliveryResult, unsentDataSummary } from '@/features/appUpdate/appUpdatePresentation';

const sha = 'a'.repeat(64);
const manifest = (patch: Partial<AppUpdateManifest> = {}): AppUpdateManifest => ({
  versionName: '0.1.53', versionCode: 53, minimumVersionCode: 50, apkSizeBytes: 1000, sha256: sha,
  releaseNotes: '', downloadUrl: '/api/v1/mobile/app-update/apk/53', publishedAt: null, ...patch
});

describe('version codes', () => {
  it.each([
    [53, 53], ['53', 53], [' 7 ', 7], [0, null], [-1, null], [1.5, null], ['5.1', null], ['', null], [null, null], [undefined, null], ['0x10', null]
  ])('parseVersionCode(%j) = %j', (value, expected) => {
    expect(parseVersionCode(value)).toBe(expected);
  });

  it('compares numerically, not as text', () => {
    expect(compareVersionCodes(9, 10)).toBe(-1);
    expect(compareVersionCodes(10, 9)).toBe(1);
    expect(compareVersionCodes(52, 52)).toBe(0);
  });
});

describe('update-required policy', () => {
  it('is up to date at or above the published version', () => {
    expect(evaluateAppUpdate(53, manifest()).kind).toBe('upToDate');
    expect(evaluateAppUpdate(60, manifest()).kind).toBe('upToDate');
  });

  it('offers an optional update at or above the minimum', () => {
    expect(evaluateAppUpdate(50, manifest()).kind).toBe('available');
    expect(evaluateAppUpdate(52, manifest()).kind).toBe('available');
  });

  it('requires the update below the minimum', () => {
    expect(evaluateAppUpdate(49, manifest())).toEqual({ kind: 'required', manifest: manifest() });
  });

  it('never blocks a build that cannot tell its version or when nothing is published', () => {
    expect(evaluateAppUpdate(null, manifest()).kind).toBe('unknown');
    expect(evaluateAppUpdate(10, null).kind).toBe('notPublished');
    expect(isAppUpdateBlocking({ kind: 'unknown' }, false)).toBe(false);
    expect(isAppUpdateBlocking({ kind: 'notPublished' }, false)).toBe(false);
  });

  it('blocks on a required decision, or on a server 426 until a fresh answer says otherwise', () => {
    expect(isAppUpdateBlocking({ kind: 'required', manifest: manifest() }, false)).toBe(true);
    expect(isAppUpdateBlocking({ kind: 'unknown' }, true)).toBe(true);
    expect(isAppUpdateBlocking({ kind: 'available', manifest: manifest() }, true)).toBe(false);
    expect(isAppUpdateBlocking({ kind: 'upToDate', manifest: manifest() }, true)).toBe(false);
  });
});

describe('check throttling', () => {
  const now = 10 * foregroundCheckIntervalMs;
  it('always checks on start and on the settings button', () => {
    expect(shouldCheckForAppUpdate({ reason: 'start', now, lastAttemptAt: now, checkInFlight: false })).toBe(true);
    expect(shouldCheckForAppUpdate({ reason: 'manual', now, lastAttemptAt: now, checkInFlight: false })).toBe(true);
  });

  it('throttles foreground checks to one per interval', () => {
    expect(shouldCheckForAppUpdate({ reason: 'foreground', now, lastAttemptAt: null, checkInFlight: false })).toBe(true);
    expect(shouldCheckForAppUpdate({ reason: 'foreground', now, lastAttemptAt: now - foregroundCheckIntervalMs + 1, checkInFlight: false })).toBe(false);
    expect(shouldCheckForAppUpdate({ reason: 'foreground', now, lastAttemptAt: now - foregroundCheckIntervalMs, checkInFlight: false })).toBe(true);
  });

  it('collapses a burst of 426 answers into one check', () => {
    expect(shouldCheckForAppUpdate({ reason: 'serverRequired', now, lastAttemptAt: now - serverRequiredCheckIntervalMs + 1, checkInFlight: false })).toBe(false);
    expect(shouldCheckForAppUpdate({ reason: 'serverRequired', now, lastAttemptAt: now - serverRequiredCheckIntervalMs, checkInFlight: false })).toBe(true);
  });

  it('never starts a second check while one runs', () => {
    expect(shouldCheckForAppUpdate({ reason: 'manual', now, lastAttemptAt: null, checkInFlight: true })).toBe(false);
  });
});

describe('download URL', () => {
  it('resolves the relative update path against the server that answered', () => {
    expect(resolveApkDownloadUrl('https://192.168.2.194/', '/api/v1/mobile/app-update/apk/53')).toBe('https://192.168.2.194/api/v1/mobile/app-update/apk/53');
  });

  it.each([
    'https://evil.example/api/v1/mobile/app-update/apk/53',
    '//evil.example/api/v1/mobile/app-update/apk/53',
    '/api/v1/mobile/files/53',
    '/api/v1/mobile/app-update/apk/../../files',
    '/api/v1/mobile/app-update/apk/53?x=https://evil'
  ])('rejects %s', (url) => {
    expect(() => resolveApkDownloadUrl('https://192.168.2.194', url)).toThrow(/недопустимый адрес/);
  });
});

describe('APK verification', () => {
  it('rejects a short or oversized file before hashing', () => {
    expect(verifyDownloadedApk({ expectedSizeBytes: 1000, expectedSha256: sha, actualSizeBytes: 999 })).toMatchObject({ ok: false, reason: 'size' });
    expect(verifyDownloadedApk({ expectedSizeBytes: 1000, expectedSha256: sha, actualSizeBytes: null })).toMatchObject({ ok: false, reason: 'size' });
    expect(verifyDownloadedApk({ expectedSizeBytes: 1000, expectedSha256: sha, actualSizeBytes: 1000 })).toEqual({ ok: true });
  });

  it('accepts a matching SHA-256 regardless of letter case', () => {
    expect(verifyDownloadedApk({ expectedSizeBytes: 1, expectedSha256: sha.toUpperCase(), actualSizeBytes: 1, actualSha256: sha })).toEqual({ ok: true });
  });

  it('rejects a different, missing or malformed SHA-256', () => {
    for (const actualSha256 of ['b'.repeat(64), null, 'not-a-hash']) {
      expect(verifyDownloadedApk({ expectedSizeBytes: 1, expectedSha256: sha, actualSizeBytes: 1, actualSha256 })).toMatchObject({ ok: false, reason: 'sha256' });
    }
    expect(normalizeSha256('  ' + sha.toUpperCase() + ' ')).toBe(sha);
    expect(normalizeSha256('abc')).toBeNull();
  });

  it('asks for room to unpack the APK', () => {
    expect(requiredFreeSpaceBytes(100 * 1024 * 1024)).toBeGreaterThan(120 * 1024 * 1024);
  });
});

describe('download presentation', () => {
  it('maps every download state to the actions the employee can take', () => {
    expect(describeAppUpdateDownload({ status: 'idle' })).toMatchObject({ startLabel: 'Обновить', canCancel: false, busy: false });
    expect(describeAppUpdateDownload({ status: 'preparing' })).toMatchObject({ startLabel: null, busy: true, canCancel: false });
    expect(describeAppUpdateDownload({ status: 'downloading', bytesWritten: 21 * 1024 * 1024, totalBytes: 84 * 1024 * 1024 }))
      .toMatchObject({ text: 'Загрузка: 21 МБ из 84 МБ (25%)', progress: 0.25, canCancel: true, startLabel: null });
    expect(describeAppUpdateDownload({ status: 'verifying', processedBytes: 1, totalBytes: 2 })).toMatchObject({ text: 'Проверка файла (SHA-256): 50%', canCancel: true });
    expect(describeAppUpdateDownload({ status: 'installing' })).toMatchObject({ busy: true, canCancel: false, startLabel: null });
    expect(describeAppUpdateDownload({ status: 'installerClosed' })).toMatchObject({ startLabel: 'Установить', showInstallPermission: true, tone: 'warning' });
    expect(describeAppUpdateDownload({ status: 'cancelled' })).toMatchObject({ startLabel: 'Обновить' });
    expect(describeAppUpdateDownload({ status: 'failed', message: 'Нет связи' })).toMatchObject({ text: 'Нет связи', startLabel: 'Повторить', tone: 'danger' });
  });

  it('never claims data is lost when the queue cannot be sent', () => {
    for (const skipped of ['offline', 'serverUnavailable', 'unauthenticated', 'wrongContour', 'failed'] as const) {
      expect(describeQueueDeliveryResult({ sent: 0, skipped })).toMatch(/сохранены|не потеряны/);
    }
    expect(describeQueueDeliveryResult({ sent: 3, skipped: null })).toBe('Отправлено записей: 3.');
    expect(unsentDataSummary(2)).toContain('Неотправленных записей: 2');
    expect(unsentDataSummary(0)).toBe('Все записи отправлены на сервер.');
  });
});

import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { AppUpdateManifest } from '@/domain/appUpdate/appUpdatePolicy';
import type { ApkFileSystem } from '@/services/appUpdate/apkFiles';
import { createAppUpdateController, type AppUpdateController } from '@/services/appUpdate/appUpdateController';

const h = vi.hoisted(() => ({
  controller: null as unknown as AppUpdateController,
  appStateListener: null as null | ((state: string) => void),
  unsent: 3,
  sync: vi.fn(),
  countCalls: 0
}));

vi.mock('react-native', () => ({
  Text: 'Text', View: 'View', ScrollView: 'ScrollView', Modal: 'Modal', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  AppState: { addEventListener: (_: string, listener: (state: string) => void) => { h.appStateListener = listener; return { remove: () => { h.appStateListener = null; } }; } }
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/ui/atomTheme', () => ({ toneColors: () => ({ foreground: 'fg', background: 'bg' }) }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusMessage', () => ({ StatusMessage: 'StatusMessage' }));
vi.mock('@/ui/Screen', () => ({ Screen: 'Screen' }));
vi.mock('@/features/profile/ProfileComponents', () => ({ ProfileGroup: 'ProfileGroup', ProfileRow: 'ProfileRow' }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/sync/syncTriggers', () => ({ triggerForegroundSyncWithRetry: h.sync }));
vi.mock('@/db/repositories/bootstrapRepository', () => ({ countBlockingLocalUserData: async () => { h.countCalls += 1; return h.unsent; } }));
vi.mock('@/services/appUpdate/appUpdateService', async () => {
  const R = await import('react');
  return {
    appUpdateController: new Proxy({}, { get: (_, key) => (h.controller as never)[key] }),
    useAppUpdateState: () => R.useSyncExternalStore(h.controller.subscribe, h.controller.getState)
  };
});

import { AppUpdateGate } from '@/features/appUpdate/AppUpdateGate';
import { AppUpdateSettingsScreen } from '@/features/appUpdate/AppUpdateSettingsScreen';

const manifest = (patch: Partial<AppUpdateManifest> = {}): AppUpdateManifest => ({
  versionName: '0.1.53', versionCode: 53, minimumVersionCode: 50, apkSizeBytes: 84 * 1024 * 1024, sha256: 'c'.repeat(64),
  releaseNotes: 'Исправлена отправка фото.', downloadUrl: '/api/v1/mobile/app-update/apk/53', publishedAt: null, ...patch
});

let fetchManifest: ReturnType<typeof vi.fn>;
let downloadProgress: ((p: { bytesWritten: number; totalBytes: number }) => void) | null;
let renderer: ReactTestRenderer;

function useController(installedVersionCode: number) {
  const files: ApkFileSystem = {
    updatesDirectoryUri: () => 'file:///cache/app-updates/',
    prepareUpdatesDirectory: async () => {},
    deleteUpdatesDirectory: async () => {},
    deleteFile: async () => {},
    fileSize: async () => null,
    freeDiskBytes: async () => null,
    startDownload: (_url, _uri, _headers, onProgress) => {
      downloadProgress = onProgress;
      return { result: new Promise(() => undefined), cancel: async () => {} };
    },
    sha256: async () => null,
    openInstaller: async () => 'closed',
    openInstallPermissionSettings: async () => {}
  };
  h.controller = createAppUpdateController({
    installed: () => ({ versionName: '0.1.51', versionCode: installedVersionCode }),
    fetchManifest: fetchManifest as never,
    contourId: async () => 'contour',
    files
  });
}

const texts = (root: ReactTestInstance) => root.findAllByType('Text' as never).map((node) => [node.props.children].flat().join(''));
const button = (root: ReactTestInstance, label: string) => root.findAllByType('PrimaryButton' as never).find((node) => node.props.label === label);
const flush = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fetchManifest = vi.fn(async () => ({ apiBaseUrl: 'https://192.168.2.194', manifest: manifest() }));
  downloadProgress = null;
  h.unsent = 3;
  h.countCalls = 0;
  h.sync.mockReset();
});
afterEach(async () => { await act(() => renderer?.unmount()); });

it('a newer optional version shows a non-blocking banner with «Обновить» and «Позже»', async () => {
  useController(52);
  await act(async () => { renderer = create(React.createElement(AppUpdateGate, null, React.createElement('Text', null, 'Маршрут'))); });
  await flush();

  expect(fetchManifest).toHaveBeenCalledTimes(1);
  expect(texts(renderer.root)).toContain('Маршрут');
  expect(texts(renderer.root)).toContain('Доступна новая версия 0.1.53');
  expect(button(renderer.root, 'Обновить')).toBeDefined();
  expect(renderer.root.findByType('Modal' as never).props.visible).toBe(false);

  await act(async () => { button(renderer.root, 'Позже')!.props.onPress(); });
  await flush();
  expect(texts(renderer.root)).not.toContain('Доступна новая версия 0.1.53');
  expect(texts(renderer.root)).toContain('Маршрут');
});

it('returning to the foreground re-checks, throttled', async () => {
  useController(52);
  await act(async () => { renderer = create(React.createElement(AppUpdateGate, null)); });
  await flush();
  await act(async () => { h.appStateListener!('active'); });
  await flush();
  expect(fetchManifest).toHaveBeenCalledTimes(1);
});

it('the banner shows download progress with a cancel action instead of «Позже»', async () => {
  useController(52);
  await act(async () => { renderer = create(React.createElement(AppUpdateGate, null)); });
  await flush();
  await act(async () => { button(renderer.root, 'Обновить')!.props.onPress(); });
  await flush();
  await act(async () => { downloadProgress!({ bytesWritten: 42 * 1024 * 1024, totalBytes: 84 * 1024 * 1024 }); });

  expect(texts(renderer.root)).toContain('Загрузка: 42 МБ из 84 МБ (50%)');
  expect(button(renderer.root, 'Отменить загрузку')).toBeDefined();
  expect(button(renderer.root, 'Позже')).toBeUndefined();
  expect(button(renderer.root, 'Обновить')).toBeUndefined();
});

it('below the minimum the blocking screen covers the app, which stays mounted, and still sends the queue', async () => {
  useController(49);
  let finishSync!: (value: unknown) => void;
  h.sync.mockImplementation(() => new Promise((resolve) => { finishSync = resolve; }));
  await act(async () => { renderer = create(React.createElement(AppUpdateGate, null, React.createElement('Text', null, 'Маршрут'))); });
  await flush();

  const modal = renderer.root.findByType('Modal' as never);
  expect(modal.props.visible).toBe(true);
  expect(texts(modal)).toContain('Требуется обновление');
  expect(texts(modal)).toContain('Неотправленных записей: 3. Их можно отправить сейчас — сервер принимает очередь и от старой версии.');
  expect(texts(renderer.root)).toContain('Маршрут');
  expect(texts(renderer.root)).not.toContain('Доступна новая версия 0.1.53');
  expect(button(modal, 'Обновить')).toBeDefined();
  expect(button(modal, 'Позже')).toBeUndefined();

  const send = button(modal, 'Отправить очередь')!;
  await act(async () => { send.props.onPress(); send.props.onPress(); });
  expect(h.sync).toHaveBeenCalledExactlyOnceWith({ mode: 'manualAll' });
  h.unsent = 0;
  await act(async () => { finishSync({ sent: 3, skipped: null }); });
  await flush();

  expect(renderer.root.findAllByType('StatusMessage' as never).map((node) => node.props.message)).toContain('Отправлено записей: 3.');
  expect(texts(modal)).toContain('Все записи отправлены на сервер.');
  expect(h.countCalls).toBe(2);
});

it('an offline queue delivery on the blocking screen keeps the data and says so', async () => {
  useController(49);
  h.sync.mockResolvedValue({ sent: 0, skipped: 'offline' });
  await act(async () => { renderer = create(React.createElement(AppUpdateGate, null)); });
  await flush();
  await act(async () => { button(renderer.root, 'Отправить очередь')!.props.onPress(); });
  await flush();
  expect(renderer.root.findAllByType('StatusMessage' as never).map((node) => node.props.message))
    .toContain('Нет подключения. Данные сохранены на телефоне и будут отправлены, когда появится сеть.');
  expect(texts(renderer.root)).toContain('Неотправленных записей: 3. Их можно отправить сейчас — сервер принимает очередь и от старой версии.');
});

it('a server 426 with no reachable manifest still blocks and offers a new check', async () => {
  useController(49);
  fetchManifest.mockRejectedValue(new Error('offline'));
  await act(async () => { renderer = create(React.createElement(AppUpdateGate, null)); });
  await flush();
  expect(renderer.root.findByType('Modal' as never).props.visible).toBe(false);

  await act(async () => { h.controller.handleServerRequiresUpdate(); });
  await flush();
  const modal = renderer.root.findByType('Modal' as never);
  expect(modal.props.visible).toBe(true);
  expect(button(modal, 'Обновить')).toBeUndefined();
  expect(button(modal, 'Проверить обновления')).toBeDefined();
});

it('settings: «Проверить обновления» checks now and reports the result', async () => {
  useController(53);
  await act(async () => { renderer = create(React.createElement(AppUpdateSettingsScreen)); });
  expect(fetchManifest).not.toHaveBeenCalled();

  await act(async () => { button(renderer.root, 'Проверить обновления')!.props.onPress(); });
  await flush();

  expect(fetchManifest).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType('StatusMessage' as never).map((node) => node.props.message)).toContain('Установлена актуальная версия.');
  expect(button(renderer.root, 'Обновить')).toBeUndefined();

  fetchManifest.mockResolvedValue({ apiBaseUrl: 'https://192.168.2.194', manifest: manifest({ versionCode: 54, versionName: '0.1.54' }) });
  await act(async () => { button(renderer.root, 'Проверить обновления')!.props.onPress(); });
  await flush();
  expect(texts(renderer.root)).toContain('Доступна новая версия 0.1.54');
  expect(button(renderer.root, 'Обновить')).toBeDefined();
});

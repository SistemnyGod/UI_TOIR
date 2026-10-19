import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Scan screens: vibration per outcome, wrong/unknown tag messages and actions, silent NFC
// read retries with a hold-still hint, failure counters for the diagnostic report, and the
// keep-awake lock held only while a scanner is focused.
const state = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  assignment: { status: 'inProgress', routeName: 'Обход цеха' },
  points: [
    { pointId: 'gate', name: 'Ворота', orderIndex: 1, status: 'pending' },
    { pointId: 'store', name: 'Склад', orderIndex: 2, status: 'pending' }
  ],
  codes: ['04D4E5F6'] as string[],
  incomplete: false,
  scanNfc: vi.fn(),
  scanQr: vi.fn(),
  owner: vi.fn(),
  startReader: vi.fn(),
  stopReader: vi.fn(),
  vibrate: vi.fn(),
  log: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  focusCleanups: new Set<() => void>(),
  blur: () => { for (const cleanup of [...state.focusCleanups]) { state.focusCleanups.delete(cleanup); cleanup(); } }
}));

vi.mock('expo-router', async () => {
  const R = await import('react');
  return {
    useRouter: () => state.router,
    useLocalSearchParams: () => ({ assignmentId: 'a1' }),
    // Every focus effect of the screen is blurred together, as on a real navigation.
    useFocusEffect: (cb: () => (() => void) | undefined) => R.useEffect(() => {
      const cleanup = cb();
      if (!cleanup) return undefined;
      state.focusCleanups.add(cleanup);
      return () => { if (state.focusCleanups.delete(cleanup)) cleanup(); };
    }, [cb])
  };
});
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (s: any) => s },
  useWindowDimensions: () => ({ width: 360, fontScale: 1 }),
  AppState: { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) },
  Vibration: { vibrate: state.vibrate }
}));
vi.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: state.activate, deactivateKeepAwake: state.deactivate }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-camera', () => ({ CameraView: 'CameraView' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/auth/dataOwnerContext', () => ({
  captureDataOwnerContext: async () => ({ ownerUserId: 'alice', contourId: 'test', generation: 1 }),
  assertDataOwnerContext: async () => undefined
}));
vi.mock('@/services/cameraService', () => ({ ensureCameraPermission: async () => true }));
vi.mock('@/services/qrScannerService', () => ({ createQrScanResult: (value: string) => ({ qrCodeHash: value }) }));
vi.mock('@/services/nfcService', () => ({
  getNfcCodes: () => state.codes,
  isIncompleteNdefRead: () => state.incomplete,
  initializeNfc: async () => ({ supported: true, enabled: true }),
  isNfcEnabled: async () => true,
  openNfcSettings: vi.fn(),
  subscribeNfcAdapterState: () => () => undefined,
  startNfcReaderSession: state.startReader,
  stopNfcReaderSession: state.stopReader
}));
vi.mock('@/sync/PatrolSyncCoordinator', () => ({ requestPatrolSync: vi.fn() }));
vi.mock('@/sync/syncEvents', () => ({ shouldReloadAssignmentAfterSync: () => false, subscribeToSyncEvents: () => () => undefined }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: state.log }));
vi.mock('@/db/repositories/scanTagLookupRepository', () => ({ findScanTagOwner: state.owner }));
vi.mock('@/db/repositories/patrolRepository', () => ({
  getAssignmentById: async () => state.assignment,
  listAssignmentPoints: async () => state.points,
  getAssignmentScanPolicy: async () => ({ qrFallbackEnabled: true, nfcEnabled: true }),
  pauseAssignmentLocally: vi.fn(), scanPointByNfc: state.scanNfc, scanPointByQr: state.scanQr
}));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return {
  Screen: (p: any) => R.createElement('Screen', p, p.children, p.bottomAction)
}; });
vi.mock('@/features/patrol/ScanPulse', () => ({ ScanPulse: 'ScanPulse' }));

import { ScanNfcScreen } from '@/features/patrol/ScanNfcScreen';
import { ScanQrScreen } from '@/features/patrol/ScanQrScreen';
import { ScanMessage } from '@/features/patrol/ScanPresentation';
import { holdStillHint } from '@/features/patrol/scanOutcome';
import { scanVibrationPatterns } from '@/services/scanFeedback';

const gate = { pointId: 'gate', name: 'Ворота', orderIndex: 1 };
const store = { pointId: 'store', name: 'Склад', orderIndex: 2 };

function pointOrderError() {
  return Object.assign(new Error('Сначала завершите обязательную точку «Ворота».'), { name: 'PointOrderError', requiredPoint: gate });
}

let screen: ReactTestRenderer | undefined;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  state.codes = ['04D4E5F6'];
  state.incomplete = false;
  state.startReader.mockResolvedValue(async () => undefined);
  state.stopReader.mockResolvedValue(undefined);
  state.activate.mockResolvedValue(undefined);
  state.deactivate.mockResolvedValue(undefined);
  state.log.mockResolvedValue(undefined);
  state.owner.mockResolvedValue({ kind: 'unknown' });
});
afterEach(async () => {
  if (screen) await act(() => screen?.unmount());
  screen = undefined;
  vi.useRealTimers();
});

const mount = async (component: React.ComponentType) => { await act(async () => { screen = create(React.createElement(component)); }); };
const scanMessage = () => screen!.root.findByType(ScanMessage).props;
const buttons = () => screen!.root.findAllByType('PrimaryButton' as any);
const button = (label: string) => buttons().find(node => node.props.label === label);
const latestOnTag = () => state.startReader.mock.calls.at(-1)![0] as (tag: unknown) => Promise<void>;
const tapTag = async () => { await act(async () => { await latestOnTag()({}); }); };
const loggedTypes = () => state.log.mock.calls.map(([event]) => event.eventType);

it('NFC: a confirmed point vibrates once firmly and opens its form', async () => {
  state.scanNfc.mockResolvedValue({ matched: true, point: { ...gate, status: 'scanned' } });
  await mount(ScanNfcScreen);
  await tapTag();
  expect(state.vibrate).toHaveBeenCalledWith(scanVibrationPatterns.success);
  expect(scanMessage()).toMatchObject({ tone: 'success', message: 'Метка подтверждена: точка 1 «Ворота»' });
  expect(state.router.replace).toHaveBeenCalledWith('/patrol/assignment/a1/point/gate/fill');
});

it('NFC: a tag of a later point on a strict route names it, offers the required point and confirms nothing', async () => {
  state.scanNfc.mockRejectedValue(pointOrderError());
  state.owner.mockResolvedValue({ kind: 'routePoint', point: store });
  await mount(ScanNfcScreen);
  await tapTag();

  expect(state.owner).toHaveBeenCalledWith('a1', 'nfc', ['04D4E5F6']);
  expect(scanMessage()).toMatchObject({ tone: 'error', message: 'Это метка точки 2 «Склад». Сначала нужна точка 1 «Ворота»' });
  expect(scanMessage().message + scanMessage().hint).not.toContain('04D4E5F6');
  expect(state.vibrate).toHaveBeenCalledWith(scanVibrationPatterns.wrongTag);
  expect(state.router.replace).not.toHaveBeenCalled();
  expect(loggedTypes()).toContain('patrol.nfc.match_failed.wrong_order');

  await act(async () => button('Перейти к точке 1')!.props.onPress());
  expect(state.router.push).toHaveBeenCalledWith('/patrol/assignment/a1/point/gate');
  expect(state.router.replace).not.toHaveBeenCalled();
});

it.each([
  [{ kind: 'otherRoute', routeName: 'Обход склада' }, 'Эта метка относится к другому маршруту: «Обход склада»', 'patrol.nfc.match_failed.other_route'],
  [{ kind: 'unknown' }, 'Эта метка не найдена в маршрутах на телефоне', 'patrol.nfc.match_failed.unknown_tag']
])('NFC: an unmatched tag explains where it belongs (%j)', async (owner, message, eventType) => {
  state.scanNfc.mockResolvedValue({ matched: false, scannedCode: '04D4E5F6' });
  state.owner.mockResolvedValue(owner);
  await mount(ScanNfcScreen);
  await tapTag();
  expect(scanMessage()).toMatchObject({ tone: 'error', message });
  expect(scanMessage().hint).toMatch(/^Точка не отмечена\./);
  expect(state.vibrate).toHaveBeenCalledWith(scanVibrationPatterns.wrongTag);
  expect(loggedTypes()).toContain(eventType);
  expect(state.router.replace).not.toHaveBeenCalled();
  expect(buttons().filter(node => /точк/.test(node.props.label))).toHaveLength(0);
});

it('NFC: an already scanned point gives a light tick and a way back to its form, without a new scan', async () => {
  state.scanNfc.mockResolvedValue({ matched: true, alreadyScanned: true, point: { ...gate, status: 'scanned' } });
  await mount(ScanNfcScreen);
  await tapTag();
  expect(state.vibrate).toHaveBeenCalledWith(scanVibrationPatterns.notice);
  expect(scanMessage()).toMatchObject({ tone: 'neutral', message: 'Точка 1 «Ворота» уже отмечена' });
  expect(state.router.replace).not.toHaveBeenCalled();
  await act(async () => button('Продолжить точку 1')!.props.onPress());
  expect(state.router.replace).toHaveBeenCalledWith('/patrol/assignment/a1/point/gate/fill');
});

it('NFC: an unreadable tag is re-read twice silently, then shows an error with the hold-still hint', async () => {
  vi.useFakeTimers();
  state.codes = [];
  await mount(ScanNfcScreen);
  expect(state.startReader).toHaveBeenCalledTimes(1);

  await tapTag();
  expect(scanMessage().message).toContain('читаем ещё раз');
  expect(scanMessage().tone).toBe('neutral');
  expect(state.vibrate).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(state.startReader).toHaveBeenCalledTimes(2);

  await tapTag();
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  expect(state.startReader).toHaveBeenCalledTimes(3);
  expect(state.vibrate).not.toHaveBeenCalled();

  await tapTag();
  expect(scanMessage()).toMatchObject({ tone: 'error', message: 'Не удалось прочитать NFC-метку', hint: holdStillHint });
  expect(state.vibrate).toHaveBeenCalledWith(scanVibrationPatterns.readError);
  expect(state.startReader).toHaveBeenCalledTimes(3);
  expect(state.scanNfc).not.toHaveBeenCalled();
  expect(state.log.mock.calls.map(([event]) => [event.eventType, event.payload])).toEqual([
    ['patrol.nfc.read_failed.unreadable_tag', { kind: 'unreadableTag', attempt: 1, retried: true }],
    ['patrol.nfc.read_failed.unreadable_tag', { kind: 'unreadableTag', attempt: 2, retried: true }],
    ['patrol.nfc.read_failed.unreadable_tag', { kind: 'unreadableTag', attempt: 3, retried: false }]
  ]);

  // The reader stays armed; a good read afterwards goes through normally.
  state.codes = ['04A1B2C3'];
  state.scanNfc.mockResolvedValue({ matched: true, point: { ...gate, status: 'scanned' } });
  await tapTag();
  expect(state.router.replace).toHaveBeenCalledWith('/patrol/assignment/a1/point/gate/fill');
});

it('NFC: a half-read tag whose UID matches nothing is re-read instead of being called foreign', async () => {
  vi.useFakeTimers();
  state.codes = ['04D4E5F6'];
  state.incomplete = true;
  state.scanNfc.mockResolvedValue({ matched: false, scannedCode: '04D4E5F6' });
  await mount(ScanNfcScreen);

  await tapTag();
  expect(scanMessage()).toMatchObject({ tone: 'neutral' });
  expect(scanMessage().message).toContain('читаем ещё раз');
  expect(state.vibrate).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });

  // The same tag comes back within the 2 s duplicate window; it is read again, not ignored.
  state.incomplete = false;
  state.codes = ['POINT-7', '04D4E5F6'];
  state.scanNfc.mockResolvedValue({ matched: true, point: { ...gate, status: 'scanned' } });
  await tapTag();
  expect(state.scanNfc).toHaveBeenLastCalledWith('a1', ['POINT-7', '04D4E5F6']);
  expect(state.router.replace).toHaveBeenCalledWith('/patrol/assignment/a1/point/gate/fill');
  expect(loggedTypes()).toEqual(['patrol.nfc.read_failed.tag_lost']);
});

it('NFC: a half-read tag whose UID is a route point is accepted at once', async () => {
  state.incomplete = true;
  state.scanNfc.mockResolvedValue({ matched: true, point: { ...gate, status: 'scanned' } });
  await mount(ScanNfcScreen);
  await tapTag();
  expect(state.router.replace).toHaveBeenCalledWith('/patrol/assignment/a1/point/gate/fill');
  expect(loggedTypes()).toEqual([]);
});

it('NFC: a silent re-read with no tag left in the field falls back to the normal prompt', async () => {
  vi.useFakeTimers();
  state.codes = [];
  await mount(ScanNfcScreen);
  await tapTag();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(scanMessage()).toMatchObject({ scanning: true });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(scanMessage().message).toBe('Поднесите телефон к NFC-метке');
});

it('NFC: a failing reader start is retried with backoff, then offers "Повторить"', async () => {
  vi.useFakeTimers();
  state.startReader.mockRejectedValue(new Error('android.nfc.TagLostException'));
  await mount(ScanNfcScreen);
  expect(button('Повторить')).toBeUndefined();
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(state.startReader).toHaveBeenCalledTimes(3);
  expect(scanMessage()).toMatchObject({ tone: 'error', message: 'Не удалось включить сканирование NFC' });
  expect(scanMessage().message + scanMessage().hint).not.toContain('TagLostException');
  expect(loggedTypes()).toEqual(['patrol.nfc.reader_start_failed', 'patrol.nfc.reader_start_failed', 'patrol.nfc.reader_start_failed']);

  state.startReader.mockResolvedValue(async () => undefined);
  await act(async () => button('Повторить')!.props.onPress());
  expect(state.startReader).toHaveBeenCalledTimes(4);
  expect(scanMessage()).toMatchObject({ scanning: true });
  expect(button('Повторить')).toBeUndefined();
});

it('NFC: leaving the screen cancels a pending re-read', async () => {
  vi.useFakeTimers();
  state.codes = [];
  await mount(ScanNfcScreen);
  await tapTag();
  await act(async () => state.blur());
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(state.startReader).toHaveBeenCalledTimes(1);
});

it('QR: success, wrong point and unknown codes each get their own vibration and never confirm a wrong point', async () => {
  await mount(ScanQrScreen);
  const camera = () => screen!.root.findByType('CameraView' as any);

  state.scanQr.mockRejectedValueOnce(pointOrderError());
  state.owner.mockResolvedValueOnce({ kind: 'routePoint', point: store });
  await act(async () => camera().props.onBarcodeScanned({ data: 'qr-store' }));
  expect(scanMessage()).toMatchObject({ tone: 'error', message: 'Это QR-код точки 2 «Склад». Сначала нужна точка 1 «Ворота»' });
  expect(state.vibrate).toHaveBeenLastCalledWith(scanVibrationPatterns.wrongTag);
  expect(button('Перейти к точке 1')).toBeDefined();
  expect(state.router.replace).not.toHaveBeenCalled();

  await act(async () => button('Сканировать снова')!.props.onPress());
  expect(button('Перейти к точке 1')).toBeUndefined();
  state.scanQr.mockResolvedValueOnce({ matched: false });
  await act(async () => camera().props.onBarcodeScanned({ data: 'qr-unknown' }));
  expect(scanMessage().message).toBe('Этот QR-код не найден в маршрутах на телефоне');
  expect(loggedTypes()).toEqual(['patrol.qr.match_failed.wrong_order', 'patrol.qr.match_failed.unknown_tag']);

  await act(async () => button('Сканировать снова')!.props.onPress());
  state.scanQr.mockResolvedValueOnce({ matched: true, point: { ...gate, status: 'scanned' } });
  await act(async () => camera().props.onBarcodeScanned({ data: 'qr-gate' }));
  expect(state.vibrate).toHaveBeenLastCalledWith(scanVibrationPatterns.success);
  expect(state.router.replace).toHaveBeenCalledWith('/patrol/assignment/a1/point/gate/fill');
});

it('QR: an already completed point is reported instead of reopening its form', async () => {
  state.scanQr.mockResolvedValue({ matched: true, alreadyCompleted: true, point: { ...gate, status: 'ok' } });
  await mount(ScanQrScreen);
  await act(async () => screen!.root.findByType('CameraView' as any).props.onBarcodeScanned({ data: 'qr-gate' }));
  expect(scanMessage()).toMatchObject({ tone: 'neutral', message: 'Точка 1 «Ворота» уже заполнена' });
  expect(state.vibrate).toHaveBeenCalledWith(scanVibrationPatterns.notice);
  expect(state.router.replace).not.toHaveBeenCalled();
  await act(async () => button('Открыть точку 1')!.props.onPress());
  expect(state.router.push).toHaveBeenCalledWith('/patrol/assignment/a1/point/gate');
});

it('NFC guard: a second tag while the first is being checked is ignored, and the lock is released after an error', async () => {
  let resolve!: (value: unknown) => void;
  state.scanNfc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(ScanNfcScreen);
  await act(async () => { void latestOnTag()({}); });
  state.codes = ['04A1B2C3'];
  await tapTag();
  expect(state.scanNfc).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ matched: false }));

  state.scanNfc.mockRejectedValueOnce(new Error('База данных занята'));
  state.codes = ['FFFF0001'];
  await tapTag();
  expect(scanMessage()).toMatchObject({ tone: 'error', message: 'База данных занята' });
  state.codes = ['FFFF0002'];
  state.scanNfc.mockResolvedValueOnce({ matched: true, point: { ...gate, status: 'scanned' } });
  await tapTag();
  expect(state.scanNfc).toHaveBeenCalledTimes(3);
  expect(state.router.replace).toHaveBeenCalledWith('/patrol/assignment/a1/point/gate/fill');
});

it('NFC guard: the same tag within 2 seconds is checked once, and again after the window', async () => {
  vi.useFakeTimers();
  state.scanNfc.mockResolvedValue({ matched: false });
  await mount(ScanNfcScreen);
  await tapTag();
  await tapTag();
  expect(state.scanNfc).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
  await tapTag();
  expect(state.scanNfc).toHaveBeenCalledTimes(2);
});

it('NFC: an empty route snapshot never arms the reader and offers a route refresh', async () => {
  const points = state.points;
  state.points = [];
  try {
    await mount(ScanNfcScreen);
    expect(state.startReader).not.toHaveBeenCalled();
    expect(scanMessage().message).toBe('Точки маршрута ещё не загружены');
    expect(button('Обновить маршрут')).toBeDefined();
  } finally { state.points = points; }
});

it.each([
  [ScanNfcScreen, 'patrol-scan-nfc'],
  [ScanQrScreen, 'patrol-scan-qr']
] as const)('keeps the screen awake only while the scanner is focused (%#)', async (component, tag) => {
  await mount(component);
  expect(state.activate).toHaveBeenCalledWith(tag);
  expect(state.deactivate).not.toHaveBeenCalled();
  await act(async () => state.blur());
  expect(state.deactivate).toHaveBeenCalledWith(tag);
});

it('releases the keep-awake lock on unmount, and a failing lock does not break scanning', async () => {
  state.activate.mockRejectedValue(new Error('No current activity'));
  state.deactivate.mockRejectedValue(new Error('No current activity'));
  await mount(ScanNfcScreen);
  expect(scanMessage()).toMatchObject({ scanning: true });
  await act(async () => screen!.unmount());
  screen = undefined;
  expect(state.deactivate).toHaveBeenCalledWith('patrol-scan-nfc');
});

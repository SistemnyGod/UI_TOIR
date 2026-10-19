import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  assignment: { status: 'inProgress', routeName: 'Обход печей' },
  dimensions: { width: 360, fontScale: 1 },
  scope: { ownerUserId: 'a', contourId: 'local', generation: 1 },
  points: [{ pointId: 'p1', name: '930 Э', orderIndex: 1, status: 'pending' }, { pointId: 'p2', name: 'Следующая', orderIndex: 2, status: 'ok' }],
  scanQr: vi.fn(),
  scanNfc: vi.fn(),
  blur: undefined as (() => void) | undefined,
  assertOwner: vi.fn(),
  startReader: vi.fn(),
  stopReader: vi.fn(),
  nfcLookup: vi.fn(),
  enabledLookup: vi.fn(),
  syncEvent: undefined as undefined | ((event: any) => void),
  nfcSupported: false, nfcEnabled: true,
  adapterChange: undefined as undefined | ((enabled: boolean) => void),
  appChange: undefined as undefined | ((status: string) => void),
  openNfcSettings: vi.fn(),
  refreshMobile: vi.fn(),
  cameraPermission: true,
  qrFallbackEnabled: true
}));

vi.mock('expo-router', async () => {
  const R = await import('react');
  return {
    useRouter: () => state.router,
    useLocalSearchParams: () => ({ assignmentId: 'a1' }),
    useFocusEffect: (cb: () => (() => void) | undefined) => R.useEffect(() => {
      const cleanup = cb(); state.blur = cleanup; return cleanup;
    }, [cb])
  };
});
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (s: any) => s },
  useWindowDimensions: () => state.dimensions,
  AppState: { currentState: 'active', addEventListener: (_: string, listener: (status: string) => void) => { state.appChange = listener; return { remove: vi.fn() }; } },
  Vibration: { vibrate: vi.fn() }
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-camera', () => ({ CameraView: 'CameraView' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'a' }));
vi.mock('@/core/environments', () => ({ currentContourId: 'local' }));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => state.scope, assertDataOwnerContext: state.assertOwner }));
vi.mock('@/services/cameraService', () => ({ ensureCameraPermission: async () => state.cameraPermission }));
vi.mock('@/services/qrScannerService', () => ({ createQrScanResult: (value: string) => ({ qrCodeHash: value }) }));
vi.mock('@/services/nfcService', () => ({
  getNfcCodes: () => ['nfc-code'], initializeNfc: state.nfcLookup, isNfcEnabled: state.enabledLookup,
  openNfcSettings: state.openNfcSettings, subscribeNfcAdapterState: (callback: (enabled: boolean) => void) => { state.adapterChange = callback; return () => { state.adapterChange = undefined; }; },
  startNfcReaderSession: state.startReader, stopNfcReaderSession: state.stopReader
}));
vi.mock('@/sync/PatrolSyncCoordinator', () => ({ requestPatrolSync: vi.fn() }));
vi.mock('@/sync/syncTriggers', () => ({ requestMobileDataRefresh: state.refreshMobile }));
vi.mock('@/sync/syncEvents', () => ({ shouldReloadAssignmentAfterSync: () => true, subscribeToSyncEvents: (callback: (event: any) => void) => { state.syncEvent = callback; return () => { state.syncEvent = undefined; }; } }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/db/repositories/patrolContextRepository', () => ({ getPatrolDeviceContext: async () => null }));
vi.mock('@/db/repositories/filesRepository', () => ({ listPointFiles: async () => [] }));
vi.mock('@/db/repositories/patrolRepository', () => ({
  getAssignmentById: async () => state.assignment,
  listAssignmentPoints: async () => state.points,
  getAssignmentScanPolicy: async () => ({ qrFallbackEnabled: state.qrFallbackEnabled, nfcEnabled: true }),
  pauseAssignmentLocally: vi.fn(), scanPointByNfc: state.scanNfc, scanPointByQr: state.scanQr,
  getActiveAssignment: async () => state.assignment,
  getReportReadiness: async () => ({ ready: false, problems: [{ pointId: 'p1', reason: 'Добавьте обязательное фото' }] }),
  assertPointCanBeOpened: async () => state.points[0], getPointForFill: async () => state.points[0], listMissingCompleteAssignmentAttachmentIds: async () => []
}));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/SelectionTabs', async () => { const R = await import('react'); return {
  SelectionTabs: 'SelectionTabs', SelectionTransition: (p: any) => R.createElement(R.Fragment, null, p.children)
}; });
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return {
  Screen: (p: any) => R.createElement('Screen', p, p.children, p.bottomAction),
  ScreenList: (p: any) => R.createElement('ScreenList', p, p.headerContent, ...p.data.map((item: any, index: number) => R.createElement(R.Fragment, { key: item.pointId }, p.renderItem({ item, index }))), p.bottomAction)
}; });

import { ScanNfcScreen } from '@/features/patrol/ScanNfcScreen';
import { ScanQrScreen } from '@/features/patrol/ScanQrScreen';
import { ScanActionBar } from '@/features/patrol/ScanActionBar';
vi.mock('@/features/patrol/ScanPulse', () => ({ ScanPulse: 'ScanPulse' }));
import { ScanMessage, ScanProgress } from '@/features/patrol/ScanPresentation';
import { AllPointsScreen } from '@/features/allPoints/AllPointsScreen';
import { PointDetailScreen } from '@/features/patrol/PointDetailScreen';

let screen: ReactTestRenderer | undefined;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  state.nfcEnabled = true; state.openNfcSettings.mockResolvedValue(undefined);
  state.points = [{ pointId: 'p1', name: '930 Э', orderIndex: 1, status: 'pending' }, { pointId: 'p2', name: 'Следующая', orderIndex: 2, status: 'ok' }];
  state.assignment.status = 'inProgress'; state.dimensions.fontScale = 1; state.cameraPermission = true;
  state.assertOwner.mockResolvedValue(undefined); state.nfcSupported = false; state.qrFallbackEnabled = true;
  state.nfcLookup.mockImplementation(async () => ({ supported: state.nfcSupported, enabled: state.nfcEnabled }));
  state.enabledLookup.mockImplementation(async () => state.nfcEnabled);
});
afterEach(async () => { if (screen) await act(() => screen?.unmount()); screen = undefined; });
const mount = async (component: React.ComponentType) => { await act(async () => { screen = create(React.createElement(component)); }); };
const presses = () => screen!.root.findAllByType('Pressable' as any);
const press = (label: string) => presses().find(n => n.props.accessibilityLabel === label)!;

it.each([ScanNfcScreen, ScanQrScreen])('scanner keeps one visible set of actions and the same count/next point', async component => {
  await mount(component);
  expect(screen!.root.findByType(ScanProgress).props).toMatchObject({ completed: 1, total: 2, nextPoint: state.points[0] });
  expect(screen!.root.findByType('Screen' as any).props).toMatchObject({ compactHeader: true, title: '', bottomActionBackground: 'transparent' });
  expect(screen!.root.findByType(ScanProgress).props.routeName).toBe('Обход печей');
  expect(presses().filter(n => n.props.accessibilityLabel === 'Все метки')).toHaveLength(1);
  const menu = screen!.root.findByType('ActionSheet' as any).props.actions;
  expect(menu.some((item: any) => /Посмотреть точки|Все метки|Метка недоступна/.test(item.label))).toBe(false);
  await act(async () => press('Метка недоступна').props.onPress());
  expect(state.router.push).toHaveBeenCalledWith('/patrol/assignment/a1/point/p1/fill?manual=1');
});

it.each([ScanNfcScreen, ScanQrScreen])('scanner hides manual inspection for a completed assignment', async component => {
  state.assignment.status = 'completedServer'; await mount(component);
  expect(press('Метка недоступна')).toBeUndefined();
  expect(screen!.root.findByType('ActionSheet' as any).props.actions.some((item: any) => item.label === 'Приостановить')).toBe(false);
});

it('NFC menu offers QR only when the route allows fallback', async () => {
  state.qrFallbackEnabled = false; await mount(ScanNfcScreen);
  expect(screen!.root.findByType('ActionSheet' as any).props.actions.some((item: any) => item.label === 'QR')).toBe(false);
});

it('large font stacks the two actions, leaving a separate 48 dp menu target', async () => {
  state.dimensions.fontScale = 2;
  await act(async () => { screen = create(React.createElement(ScanActionBar, { onPoints: vi.fn(), onManual: vi.fn(), onMore: vi.fn() })); });
  const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
  expect(flatten(press('Все метки').parent!.props.style).flexDirection).toBe('column');
  const menuStyle = flatten(press('Ещё: действия с обходом').props.style);
  expect(menuStyle.width).toBeGreaterThanOrEqual(48); expect(menuStyle.height).toBeGreaterThanOrEqual(48);
  expect(menuStyle.alignSelf).toBe('flex-end');
});

it('late QR result after blur cannot navigate and camera stops rendering', async () => {
  let resolve!: (value: any) => void;
  state.scanQr.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  await mount(ScanQrScreen);
  await act(async () => { screen!.root.findByType('CameraView' as any).props.onBarcodeScanned({ data: 'qr-code' }); });
  await act(async () => state.blur?.());
  expect(screen!.root.findAllByType('CameraView' as any)).toHaveLength(0);
  await act(async () => resolve({ matched: true, point: { pointId: 'p1' } }));
  expect(state.router.replace).not.toHaveBeenCalled();
});

it('late NFC result after blur does not navigate or stop a replacement reader', async () => {
  state.nfcSupported = true;
  let resolve!: (value: any) => void;
  state.scanNfc.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  await mount(ScanNfcScreen);
  const onTag = state.startReader.mock.calls[0][0];
  await act(async () => { void onTag({}); });
  await act(async () => state.blur?.());
  const stops = state.stopReader.mock.calls.length;
  await act(async () => resolve({ matched: true, point: { pointId: 'p1' } }));
  expect(state.router.replace).not.toHaveBeenCalled();
  expect(state.stopReader).toHaveBeenCalledTimes(stops);
});

it('late QR result after account change cannot navigate', async () => {
  state.scanQr.mockResolvedValue({ matched: true, point: { pointId: 'p1' } });
  await mount(ScanQrScreen);
  state.assertOwner.mockRejectedValue(new Error('Сессия изменилась'));
  await act(async () => screen!.root.findByType('CameraView' as any).props.onBarcodeScanned({ data: 'qr-code' }));
  expect(state.router.replace).not.toHaveBeenCalled();
  expect(screen!.root.findByType('PrimaryButton' as any).props.label).toBe('Сканировать снова');
});

it('camera permission denial keeps a permission action and the manual/list actions accessible', async () => {
  state.cameraPermission = false; await mount(ScanQrScreen);
  expect(screen!.root.findAllByType('CameraView' as any)).toHaveLength(0);
  expect(screen!.root.findByType('PrimaryButton' as any).props.label).toBe('Разрешить камеру');
  expect(press('Все метки')).toBeDefined(); expect(press('Метка недоступна')).toBeDefined();
});

it('point list puts status and readiness reason below the name and keeps attention navigation', async () => {
  await mount(AllPointsScreen);
  const textNodes = screen!.root.findAllByType('Text' as any);
  expect(textNodes.some(n => n.children.some(c => typeof c === 'string' && c.includes('%')))).toBe(false);
  const title = textNodes.find(n => n.children.includes('930 Э'))!;
  expect(title.parent!.findByType('StatusPill' as any).props.label).toBe('Не заполнено');
  expect(title.parent!.findAllByType('Text' as any).some(n => n.children.includes('Добавьте обязательное фото'))).toBe(true);
  await act(async () => screen!.root.findByType('SelectionTabs' as any).props.onChange('attention'));
  expect(screen!.root.findByType('ScreenList' as any).props.data.map((p: any) => p.pointId)).toEqual(['p1']);
  await act(async () => presses().find(n => n.props.accessibilityHint === 'Открыть точку 930 Э')!.props.onPress());
  expect(state.router.push).toHaveBeenCalledWith('/patrol/assignment/a1/point/p1/fill');
});

it('point delivery updates reload cached data without scheduling another network refresh', async () => {
  await mount(PointDetailScreen);
  expect(state.refreshMobile).toHaveBeenCalledTimes(1);
  await act(async () => state.syncEvent?.({}));
  await act(async () => state.syncEvent?.({}));
  expect(state.refreshMobile).toHaveBeenCalledTimes(1);
});

it('NFC animates only with an active reader; adapter off is red and offers settings', async () => {
  state.nfcSupported = true;
  await mount(ScanNfcScreen);
  expect(screen!.root.findByType(ScanMessage).props.scanning).toBe(true);
  await act(async () => { state.nfcEnabled = false; state.adapterChange?.(false); });
  expect(screen!.root.findByType(ScanMessage).props).toMatchObject({ scanning: false, tone: 'error' });
  expect(screen!.root.findByType(ScanMessage).props.message).toContain('Включите NFC');
  await act(async () => screen!.root.findByType('PrimaryButton' as any).props.onPress());
  expect(state.openNfcSettings).toHaveBeenCalledTimes(1);
  await act(async () => { state.nfcEnabled = true; state.adapterChange?.(true); });
  expect(screen!.root.findByType(ScanMessage).props.scanning).toBe(true);
  await act(async () => state.appChange?.('background'));
  expect(screen!.root.findByType(ScanMessage).props.scanning).toBe(false);
  await act(async () => state.appChange?.('active'));
  expect(screen!.root.findByType(ScanMessage).props.scanning).toBe(true);
  await act(async () => state.blur?.());
  expect(screen!.root.findByType(ScanMessage).props.scanning).toBe(false);
});
it('disabled NFC on opening never starts a reader and offers an enable hint', async () => {
  state.nfcSupported = true; state.nfcEnabled = false;
  await mount(ScanNfcScreen);
  expect(state.startReader).not.toHaveBeenCalled();
  expect(screen!.root.findByType(ScanMessage).props).toMatchObject({ tone: 'error', scanning: false });
});

it('retains an enable event received while the initial disabled lookup is pending', async () => {
  state.nfcSupported = true; state.nfcEnabled = false;
  let resolve!: (result: { supported: boolean; enabled: boolean }) => void;
  state.nfcLookup.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(ScanNfcScreen);
  await act(async () => { state.nfcEnabled = true; state.adapterChange?.(true); });
  await act(async () => resolve({ supported: true, enabled: false }));
  expect(state.startReader).toHaveBeenCalledTimes(1);
  expect(screen!.root.findByType(ScanMessage).props.scanning).toBe(true);
});

it('detects enabling NFC without a native broadcast and stops polling on blur', async () => {
  vi.useFakeTimers();
  try {
    state.nfcSupported = true; state.nfcEnabled = false;
    await mount(ScanNfcScreen);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(state.startReader).not.toHaveBeenCalled();
    state.nfcEnabled = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(state.startReader).toHaveBeenCalledTimes(1);
    expect(screen!.root.findByType(ScanMessage).props.scanning).toBe(true);
    await act(async () => state.blur?.());
    const lookups = state.enabledLookup.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(state.enabledLookup).toHaveBeenCalledTimes(lookups);
  } finally { vi.useRealTimers(); }
});

it('repeated ON and route refresh events keep the active reader running', async () => {
  state.nfcSupported = true;
  await mount(ScanNfcScreen);
  await act(async () => { state.adapterChange?.(true); state.adapterChange?.(true); state.syncEvent?.({}); });
  expect(state.startReader).toHaveBeenCalledTimes(1);
  expect(screen!.root.findByType(ScanMessage).props.scanning).toBe(true);
  state.assignment.status = 'cancelledServer';
  await act(async () => state.syncEvent?.({}));
  expect(screen!.root.findByType(ScanMessage).props.scanning).toBe(false);
  expect(state.stopReader).toHaveBeenCalled();
});

it('turning NFC off during a slow reader start cannot publish a reading state', async () => {
  state.nfcSupported = true;
  let resolve!: (stop: () => Promise<void>) => void;
  const stopOwn = vi.fn(async () => undefined);
  state.startReader.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(ScanNfcScreen);
  await act(async () => { state.nfcEnabled = false; state.adapterChange?.(false); });
  await act(async () => resolve(stopOwn));
  expect(stopOwn).toHaveBeenCalledTimes(1);
  expect(screen!.root.findByType(ScanMessage).props.message).toContain('Включите NFC');
  expect(screen!.root.findByType(ScanMessage).props.scanning).toBe(false);
});
it('completed points and completed assignments do not start scanning', async () => {
  state.nfcSupported = true; state.points = state.points.map(p => ({ ...p, status: 'ok' }));
  await mount(ScanNfcScreen);
  expect(state.startReader).not.toHaveBeenCalled();
  expect(screen!.root.findByType(ScanMessage).props).toMatchObject({ tone: 'success', scanning: false });
});
it('NFC pulse stops while a detected tag is being checked', async () => {
  state.nfcSupported = true;
  let resolve!: (value: any) => void;
  state.scanNfc.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  await mount(ScanNfcScreen);
  await act(async () => { void state.startReader.mock.calls[0][0]({}); });
  expect(screen!.root.findByType(ScanMessage).props).toMatchObject({ busy: true, scanning: false });
  await act(async () => resolve({ matched: true, point: { pointId: 'p1' } }));
  expect(screen!.root.findByType(ScanMessage).props).toMatchObject({ tone: 'success', scanning: false });
});

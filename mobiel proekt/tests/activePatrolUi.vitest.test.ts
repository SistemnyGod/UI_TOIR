import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The active patrol screen: the main action follows the route progress, a failing read or
// report check never leaves the loader on screen, and start/resume runs once per tap burst.
const state = vi.hoisted(() => ({
  owner: 'a', assignment: vi.fn(), progress: vi.fn(), enter: vi.fn(), reconcile: vi.fn(), sync: vi.fn(), log: vi.fn(),
  push: vi.fn(), replace: vi.fn(), syncListener: null as null | ((event: any) => void), Stale: class extends Error {}
}));
vi.mock('expo-router', async () => { const R = await import('react'); return {
  useFocusEffect: (cb: () => (() => void) | void) => R.useEffect(() => cb(), [cb]),
  useLocalSearchParams: () => ({ assignmentId: 'one' }), useRouter: () => ({ push: state.push, replace: state.replace })
}; });
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (s: any) => s } }));
vi.mock('@/features/patrol/AutoSubmitCountdown', () => ({ AutoSubmitCountdown: () => null }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/auth/dataOwnerContext', () => ({ StaleDataOwnerContextError: state.Stale,
  captureDataOwnerContext: async () => ({ ownerUserId: state.owner, contourId: 'test', generation: 1 }),
  assertDataOwnerContext: async () => undefined
}));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => state.owner }));
vi.mock('@/db/repositories/patrolRepository', () => ({ getAssignmentById: state.assignment, getAssignmentProgress: state.progress,
  getAssignmentScanPolicy: async () => ({ nfcEnabled: true, qrFallbackEnabled: false }), pauseAssignmentLocally: vi.fn()
}));
vi.mock('@/services/patrolEntryService', () => ({ enterPatrolRequest: state.enter }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: state.log }));
vi.mock('@/sync/syncTriggers', () => ({ requestMobileDataRefresh: vi.fn() }));
vi.mock('@/sync/syncEngine', () => ({ reconcileAcceptedCompleteReports: state.reconcile }));
vi.mock('@/sync/PatrolSyncCoordinator', () => ({ requestPatrolSync: state.sync }));
vi.mock('@/sync/syncEvents', () => ({ subscribeToSyncEvents: (listener: (event: any) => void) => { state.syncListener = listener; return () => { state.syncListener = null; }; } }));
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return { Screen: (p: any) => R.createElement('Screen', p, p.children, p.bottomAction) }; });
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
import { ActivePatrolScreen } from '@/features/patrol/ActivePatrolScreen';

let screen: ReactTestRenderer | undefined;
const assignment = (status = 'inProgress') => ({ assignmentId: 'one', requestId: 'request-one', routeName: 'Обход печей', status });
const progress = (completed: number, total = 2) => ({ total, completed, inspected: completed, deferred: 0, issues: 0, skipped: 0 });
const text = () => screen!.root.findAllByType('Text' as any).map(node => node.children.filter(child => typeof child === 'string').join('')).join(' ');
const button = (label: string) => screen!.root.findAllByType('PrimaryButton' as any).find(node => node.props.label === label);
const mount = async () => { await act(async () => { screen = create(React.createElement(ActivePatrolScreen)); }); };
const syncEvent = { acceptedOperationIds: [], completedAssignmentIds: [], snapshotRefreshed: true };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); state.owner = 'a';
  state.assignment.mockResolvedValue(assignment()); state.progress.mockResolvedValue(progress(1));
  state.reconcile.mockResolvedValue(undefined); state.sync.mockResolvedValue(undefined);
});
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });

it('a route with every point filled offers the report; an unfinished one offers the scanner', async () => {
  await mount();
  await act(async () => button('Сканировать NFC')!.props.onPress());
  expect(state.push).toHaveBeenLastCalledWith('/patrol/assignment/one/scan-nfc');

  state.progress.mockResolvedValue(progress(2));
  await act(async () => state.syncListener!(syncEvent));
  await act(async () => button('Отправить отчёт')!.props.onPress());
  expect(state.push).toHaveBeenLastCalledWith('/patrol/assignment/one/submit');
});

it('an empty route snapshot cannot be reviewed or scanned yet', async () => {
  state.progress.mockResolvedValue(progress(0, 0));
  await mount();
  expect(button('Загружаем метки маршрута')!.props.disabled).toBe(true);
  expect(button('Отправить отчёт')).toBeUndefined();
  for (const link of screen!.root.findAllByType('Pressable' as any)) await act(async () => link.props.onPress?.());
  expect(state.push).not.toHaveBeenCalledWith('/patrol/assignment/one/submit');
});

it('a failing first read ends the loader with an error and a retry that recovers', async () => {
  state.assignment.mockRejectedValueOnce(new Error('SQLite занята'));
  await mount();
  expect(text()).not.toContain('Загрузка...');
  expect(text()).toContain('SQLite занята');
  await act(async () => button('Повторить загрузку')!.props.onPress());
  expect(text()).toContain('Обход печей');
});

it('a failing reload after a sync event keeps the loaded patrol on screen', async () => {
  await mount();
  state.assignment.mockRejectedValueOnce(new Error('Не удалось прочитать обход'));
  await act(async () => state.syncListener!(syncEvent));
  expect(text()).toContain('Обход печей');
  expect(text()).not.toContain('Загрузка...');
  expect(state.log).toHaveBeenCalledWith('patrol.active-load.failed', expect.any(Error));
});

it('a failing delivery check of a completed report keeps the report on screen and still requests a sync', async () => {
  state.assignment.mockResolvedValue(assignment('completedLocal'));
  state.reconcile.mockRejectedValueOnce(new Error('Проверка доставки не удалась'));
  await mount();
  expect(button('Повторить отправку')).toBeDefined();
  expect(state.sync).toHaveBeenCalledWith({ mode: 'normal' });
  expect(state.log).toHaveBeenCalledWith('patrol.active-reconcile.failed', expect.any(Error));
});

it('a burst of taps on resume enters the patrol once', async () => {
  state.assignment.mockResolvedValue(assignment('paused'));
  let finish!: (path: string) => void;
  state.enter.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await mount();
  const resume = button('Продолжить обход')!;
  await act(async () => { resume.props.onPress(); resume.props.onPress(); resume.props.onPress(); });
  expect(state.enter).toHaveBeenCalledOnce();
  await act(async () => finish('/patrol/assignment/one/scan-nfc'));
  expect(state.replace).toHaveBeenCalledExactlyOnceWith('/patrol/assignment/one/scan-nfc');
});

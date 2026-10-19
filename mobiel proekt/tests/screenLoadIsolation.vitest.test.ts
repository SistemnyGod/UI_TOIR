import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ owner: 'a', focused: true, assignmentId: 'one', assignment: vi.fn(), queue: vi.fn(), Stale: class extends Error {} }));
vi.mock('expo-router', async () => { const R = await import('react'); return {
  useFocusEffect: (cb: () => (() => void) | void) => R.useEffect(() => state.focused ? cb() : undefined, [cb, state.focused]),
  useLocalSearchParams: () => ({ assignmentId: state.assignmentId }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}; });
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (s: any) => s } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/features/patrol/AutoSubmitCountdown', () => ({ AutoSubmitCountdown: () => null }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/auth/dataOwnerContext', () => ({ StaleDataOwnerContextError: state.Stale,
  captureDataOwnerContext: async () => ({ ownerUserId: state.owner, contourId: 'test', generation: 1 }),
  assertDataOwnerContext: async (scope: any) => { if (scope.ownerUserId !== state.owner) throw new state.Stale('stale'); }
}));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => state.owner }));
vi.mock('@/db/repositories/patrolRepository', () => ({ getAssignmentById: state.assignment,
  getAssignmentProgress: async () => ({ total: 1, completed: 0, inspected: 0, deferred: 0, issues: 0, skipped: 0 }),
  getAssignmentScanPolicy: async () => ({ nfcEnabled: true, qrFallbackEnabled: false }), pauseAssignmentLocally: vi.fn()
}));
vi.mock('@/db/repositories/outboxRepository', () => ({ listSyncQueueCommands: state.queue }));
vi.mock('@/db/repositories/filesRepository', () => ({ listSyncQueueFiles: async () => [] }));
vi.mock('@/services/patrolEntryService', () => ({ enterPatrolRequest: vi.fn() }));
vi.mock('@/services/patrolContinuationService', () => ({ continuePatrolWithReconciliation: vi.fn() }));
vi.mock('@/services/conflictResolutionService', () => ({ acceptServerConflict: vi.fn(), canAcceptServerConflict: () => false, cancelRejectedCommand: vi.fn(), retryConflictWithLatestRevision: vi.fn(), sendConflictToDispatcher: vi.fn() }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/sync/syncTriggers', () => ({ requestMobileDataRefresh: vi.fn(), triggerForegroundSyncWithRetry: vi.fn() }));
vi.mock('@/sync/syncEngine', () => ({ reconcileAcceptedCompleteReports: vi.fn() }));
vi.mock('@/sync/PatrolSyncCoordinator', () => ({ requestPatrolSync: vi.fn() }));
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return { Screen: 'Screen',
  ScreenList: (p: any) => R.createElement('ScreenList', null, p.headerContent, ...(p.data ?? []).map((item: any, index: number) => R.createElement(R.Fragment, { key: p.keyExtractor(item, index) }, p.renderItem({ item, index })))) }; });
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
import { ActivePatrolScreen } from '@/features/patrol/ActivePatrolScreen';
import { SyncQueueScreen } from '@/features/syncQueue/SyncQueueScreen';
import { emitSyncEvent } from '@/sync/syncEvents';
let screen: ReactTestRenderer | undefined;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const assignment = (id: string) => ({ assignmentId: id, routeName: 'Route ' + id, status: 'inProgress' });
const command = (id: string) => ({ clientOperationId: id, commandType: 'completePatrolAssignment', status: 'pending', assignmentRouteName: id });
const emit = () => emitSyncEvent({ acceptedOperationIds: [], completedAssignmentIds: [], snapshotRefreshed: true });
const text = () => screen!.root.findAllByType('Text' as any).map(node => node.children.filter(child => typeof child === 'string').join('')).join(' ');
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); state.owner = 'a'; state.focused = true; state.assignmentId = 'one';
  state.assignment.mockImplementation(async id => assignment(id)); state.queue.mockResolvedValue([command('saved')]);
});
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });
it('the active route ignores a late result from a previous route parameter', async () => {
  const slow = deferred<any>(); state.assignment.mockReturnValueOnce(slow.promise);
  await act(async () => { screen = create(React.createElement(ActivePatrolScreen)); });
  state.assignmentId = 'two'; await act(async () => screen!.update(React.createElement(ActivePatrolScreen)));
  expect(text()).toContain('Route two');
  await act(async () => slow.resolve(assignment('one')));
  expect(text()).toContain('Route two'); expect(text()).not.toContain('Route one');
});
it('the queue coalesces sync events silently and rejects an old owner snapshot', async () => {
  await act(async () => { screen = create(React.createElement(SyncQueueScreen)); });
  const slow = deferred<any[]>(); state.queue.mockReturnValueOnce(slow.promise);
  await act(async () => emit());
  await act(async () => { for (let i = 0; i < 50; i++) emit(); });
  expect(state.queue).toHaveBeenCalledTimes(2); expect(text()).toContain('saved');
  expect(screen!.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
  state.owner = 'b'; state.queue.mockResolvedValue([command('new owner')]);
  await act(async () => slow.resolve([command('old private data')]));
  expect(state.queue).toHaveBeenCalledTimes(3); expect(text()).toContain('new owner');
  expect(text()).not.toContain('old private data');
});
it('a blurred queue cannot apply an in-flight response on return', async () => {
  const slow = deferred<any[]>(); state.queue.mockReturnValueOnce(slow.promise);
  await act(async () => { screen = create(React.createElement(SyncQueueScreen)); });
  state.focused = false; await act(async () => screen!.update(React.createElement(SyncQueueScreen)));
  state.focused = true; await act(async () => screen!.update(React.createElement(SyncQueueScreen)));
  await act(async () => slow.resolve([command('stale blurred queue')]));
  expect(text()).toContain('saved'); expect(text()).not.toContain('stale blurred queue');
});

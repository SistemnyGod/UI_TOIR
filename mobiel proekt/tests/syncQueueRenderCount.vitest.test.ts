import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ commands: [] as any[], timelineRenders: 0, sync: vi.fn(), router: { push: () => undefined }, theme: { colors: {} } }));
vi.mock('react-native', () => ({ Text: 'Text', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (x: any) => x } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-router', async () => { const R = await import('react'); return { useRouter: () => s.router, useFocusEffect: (fn: any) => R.useEffect(fn, [fn]) }; });
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => s.theme }));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => ({ ownerUserId: 'owner', contourId: 'test', generation: 1 }), assertDataOwnerContext: async () => {}, StaleDataOwnerContextError: class extends Error {} }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'owner' }));
// Every read returns fresh objects, like a real SQLite read.
vi.mock('@/db/repositories/outboxRepository', () => ({ listSyncQueueCommands: async () => s.commands.map(command => ({ ...command })) }));
vi.mock('@/db/repositories/filesRepository', () => ({ listSyncQueueFiles: async () => [], retryFailedFileUpload: vi.fn() }));
vi.mock('@/sync/syncTriggers', () => ({ requestMobileDataRefresh: vi.fn(), triggerForegroundSyncWithRetry: s.sync }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/patrolContinuationService', () => ({ continuePatrolWithReconciliation: vi.fn() }));
vi.mock('@/services/conflictResolutionService', () => ({ acceptServerConflict: vi.fn(), canAcceptServerConflict: () => true, cancelRejectedCommand: vi.fn(), retryConflictWithLatestRevision: vi.fn(), sendConflictToDispatcher: vi.fn() }));
vi.mock('@/features/syncQueue/QueueDeliveryTimeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/syncQueue/QueueDeliveryTimeline')>();
  return { ...actual, QueueIconTile: () => null, QueueDeliveryTimeline: () => { s.timelineRenders += 1; return null; } };
});
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return { Screen: 'Screen',
  ScreenList: (p: any) => R.createElement('ScreenList', null, p.headerContent, ...(p.data ?? []).map((item: any, index: number) => R.createElement(R.Fragment, { key: p.keyExtractor(item, index) }, p.renderItem({ item, index })))) }; });
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
import { SyncQueueScreen } from '@/features/syncQueue/SyncQueueScreen';
import { emitSyncEvent } from '@/sync/syncEvents';

const ROWS = 40;
let screen: ReactTestRenderer;
const emit = () => emitSyncEvent({ acceptedOperationIds: [], completedAssignmentIds: [] });
const renders = async (step: () => unknown) => { const before = s.timelineRenders; await act(async () => { await step(); }); return s.timelineRenders - before; };
const button = (label: string) => screen.root.findAllByType('PrimaryButton' as any).find(node => node.props.label === label);
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  s.timelineRenders = 0; s.sync.mockReset().mockResolvedValue({ skipped: null });
  s.commands = Array.from({ length: ROWS }, (_, index) => ({ clientOperationId: `op-${index}`, commandType: 'markPatrolPointOk', entityType: 'patrolPoint', entityLocalId: `p-${index}`, status: 'retryLater', resolutionStatus: null, sourceAssignmentId: null, attemptCount: 1, createdAtLocal: '2026-10-19T00:00:00Z', lastAttemptAt: null, nextAttemptAt: null, assignmentRouteName: 'Помол', lastError: `Ошибка ${index}` }));
});
afterEach(async () => { await act(() => screen?.unmount()); });

it('a long queue re-renders only the rows whose data or row state changed', async () => {
  const mounted = await renders(() => { screen = create(React.createElement(SyncQueueScreen)); });
  const unchangedSync = await renders(() => emit());
  s.commands[3] = { ...s.commands[3], attemptCount: 2 };
  const oneRowChanged = await renders(() => emit());
  const expandError = await renders(() => screen.root.findAllByProps({ accessibilityLabel: 'Показать описание ошибки полностью' })[0].props.onPress());
  const manualSend = await renders(() => button('Отправить сейчас')!.props.onPress());
  console.info(`[syncQueue render counts, ${ROWS} rows] mount=${mounted} unchangedSync=${unchangedSync} oneRowChanged=${oneRowChanged} expandError=${expandError} manualSend=${manualSend}`);
  expect(mounted).toBe(ROWS);
  expect(unchangedSync).toBe(0);
  expect(oneRowChanged).toBe(1);
  expect(expandError).toBe(1);
  expect(manualSend).toBe(0);
});

import { SyncQueueScreen } from '@/features/syncQueue/SyncQueueScreen';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ canAccept: vi.fn(), sync: vi.fn(), accept: vi.fn(), cancel: vi.fn(), retryFile: vi.fn(), commands: [] as any[], files: [] as any[] }));
vi.mock('react-native', () => ({ Text: 'Text', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (x: any) => x } }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-router', async () => { const R = await import('react'); return { useRouter: () => ({ push: vi.fn() }), useFocusEffect: (fn: any) => R.useEffect(fn, [fn]) }; });
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: { backgroundAccent: 'accent-bg', text: 'text', mutedText: 'muted', warningSurface: 'warn-bg', warning: 'warn', dangerSurface: 'danger-bg', danger: 'danger', primary: 'primary', border: 'border' } }) }));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => ({ ownerUserId: 'owner', contourId: 'test', generation: 1 }), assertDataOwnerContext: async () => {}, StaleDataOwnerContextError: class extends Error {} }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'owner' }));
vi.mock('@/db/repositories/outboxRepository', () => ({ listSyncQueueCommands: async () => s.commands }));
vi.mock('@/db/repositories/filesRepository', () => ({ listSyncQueueFiles: async () => s.files, retryFailedFileUpload: s.retryFile }));
vi.mock('@/sync/syncTriggers', () => ({ requestMobileDataRefresh: vi.fn(), triggerForegroundSyncWithRetry: s.sync }));
vi.mock('@/sync/syncEvents', () => ({ subscribeToSyncEvents: () => () => {} }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/patrolContinuationService', () => ({ continuePatrolWithReconciliation: vi.fn() }));
vi.mock('@/services/conflictResolutionService', () => ({ acceptServerConflict: s.accept, canAcceptServerConflict: s.canAccept, cancelRejectedCommand: s.cancel, retryConflictWithLatestRevision: vi.fn(), sendConflictToDispatcher: vi.fn() }));
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/Screen', () => ({ Screen: 'Screen' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
let screen: ReactTestRenderer;
const base = { attemptCount: 1, createdAtLocal: '2026-10-19T00:00:00Z', lastAttemptAt: null, nextAttemptAt: null, resolutionStatus: null, sourceAssignmentId: null };
const button = (label: string) => screen.root.findAllByType('PrimaryButton' as any).find(node => node.props.label === label);
const sheet = () => screen.root.findByType('ActionSheet' as any);
const texts = () => screen.root.findAllByType('Text' as any).flatMap(node => node.children).filter(child => typeof child === 'string').join('\n');
const mount = async () => { await act(async () => { screen = create(React.createElement(SyncQueueScreen)); }); };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  s.sync.mockReset().mockResolvedValue({ skipped: null }); s.accept.mockReset().mockResolvedValue(undefined); s.cancel.mockReset().mockResolvedValue(undefined); s.retryFile.mockReset().mockResolvedValue({ reactivatedCommands: 1 });
  s.canAccept.mockReset().mockReturnValue(true);
  s.commands = []; s.files = [];
});
afterEach(async () => { await act(() => screen?.unmount()); });

it('accepting the server state needs an explicit confirmation that names what will be lost', async () => {
  s.commands = [{ ...base, clientOperationId: 'op-1', commandType: 'startPatrolAssignment', entityType: 'patrolAssignment', entityLocalId: 'a-1', status: 'conflict', assignmentRouteName: 'Помол' }];
  await mount();
  await act(async () => button('Принять состояние сервера')!.props.onPress());
  expect(s.accept).not.toHaveBeenCalled();
  expect(sheet().props.visible).toBe(true);
  expect(sheet().props.message).toContain('«Начало обхода» (Помол)');
  expect(sheet().props.message).toContain('будут потеряны');
  const keep = sheet().props.actions.find((action: any) => action.label === 'Оставить как есть');
  await act(async () => { sheet().props.onClose(); keep.onPress(); });
  expect(s.accept).not.toHaveBeenCalled(); expect(sheet().props.visible).toBe(false);
  await act(async () => button('Принять состояние сервера')!.props.onPress());
  const confirm = sheet().props.actions.find((action: any) => action.danger);
  await act(async () => { sheet().props.onClose(); confirm.onPress(); });
  expect(s.accept).toHaveBeenCalledOnce();
});

it('cancelling a rejected local action is confirmed first', async () => {
  s.commands = [{ ...base, clientOperationId: 'op-2', commandType: 'createShiftRemark', entityType: 'shiftRemark', entityLocalId: 'r-1', status: 'rejected', assignmentRouteName: null }];
  await mount();
  await act(async () => button('Отменить локальное действие')!.props.onPress());
  expect(s.cancel).not.toHaveBeenCalled();
  expect(sheet().props.title).toBe('Отменить локальное действие?');
  await act(async () => sheet().props.actions.find((action: any) => action.danger).onPress());
  expect(s.cancel).toHaveBeenCalledOnce();
});

it('shows readable names instead of raw identifiers', async () => {
  s.commands = [{ ...base, clientOperationId: '7f1c2d3e-op', commandType: 'switchPatrolAssignment', entityType: 'patrolAssignment', entityLocalId: '9a8b7c6d-assignment', status: 'rejected', assignmentRouteName: null, sourceAssignmentId: 'src' }];
  s.files = [{ ...base, clientFileId: 'file-uuid', localPath: 'file:///data/user/0/cache/abc.jpg', status: 'retryLater', mediaKind: 'photo', assignmentId: 'a-uuid', pointId: 'p-uuid', pointName: 'Насосная 2', assignmentRouteName: 'Помол' }];
  await mount();
  const visible = texts();
  expect(visible).not.toMatch(/7f1c2d3e-op|9a8b7c6d-assignment|abc\.jpg|p-uuid|a-uuid/);
  expect(visible).toContain('Переход на другой обход');
  expect(visible).toContain('Помол · Насосная 2');
  expect(button('Продолжить новый обход')).toBeDefined();
  expect(button('Продолжить B')).toBeUndefined();
});

it('a failed attachment offers a real retry that requeues it and starts delivery', async () => {
  s.files = [{ ...base, clientFileId: 'file-1', localPath: 'file:///x.jpg', status: 'failed', mediaKind: 'photo', assignmentId: null, pointId: null, pointName: null, assignmentRouteName: '', lastError: 'gave up' }];
  await mount();
  const retry = button('Повторить загрузку');
  expect(retry).toBeDefined();
  await act(async () => { retry!.props.onPress(); retry!.props.onPress(); });
  expect(s.retryFile).toHaveBeenCalledExactlyOnceWith('owner', 'file-1');
  expect(s.sync).toHaveBeenCalledExactlyOnceWith({ mode: 'manualAll' });
});

it('queue tiles take their colours from the theme', async () => {
  s.files = [{ ...base, clientFileId: 'file-1', localPath: 'file:///x.jpg', status: 'failed', mediaKind: 'photo', assignmentId: null, pointId: null, pointName: null, assignmentRouteName: '', lastError: 'gave up' }];
  await mount();
  const metaViews = screen.root.findAllByType('View' as any).filter(node => Array.isArray(node.props.style) && node.props.style.some((style: any) => style?.backgroundColor === 'accent-bg'));
  expect(metaViews.length).toBeGreaterThan(0);
  const error = screen.root.findAllByType('Text' as any).find(node => node.children.includes('gave up'))!;
  expect(error.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: 'warn-bg', color: 'warn' })]));
});

it('offers the server state only for conflicts the conflict service says it can resolve', async () => {
  s.canAccept.mockImplementation((command: any) => command.entityType === 'patrolAssignment');
  s.commands = [{ ...base, clientOperationId: 'point-op', commandType: 'savePatrolPointResult', entityType: 'patrolPoint', entityLocalId: 'p-1', status: 'conflict', assignmentRouteName: 'Помол' }];
  await mount();
  expect(s.canAccept).toHaveBeenCalledWith(expect.objectContaining({ clientOperationId: 'point-op' }));
  expect(button('Принять состояние сервера')).toBeUndefined();
  expect(button('Передать диспетчеру')).toBeDefined();
});

it('labels a report by its route and counts only real problems as needing a check', async () => {
  s.commands = [
    { ...base, clientOperationId: 'report', commandType: 'completePatrolAssignment', entityType: 'patrolAssignment', entityLocalId: 'a-1', status: 'retryLater', lastError: 'Сервер не ответил', assignmentRouteName: 'Помол' },
    { ...base, clientOperationId: 'start', commandType: 'startPatrolAssignment', entityType: 'patrolAssignment', entityLocalId: 'a-2', status: 'pending', lastError: 'Временная ошибка', assignmentRouteName: 'Дробление' }
  ];
  await mount();
  const visible = texts();
  expect(visible).toMatch(/Отчёт\s+Помол/);
  expect(visible).toMatch(/Маршрут\s+Дробление/);
  expect(visible).not.toContain('Требуют проверки');

  s.commands = [{ ...s.commands[0], status: 'rejected' }];
  await act(async () => screen.unmount());
  await mount();
  expect(texts()).toMatch(/Требуют проверки:\s*1\b/);
});

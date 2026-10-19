import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { compareRequestDatesNewestFirst } from '@/features/patrol/requestDateOrder';
import { retainEqualItems } from '@/sync/retainEqualItems';
import { preservesItemOrder } from '@/ui/useStableListAnchor';

const state = vi.hoisted(() => ({ rows: [] as any[], listeners: new Set<(event: any) => void>(), read: vi.fn(), refresh: vi.fn(), scroll: vi.fn() }));
vi.mock('expo-router', async () => {
  const R = await import('react'); const router = { push: vi.fn() };
  return { useRouter: () => router, useLocalSearchParams: () => ({}), useFocusEffect: (cb: () => (() => void) | void) => R.useEffect(cb, [cb]) };
});
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', StyleSheet: { create: (s: any) => s } }));
vi.mock('@/ui/TextField', () => ({ TextField: 'TextInput' }));
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusMessage', () => ({ StatusMessage: 'StatusMessage' }));
vi.mock('@/ui/TransientNotice', () => ({ TransientNotice: 'TransientNotice' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/SelectionTabs', () => ({ SelectionTabs: 'SelectionTabs' }));
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return {
  ScreenList: (p: any) => { p.listRef.current = { scrollToOffset: state.scroll }; return R.createElement('ScreenList', p, p.headerContent); }
}; });
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => ({ ownerUserId: 'owner', contourId: 'test', generation: 1 }), assertDataOwnerContext: vi.fn() }));
vi.mock('@/db/repositories/patrolContextRepository', () => ({ getPatrolDeviceContext: async () => ({ assignmentId: null }) }));
vi.mock('@/db/repositories/patrolRepository', () => ({ listRequestBoard: state.read, getAssignmentById: vi.fn(), getAssignmentProgress: vi.fn() }));
vi.mock('@/services/mobileDataRefreshService', () => ({ refreshMobileData: state.refresh }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/patrolEntryService', () => ({ enterPatrolRequest: vi.fn() }));
vi.mock('@/sync/syncTriggers', () => ({ requestMobileDataRefresh: vi.fn() }));
vi.mock('@/sync/syncEvents', () => ({ subscribeToSyncEvents: (callback: (event: any) => void) => { state.listeners.add(callback); return () => state.listeners.delete(callback); } }));

import { RequestBoardScreen } from '@/features/patrol/RequestBoardScreen';
it('a refresh failure produces one dismissible notice without duplicating it in the list', async () => {
  await act(async () => { screen = create(React.createElement(RequestBoardScreen)); });
  state.refresh.mockRejectedValueOnce(new Error('Сбой синхронизации'));
  await act(async () => list().props.onRefresh());
  expect(list().props.floatingNotice.props.message).toBe('Сбой синхронизации');
  expect(screen!.root.findAllByType('Text' as any).some(node => node.children.includes('Сбой синхронизации'))).toBe(false);
  expect(list().props.ListEmptyComponent.props.children[0].props.children).toBe('В этой вкладке пока пусто');
});
let screen: ReactTestRenderer | undefined;
const list = () => screen!.root.findByType('ScreenList' as any);
const emit = () => state.listeners.forEach(listener => listener({ acceptedOperationIds: [], completedAssignmentIds: [], refreshedZones: ['requests'] }));
const item = (requestId: string, date: string, status = 'available', name = 'Александров') => ({ requestId, plannedStartAt: date, routeName: 'Маршрут', assignedFullName: name, status });
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); state.rows = [item('old', '2026-09-01T00:00:00Z', 'inProgress'), item('new', '2026-09-30T00:00:00Z', 'available', 'Яковлев')];
  state.read.mockImplementation(async () => state.rows); state.refresh.mockResolvedValue(true);
});
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });

it('sorts requests by actual date descending, ignoring names/status and placing invalid dates last', () => {
  const rows = [item('invalid', ''), item('early', '2026-09-30T11:00:00+05:00'), item('late', '2026-09-30T08:00:00Z')];
  expect(rows.sort(compareRequestDatesNewestFirst).map(row => row.requestId)).toEqual(['late', 'early', 'invalid']);
});
it('reuses unchanged snapshots and rows while replacing changed values', () => {
  const before = [{ id: '1', value: 1 }, { id: '2', value: 2 }];
  expect(retainEqualItems(before, structuredClone(before), row => row.id)).toBe(before);
  const after = retainEqualItems(before, [{ id: 'new', value: 0 }, { id: '1', value: 1 }, { id: '2', value: 3 }], row => row.id);
  expect(after[1]).toBe(before[0]); expect(after[2]).not.toBe(before[1]); expect(before[1].value).toBe(2);
});
it('anchors prepends and removals but disables native anchoring for reordering/filter changes', () => {
  expect(preservesItemOrder([], ['first'])).toBe(false);
  expect(preservesItemOrder(['last'], [])).toBe(false);
  expect(preservesItemOrder(['a', 'b'], ['new', 'a', 'b'])).toBe(true);
  expect(preservesItemOrder(['a', 'b', 'c'], ['a', 'c'])).toBe(true);
  expect(preservesItemOrder(['a', 'b'], ['b', 'a'])).toBe(false);
  expect(preservesItemOrder(['a', 'b'], ['other-tab'])).toBe(false);
});
it('background reads preserve search, scroll and rows without turning on pull-to-refresh', async () => {
  await act(async () => { screen = create(React.createElement(RequestBoardScreen)); });
  expect(list().props.data.map((row: any) => row.requestId)).toEqual(['new', 'old']);
  await act(async () => screen!.root.findByType('TextInput' as any).props.onChangeText('Маршрут'));
  await act(async () => list().props.onContentSizeChange());
  await act(async () => list().props.onScroll({ nativeEvent: { contentOffset: { y: 560 } } }));
  state.scroll.mockClear();
  const data = list().props.data;
  state.rows = structuredClone(state.rows);
  await act(async () => emit());
  expect(list().props.data).toBe(data);
  expect(list().props.refreshing).toBe(false);
  expect(screen!.root.findByType('TextInput' as any).props.value).toBe('Маршрут');
  expect(state.scroll).not.toHaveBeenCalled();
  state.rows.push(item('newest', '2026-10-01T00:00:00Z'));
  await act(async () => emit());
  expect(list().props.data.map((row: any) => row.requestId)).toEqual(['newest', 'new', 'old']);
  expect(list().props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  expect(state.scroll).not.toHaveBeenCalled();
});

it('an obsolete local read cannot replace the result of a newer refresh', async () => {
  await act(async () => { screen = create(React.createElement(RequestBoardScreen)); });
  let releaseOld!: (rows: any[]) => void;
  let releaseNew!: (rows: any[]) => void;
  state.read.mockReturnValueOnce(new Promise(resolve => { releaseOld = resolve; }));
  state.read.mockReturnValueOnce(new Promise(resolve => { releaseNew = resolve; }));
  await act(async () => emit());
  await act(async () => emit());
  await act(async () => releaseNew([item('latest', '2026-10-01T00:00:00Z')]));
  expect(list().props.data.map((row: any) => row.requestId)).toEqual(['latest']);
  await act(async () => releaseOld([item('stale', '2026-09-01T00:00:00Z')]));
  expect(list().props.data.map((row: any) => row.requestId)).toEqual(['latest']);
});

it('manual pull-to-refresh starts immediately, prevents duplicate requests and survives a background event', async () => {
  await act(async () => { screen = create(React.createElement(RequestBoardScreen)); });
  let release!: (updated: boolean) => void;
  state.refresh.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  await act(async () => { list().props.onRefresh(); list().props.onRefresh(); });
  expect(list().props.refreshing).toBe(true);
  expect(state.refresh).toHaveBeenCalledTimes(1);
  await act(async () => emit());
  expect(list().props.refreshing).toBe(true);
  await act(async () => release(true));
  expect(list().props.refreshing).toBe(false);
});

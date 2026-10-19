import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ focused: true, rows: [] as any[], read: vi.fn(), fetch: vi.fn(), event: null as null | ((event: any) => void) }));
vi.mock('expo-router', async () => { const R = await import('react'); return { useFocusEffect: (cb: () => (() => void) | void) => R.useEffect(() => state.focused ? cb() : undefined, [cb, state.focused]) }; });
vi.mock('@/db/repositories/patrolReportRepository', () => ({
  getReportScope: async () => ({ ownerUserId: 'owner', contourId: 'test' }),
  listPatrolReports: state.read, fetchPatrolReportPage: state.fetch
}));
vi.mock('@/sync/syncEvents', () => ({ subscribeToSyncEvents: (cb: (event: any) => void) => { state.event = cb; return () => { state.event = null; }; } }));
import { usePatrolReports } from '@/features/patrol/usePatrolReports';
let screen: ReactTestRenderer;
let feed: ReturnType<typeof usePatrolReports>;
function Harness() { feed = usePatrolReports(); return null; }
const deferred = <T,>() => { let resolve!: (result: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); state.focused = true;
  state.rows = [{ assignmentId: 'report', routeName: 'Маршрут' }];
  state.read.mockImplementation(async () => ({ rows: structuredClone(state.rows), hasMore: false }));
  state.fetch.mockResolvedValue({ items: [], hasMore: false, page: 1, cursor: null });
});
afterEach(async () => { if (screen) await act(() => screen.unmount()); });
const emit = () => state.event?.({ acceptedOperationIds: [], completedAssignmentIds: [], deliveryChangedAssignmentIds: ['report'] });
it('delivery events update rows silently and retain an identical snapshot', async () => {
  await act(async () => { screen = create(React.createElement(Harness)); });
  const original = feed.rows;
  const pending = deferred<any>(); state.read.mockReturnValueOnce(pending.promise);
  await act(async () => emit());
  expect(feed.busy).toBe(false); expect(feed.rows).toBe(original);
  await act(async () => pending.resolve({ rows: structuredClone(state.rows), hasMore: false }));
  expect(feed.rows).toBe(original);
});
it('retains an event arriving during a slow local read and executes a queued manual refresh', async () => {
  await act(async () => { screen = create(React.createElement(Harness)); });
  const pending = deferred<any>(); state.read.mockReturnValueOnce(pending.promise);
  await act(async () => emit());
  state.rows.push({ assignmentId: 'new-report', routeName: 'Новый маршрут' });
  await act(async () => { emit(); feed.refresh(); });
  const requests = state.fetch.mock.calls.length;
  await act(async () => pending.resolve({ rows: [{ assignmentId: 'report', routeName: 'Маршрут' }], hasMore: false }));
  expect(feed.rows.map(row => row.assignmentId)).toEqual(['report', 'new-report']);
  expect(state.fetch).toHaveBeenCalledTimes(requests + 1);
  expect(feed.busy).toBe(false);
});

it('keeps the old history boundary after a burst larger than the visible window', async () => {
  state.rows = Array.from({ length: 75 }, (_, i) => ({ assignmentId: 'old-' + i, routeName: 'Маршрут',
    completedAt: new Date(Date.UTC(2026, 8, 30) - i * 1000).toISOString() }));
  state.read.mockImplementation(async (_scope, limit) => ({ rows: structuredClone(state.rows.slice(0, limit)), hasMore: state.rows.length > limit }));
  await act(async () => { screen = create(React.createElement(Harness)); });
  await act(async () => feed.loadMore());
  const original = feed.rows.map(row => row.assignmentId);
  state.rows.unshift(...Array.from({ length: 80 }, (_, i) => ({ assignmentId: 'new-' + i, routeName: 'Новое',
    completedAt: new Date(Date.UTC(2026, 9, 1) - i * 1000).toISOString() })));
  await act(async () => emit());
  expect(original.every(id => feed.rows.some(row => row.assignmentId === id))).toBe(true);
  expect(new Set(feed.rows.map(row => row.assignmentId)).size).toBe(feed.rows.length);
  expect(feed.busy).toBe(false); expect(feed.hasMore).toBe(true);
});

it.each([false, true])('revisiting reports keeps the snapshot without a loading flash (empty=%s)', async (empty) => {
  if (empty) state.rows = [];
  await act(async () => { screen = create(React.createElement(Harness)); });
  const original = feed.rows;
  state.focused = false;
  await act(async () => screen.update(React.createElement(Harness)));
  const pending = deferred<any>(); state.fetch.mockReturnValueOnce(pending.promise);
  state.focused = true;
  await act(async () => screen.update(React.createElement(Harness)));
  expect(feed.rows).toBe(original); expect(feed.busy).toBe(false);
  await act(async () => pending.resolve({ items: [], hasMore: false, page: 1, cursor: null }));
  expect(feed.rows).toBe(original);
});

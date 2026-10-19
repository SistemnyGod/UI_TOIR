import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Row render counts for the two long lists. A background sync pass reloads the
// list from SQLite; only rows whose data changed may render again.
const s = vi.hoisted(() => ({
  rowRenders: 0,
  listener: null as null | ((event: unknown) => void),
  points: [] as Array<Record<string, unknown>>,
  requests: [] as Array<Record<string, unknown>>,
  listProps: null as null | Record<string, unknown>
}));

vi.mock('expo-router', async () => {
  const R = await import('react');
  const router = { push: vi.fn(), replace: vi.fn() };
  return { useFocusEffect: (effect: () => void) => R.useEffect(effect, [effect]), useRouter: () => router, useLocalSearchParams: () => ({ assignmentId: 'a-1' }) };
});
vi.mock('react-native', () => ({ Text: 'Text', View: 'View', Pressable: 'Pressable', FlatList: 'FlatList', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@/ui/Screen', async () => {
  const R = await import('react');
  return {
    ScreenList: (p: any) => {
      s.listProps = p;
      return R.createElement('ScreenList', null, p.headerContent,
        p.data?.map((item: any, index: number) => R.createElement(R.Fragment, { key: p.keyExtractor(item, index) }, p.renderItem({ item, index }))));
    }
  };
});
vi.mock('@/ui/StatusPill', () => ({ StatusPill: () => { s.rowRenders += 1; return null; } }));
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/SelectionTabs', () => ({ SelectionTabs: 'SelectionTabs' }));
vi.mock('@/ui/TextField', () => ({ TextField: 'TextInput' }));
vi.mock('@/ui/TransientNotice', () => ({ TransientNotice: 'TransientNotice' }));
vi.mock('@/ui/GradientFill', () => ({ GradientFill: 'GradientFill' }));
vi.mock('@/ui/RingChart', () => ({ RingChart: 'RingChart' }));
vi.mock('@/ui/EmptyState', () => ({ EmptyState: 'EmptyState' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'owner' }));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => ({ ownerUserId: 'owner', contourId: 'test', generation: 1 }), assertDataOwnerContext: async () => {} }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/services/mobileDataRefreshService', () => ({ refreshMobileData: async () => false }));
vi.mock('@/services/patrolEntryService', () => ({ enterPatrolRequest: vi.fn() }));
vi.mock('@/sync/syncTriggers', () => ({ requestMobileDataRefresh: vi.fn() }));
vi.mock('@/sync/useSmoothRefreshIndicator', () => ({ useSmoothRefreshIndicator: () => ({ beginRefresh: vi.fn(), endRefresh: vi.fn(), isRefreshing: false }) }));
vi.mock('@/sync/syncEvents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sync/syncEvents')>()),
  subscribeToSyncEvents: (listener: (event: unknown) => void) => { s.listener = listener; return () => { s.listener = null; }; }
}));
vi.mock('@/db/repositories/patrolContextRepository', () => ({ getPatrolDeviceContext: async () => ({ assignmentId: null }) }));
// Every read returns fresh objects, as SQLite does.
const copy = <T,>(rows: T[]) => rows.map(row => ({ ...row }));
vi.mock('@/db/repositories/patrolRepository', () => ({
  listAssignmentPoints: async () => copy(s.points),
  getAssignmentById: async () => ({ assignmentId: 'a-1', status: 'inProgress' }),
  getActiveAssignment: async () => null,
  getAssignmentScanPolicy: async () => ({ nfcEnabled: true, qrFallbackEnabled: true, allowFreeOrder: true }),
  getReportReadiness: async () => ({ ready: false, problems: [{ pointId: 'p-2', pointName: 'Точка 2', orderIndex: 2, reason: 'Нужно фото' }] }),
  listRequestBoard: async () => copy(s.requests),
  getAssignmentProgress: async () => null
}));

import { AllPointsScreen } from '@/features/allPoints/AllPointsScreen';
import { RequestBoardScreen } from '@/features/patrol/RequestBoardScreen';

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
let screen: ReactTestRenderer | undefined;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  s.rowRenders = 0; s.listener = null; s.listProps = null;
  s.points = Array.from({ length: 25 }, (_, i) => ({
    pointId: `p-${i + 1}`, routeId: 'route', name: `Точка ${i + 1}`, description: null, instruction: null, orderIndex: i + 1,
    required: true, requiresPhoto: false, status: i < 5 ? 'ok' : 'pending', comment: null, issueTypeId: null, confirmationType: null, photoClientFileIds: []
  }));
  s.requests = Array.from({ length: 30 }, (_, i) => ({
    requestId: `r-${i + 1}`, displayNumber: String(i + 1), routeId: 'route', routeName: `Маршрут ${i + 1}`,
    plannedStartAt: new Date(Date.UTC(2026, 9, 1) - i * 3_600_000).toISOString(), assignedFullName: 'Иванов', assignedEmployeeId: 'e',
    performerSelectionAvailable: 0, status: 'assigned', revision: 1
  }));
});
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });

describe('row renders after a sync pass', () => {
  it('points: only the changed point renders again', async () => {
    await act(async () => { screen = create(React.createElement(AllPointsScreen)); });
    await settle();
    expect(s.rowRenders).toBeGreaterThanOrEqual(25);

    s.rowRenders = 0;
    await act(async () => s.listener!({ acceptedOperationIds: [], completedAssignmentIds: [], changedAssignmentIds: ['a-1'] }));
    await settle();
    const unchanged = s.rowRenders;

    s.points[7] = { ...s.points[7], status: 'ok' };
    s.rowRenders = 0;
    await act(async () => s.listener!({ acceptedOperationIds: [], completedAssignmentIds: [], changedAssignmentIds: ['a-1'] }));
    await settle();
    const oneChanged = s.rowRenders;
    console.info(`AllPoints rows rendered by a sync pass (25 rows): unchanged data ${unchanged}, one point changed ${oneChanged}`);
    expect(unchanged).toBe(0);
    expect(oneChanged).toBe(1);
    expect(s.listProps).toMatchObject({ initialNumToRender: expect.any(Number), windowSize: expect.any(Number) });
  });

  it('request board: only the changed request renders again', async () => {
    await act(async () => { screen = create(React.createElement(RequestBoardScreen)); });
    await settle();
    expect(s.rowRenders).toBeGreaterThanOrEqual(30);

    s.rowRenders = 0;
    await act(async () => s.listener!({ acceptedOperationIds: [], completedAssignmentIds: [], refreshedZones: ['requests'] }));
    await settle();
    const unchanged = s.rowRenders;

    s.requests[4] = { ...s.requests[4], status: 'accepted' };
    s.rowRenders = 0;
    await act(async () => s.listener!({ acceptedOperationIds: [], completedAssignmentIds: [], refreshedZones: ['requests'] }));
    await settle();
    const oneChanged = s.rowRenders;
    console.info(`RequestBoard rows rendered by a sync pass (30 rows): unchanged data ${unchanged}, one request changed ${oneChanged}`);
    expect(unchanged).toBe(0);
    expect(oneChanged).toBe(1);
    expect(s.listProps).toMatchObject({ initialNumToRender: expect.any(Number), windowSize: expect.any(Number) });
  });
});

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The request card: a background sync re-reads it in place (no loader once shown), only for
// request and active-patrol changes, and a burst of taps on "Начать обход" accepts once.
const state = vi.hoisted(() => ({
  item: vi.fn(), existing: vi.fn(), enter: vi.fn(), replace: vi.fn(), listener: null as null | ((event: any) => void)
}));
vi.mock('expo-router', async () => { const R = await import('react'); return {
  useFocusEffect: (cb: () => (() => void) | void) => R.useEffect(() => cb(), [cb]),
  useLocalSearchParams: () => ({ requestId: 'request-1' }), useRouter: () => ({ replace: state.replace, push: vi.fn() })
}; });
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', Alert: { alert: vi.fn() }, StyleSheet: { create: (s: any) => s } }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => ({ ownerUserId: 'a', contourId: 'test', generation: 1 }), assertDataOwnerContext: async () => undefined }));
vi.mock('@/db/repositories/patrolRepository', () => ({ getRequestBoardItem: state.item, getAssignmentByRequestId: state.existing, releaseAcceptedRequestLocally: vi.fn() }));
vi.mock('@/db/repositories/workTaskRepository', () => ({ listMobileEmployees: async () => [] }));
vi.mock('@/services/patrolEntryService', () => ({ enterPatrolRequest: state.enter }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/sync/syncEvents', () => ({ subscribeToSyncEvents: (listener: (event: any) => void) => { state.listener = listener; return () => { state.listener = null; }; } }));
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return { Screen: (p: any) => R.createElement('Screen', p, p.children, p.bottomAction) }; });
vi.mock('@/ui/Card', () => ({ Card: 'Card' }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusPill', () => ({ StatusPill: 'StatusPill' }));
vi.mock('@/ui/StatusMessage', () => ({ StatusMessage: 'StatusMessage' }));
vi.mock('@/ui/ActionSheet', () => ({ ActionSheet: 'ActionSheet' }));
import { PatrolRequestScreen } from '@/features/patrol/PatrolRequestScreen';

let screen: ReactTestRenderer | undefined;
const request = { requestId: 'request-1', routeName: 'Обход печей', status: 'assigned', plannedStartAt: '2026-10-19T08:00:00Z', assignedEmployeeId: 'e1', assignedFullName: 'Иванов', performerSelectionAvailable: false };
const event = (patch: Record<string, unknown>) => ({ acceptedOperationIds: [], completedAssignmentIds: [], ...patch });
const loaders = () => screen!.root.findAllByType('ActivityIndicator' as any);
const startButton = () => screen!.root.findAllByType('PrimaryButton' as any).find(node => node.props.label === 'Начать обход')!;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks();
  state.item.mockResolvedValue(request); state.existing.mockResolvedValue(null);
});
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });

it('a request or active-patrol refresh re-reads the card in place; other zones are ignored', async () => {
  await act(async () => { screen = create(React.createElement(PatrolRequestScreen)); });
  expect(state.item).toHaveBeenCalledTimes(1);

  await act(async () => state.listener!(event({ refreshedZones: ['workItems', 'notifications'] })));
  expect(state.item).toHaveBeenCalledTimes(1);

  let release!: (value: typeof request) => void;
  state.item.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  await act(async () => state.listener!(event({ refreshedZones: ['activePatrols'] })));
  expect(state.item).toHaveBeenCalledTimes(2);
  // The card stays on screen while the background read runs.
  expect(loaders()).toHaveLength(0);
  expect(startButton()).toBeDefined();
  await act(async () => release({ ...request, routeName: 'Обход склада' }));

  await act(async () => state.listener!(event({ refreshedZones: ['requests'] })));
  expect(state.item).toHaveBeenCalledTimes(3);
  expect(loaders()).toHaveLength(0);
});

it('a burst of taps on start accepts the request once', async () => {
  let finish!: (path: string) => void;
  state.enter.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { screen = create(React.createElement(PatrolRequestScreen)); });
  const start = startButton();
  await act(async () => { start.props.onPress(); start.props.onPress(); start.props.onPress(); });
  expect(state.enter).toHaveBeenCalledOnce();
  await act(async () => finish('/patrol/assignment/a1/scan-nfc'));
  expect(state.replace).toHaveBeenCalledExactlyOnceWith('/patrol/assignment/a1/scan-nfc');
});

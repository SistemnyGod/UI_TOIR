import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ owner: 'a', rows: [] as any[], read: vi.fn(), api: vi.fn(), save: vi.fn(), mark: vi.fn(), localMark: vi.fn(), markAll: vi.fn() }));
vi.mock('expo-router', async () => {
  const R = await import('react'); const router = { push: vi.fn(), back: vi.fn() };
  return { useRouter: () => router, useFocusEffect: (cb: () => (() => void) | void) => R.useEffect(cb, [cb]) };
});
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', Alert: { alert: vi.fn() }, Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({ setNotificationHandler: vi.fn() }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('@/features/settings/themePreference', () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock('@/ui/PrimaryButton', () => ({ PrimaryButton: 'PrimaryButton' }));
vi.mock('@/ui/StatusMessage', () => ({ StatusMessage: 'StatusMessage' }));
vi.mock('@/ui/Screen', async () => { const R = await import('react'); return { ScreenList: (p: any) => R.createElement('ScreenList', p, p.headerContent) }; });
vi.mock('@/auth/deviceRegistration', () => ({ getOrCreateDeviceId: vi.fn() }));
vi.mock('@/auth/tokenStorage', () => ({ getAccessToken: vi.fn() }));
vi.mock('@/auth/dataOwnerContext', () => ({
  captureDataOwnerContext: async () => ({ ownerUserId: state.owner, contourId: 'test', generation: 1 }),
  assertDataOwnerContext: async (context: any) => { if (context.ownerUserId !== state.owner) throw new Error('Stale context'); }
}));
vi.mock('@/api/notificationApi', () => ({ listNotifications: state.api, markNotificationRead: state.mark, registerPushToken: vi.fn() }));
vi.mock('@/db/repositories/notificationRepository', () => ({ listLocalNotifications: state.read, saveNotifications: state.save,
  countUnreadNotifications: async () => state.rows.filter(row => !row.readAt).length, markAllLocalNotificationsRead: state.markAll,
  listPendingNotificationReads: async () => [], markLocalNotificationRead: state.localMark, saveDevicePushToken: vi.fn() }));
import NotificationsRoute from '../app/settings/notifications';
import { emitSyncEvent, subscribeToSyncEvents } from '@/sync/syncEvents';
import { syncMobileNotifications } from '@/services/notificationService';
let screen: ReactTestRenderer | undefined;
const list = () => screen!.root.findByType('ScreenList' as any);
const refreshButton = () => screen!.root.findAllByType('PrimaryButton' as any).find(node => node.props.label === 'Обновить')!;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); state.owner = 'a';
  state.rows = [{ id: '1', title: 'Обход', message: 'Назначен обход', createdAt: '2026-09-30T00:00:00Z', readAt: null }];
  state.read.mockImplementation(async () => structuredClone(state.rows)); state.api.mockResolvedValue(state.rows);
  state.save.mockImplementation(async rows => { state.rows = rows; });
  state.localMark.mockImplementation(async (id, date) => { state.rows = state.rows.map(row => row.id === id ? { ...row, readAt: date } : row); });
});
afterEach(async () => { if (screen) await act(() => screen!.unmount()); screen = undefined; });
it('coalesces concurrent notification sync for the same session', async () => {
  const pending = deferred<any[]>();
  state.api.mockReturnValueOnce(pending.promise);
  const first = syncMobileNotifications();
  const second = syncMobileNotifications();
  await act(async () => {});
  expect(state.api).toHaveBeenCalledOnce();
  await act(async () => { pending.resolve(state.rows); await Promise.all([first, second]); });
  expect(state.save).toHaveBeenCalledOnce();
});
it('a push notification updates the open list without showing a loading state', async () => {
  await act(async () => { screen = create(React.createElement(NotificationsRoute)); });
  const original = list().props.data;
  await act(async () => emitSyncEvent({ acceptedOperationIds: ['unrelated'], completedAssignmentIds: [] }));
  expect(list().props.data).toBe(original);
  const pending = deferred<any[]>(); state.read.mockReturnValueOnce(pending.promise);
  state.api.mockResolvedValue([{ ...state.rows[0], id: '2' }, ...state.rows]);
  await act(async () => { await syncMobileNotifications(); });
  expect(refreshButton().props.loading).toBe(false);
  expect(list().props.data).toBe(original);
  await act(async () => pending.resolve(structuredClone(state.rows)));
  expect(list().props.data.map((row: any) => row.id)).toEqual(['2', '1']);
  expect(list().props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
});
it('does not save or announce a late notification response after an account change', async () => {
  const pending = deferred<any[]>(); state.api.mockReturnValueOnce(pending.promise);
  const event = vi.fn(); const unsubscribe = subscribeToSyncEvents(event);
  try {
    const syncing = syncMobileNotifications();
    await Promise.resolve(); state.owner = 'b'; pending.resolve(state.rows);
    await expect(syncing).rejects.toThrow('Stale context');
    expect(state.save).not.toHaveBeenCalled(); expect(event).not.toHaveBeenCalled();
  } finally { unsubscribe(); }
});

it('opening a notification saves read state immediately even when the acknowledgement is offline', async () => {
  state.mark.mockRejectedValue(new Error('offline'));
  await act(async () => { screen = create(React.createElement(NotificationsRoute)); });
  const rendered = list().props.renderItem({ item: list().props.data[0], index: 0 });
  await act(async () => rendered.props.children[1].props.onPress());
  expect(state.localMark).toHaveBeenCalledOnce();
  expect(state.localMark.mock.calls[0]).toEqual(['1', expect.any(String), true, { ownerUserId: 'a', contourId: 'test', generation: 1 }]);
  expect(list().props.data[0].readAt).toBeTruthy();
});

it('"Прочитать все" appears only with unread rows and reports reads that wait for the network', async () => {
  state.mark.mockRejectedValue(new Error('offline'));
  state.markAll.mockImplementation(async (date: string) => { const ids = state.rows.filter(row => !row.readAt).map(row => row.id); state.rows = state.rows.map(row => ({ ...row, readAt: row.readAt ?? date })); return ids; });
  await act(async () => { screen = create(React.createElement(NotificationsRoute)); });
  const markAllButton = () => screen!.root.findAllByType('PrimaryButton' as any).find(node => String(node.props.label).startsWith('Прочитать все'));
  expect(markAllButton()!.props.label).toBe('Прочитать все (1)');
  await act(async () => { markAllButton()!.props.onPress(); markAllButton()!.props.onPress(); });
  expect(state.markAll).toHaveBeenCalledOnce();
  expect(markAllButton()).toBeUndefined();
  expect(list().props.data[0].readAt).toBeTruthy();
  expect(screen!.root.findAllByType('StatusMessage' as any).map(node => node.props.message))
    .toContain('Отмечено прочитанным на телефоне. Отметка отправится на сервер, когда появится связь.');
});

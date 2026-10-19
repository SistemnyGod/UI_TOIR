import { beforeEach, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  presentation: null as any, receive: null as any, respond: null as any,
  last: vi.fn(), remove: vi.fn()
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({
  setNotificationHandler: (handler: unknown) => { s.presentation = handler; },
  addNotificationReceivedListener: (handler: unknown) => { s.receive = handler; return { remove: s.remove }; },
  addNotificationResponseReceivedListener: (handler: unknown) => { s.respond = handler; return { remove: s.remove }; },
  getLastNotificationResponseAsync: s.last
}));
vi.mock('@/api/notificationApi', () => ({}));
vi.mock('@/auth/deviceRegistration', () => ({}));
vi.mock('@/auth/tokenStorage', () => ({}));
vi.mock('@/auth/dataOwnerContext', () => ({}));
vi.mock('@/db/repositories/notificationRepository', () => ({}));
vi.mock('@/sync/syncEvents', () => ({}));

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); s.last.mockResolvedValue(null);
  await import('@/services/notificationService');
});

const notification = (identifier: string, id: string) => ({ request: {
  identifier, content: { title: 'Обход', body: 'Новая заявка', data: { notificationId: id } }
} });

it('does not present a blank headless message or consume the ID of its local alert', async () => {
  const transport = { request: { identifier: 'remote', content: { title: null, body: null, data: { notificationId: 'id' } } } };
  expect((await s.presentation.handleNotification(transport)).shouldShowBanner).toBe(false);
  expect((await s.presentation.handleNotification(notification('id', 'id'))).shouldShowBanner).toBe(true);
});

it('presents only the first foreground delivery even when FCM message IDs differ', async () => {
  const results = await Promise.all(['fcm-1', 'fcm-2', 'fcm-3'].map(id =>
    s.presentation.handleNotification(notification(id, 'business-id'))));
  expect(results.map(value => value.shouldShowBanner)).toEqual([true, false, false]);
  expect(results.map(value => value.shouldPlaySound)).toEqual([true, false, false]);
  expect((await s.presentation.handleNotification(notification('fcm-4', 'other-id'))).shouldShowBanner).toBe(true);
});

it('does not navigate from a late cold-start response after the subscription closes', async () => {
  let finish!: (response: unknown) => void;
  s.last.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { subscribeToMobilePushEvents } = await import('@/services/notificationService');
  const onNotification = vi.fn(), onNotificationResponse = vi.fn();
  const unsubscribe = subscribeToMobilePushEvents({ onNotification, onNotificationResponse });
  unsubscribe();
  finish({ notification: notification('id', 'id') });
  await Promise.resolve();
  s.receive(); s.respond({ notification: notification('id', 'id') });
  expect(onNotification).not.toHaveBeenCalled();
  expect(onNotificationResponse).not.toHaveBeenCalled();
  expect(s.remove).toHaveBeenCalledTimes(2);
});

it('handles a tap once when both the listener and cold-start response deliver it', async () => {
  const response = { notification: notification('id', 'id') };
  s.last.mockResolvedValue(response);
  const { subscribeToMobilePushEvents } = await import('@/services/notificationService');
  const onNotificationResponse = vi.fn();
  const unsubscribe = subscribeToMobilePushEvents({ onNotification: vi.fn(), onNotificationResponse });
  s.respond(response); await Promise.resolve();
  expect(onNotificationResponse).toHaveBeenCalledOnce();
  unsubscribe();
});

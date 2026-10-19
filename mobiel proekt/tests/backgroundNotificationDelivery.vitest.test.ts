import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({
  handler: null as any, os: 'android', refresh: vi.fn(), show: vi.fn(), presented: vi.fn(), log: vi.fn()
}));
vi.mock('react-native', () => ({ Platform: { get OS() { return s.os; } } }));
vi.mock('expo-task-manager', () => ({ isTaskDefined: () => false, defineTask: (_name: string, handler: unknown) => { s.handler = handler; } }));
vi.mock('expo-notifications', () => ({
  scheduleNotificationAsync: s.show, getPresentedNotificationsAsync: s.presented,
  BackgroundNotificationTaskResult: { NewData: 1, NoData: 2, Failed: 3 }
}));
vi.mock('@/db/database', () => ({ initializeDatabase: async () => {} }));
vi.mock('@/services/mobileDataRefreshService', () => ({ refreshMobileData: s.refresh }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: s.log }));
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); s.os = 'android';
  s.refresh.mockResolvedValue(true); s.show.mockResolvedValue('id'); s.presented.mockResolvedValue([]);
  await import('@/services/backgroundNotificationTask');
});
const push = (payload: Record<string, string>) => ({ data: { notification: null, data: payload } });
const nativePayload = { notificationId: 'request-1', title: 'Назначен обход', message: 'Помол', tag: 'request-1' };
const headlessPayload = { notificationId: 'request-1', alertTitle: 'Назначен обход', alertBody: 'Помол' };
it('does not create a second Android alert when Expo already presents title/message', async () => {
  await s.handler(push(nativePayload)); await s.handler(push(nativePayload)); await s.handler(push(nativePayload));
  expect(s.show).not.toHaveBeenCalled(); expect(s.refresh).toHaveBeenCalledTimes(3);
});
it('supports the old server title/body payload without duplicating the native Android alert', async () => {
  await s.handler(push({ notificationId: 'old', title: 'Обход', body: 'Новая заявка' }));
  expect(s.show).not.toHaveBeenCalled();
});
it('shows a genuinely headless payload before waiting for slow synchronization', async () => {
  let finish!: (value: boolean) => void;
  s.refresh.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const delivery = s.handler(push({ dataString: JSON.stringify(headlessPayload) }));
  await vi.waitFor(() => expect(s.show).toHaveBeenCalledOnce());
  expect(s.show).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'request-1', content: expect.objectContaining({ title: 'Назначен обход', body: 'Помол' }) }));
  finish(true); await delivery;
});
it('concurrent repeated headless deliveries produce one local notification', async () => {
  await Promise.all(Array.from({ length: 3 }, () => s.handler(push(headlessPayload))));
  expect(s.show).toHaveBeenCalledOnce();
});
it('presents a title nested inside headless dataString because it is not a raw FCM title', async () => {
  await s.handler(push({ dataString: JSON.stringify({ notificationId: 'nested', title: 'Обход', body: 'Помол' }) }));
  expect(s.show).toHaveBeenCalledWith(expect.objectContaining({
    identifier: 'nested', content: expect.objectContaining({ title: 'Обход', body: 'Помол' })
  }));
});
it('keeps the first alert when server refresh fails and does not repeat it', async () => {
  s.refresh.mockRejectedValue(new Error('offline'));
  await s.handler(push(headlessPayload)); await s.handler(push(headlessPayload));
  expect(s.show).toHaveBeenCalledOnce();
});
it('retries presentation if the native scheduling call failed', async () => {
  s.show.mockRejectedValueOnce(new Error('native failure'));
  await s.handler(push(headlessPayload)); await s.handler(push(headlessPayload));
  expect(s.show).toHaveBeenCalledTimes(2);
  expect(s.log).toHaveBeenCalledWith('background.notification.presentation.failed', expect.any(Error));
});
it('recognizes an alert still in the native tray after restarting the JS task', async () => {
  s.presented.mockResolvedValue([{ request: { identifier: 'request-1' } }]);
  await s.handler(push(headlessPayload)); expect(s.show).not.toHaveBeenCalled();
});
it('still schedules a valid headless alert when reading the native tray fails', async () => {
  s.presented.mockRejectedValue(new Error('tray unavailable'));
  await s.handler(push(headlessPayload)); expect(s.show).toHaveBeenCalledOnce();
});
it('does not show another local alert for an OS notification or a tap', async () => {
  await s.handler({ data: { notification: { title: 'Обход' }, data: nativePayload } });
  await s.handler({ data: { actionIdentifier: 'open', notification: { request: { content: { data: nativePayload } } } } });
  expect(s.show).not.toHaveBeenCalled();
});
it('does not manufacture notifications for silent or malformed payloads', async () => {
  await s.handler(push({ notificationId: 'sync' })); await s.handler(push({ dataString: '{broken' }));
  expect(s.show).not.toHaveBeenCalled();
});
it('still presents a data-only notification on iOS where Android automatic presentation does not apply', async () => {
  s.os = 'ios'; await s.handler(push(nativePayload)); expect(s.show).toHaveBeenCalledOnce();
});

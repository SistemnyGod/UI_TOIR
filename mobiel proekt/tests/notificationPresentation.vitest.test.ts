import { expect, it } from 'vitest';
import { createNotificationIdWindow, isPresentedByNativeAndroid, readNotificationData } from '@/services/notificationPresentation';

it('reads native dataString and retains fields supplied outside it', () => {
  expect(readNotificationData({ notificationId: 'id', dataString: '{"title":"Обход","body":"Помол","count":3}' }))
    .toMatchObject({ notificationId: 'id', title: 'Обход', body: 'Помол' });
  expect(readNotificationData({ title: 'Обход', dataString: '{broken' })).toMatchObject({ title: 'Обход' });
  expect(readNotificationData(null)).toEqual({});
});

it('bounds callback history without suppressing different notification IDs', () => {
  const window = createNotificationIdWindow(2);
  expect(window.claim('a')).toBe(true);
  expect(window.claim('a')).toBe(false);
  expect(window.claim('b')).toBe(true);
  expect(window.claim('c')).toBe(true);
  expect(window.claim('a')).toBe(true);
  window.release('a');
  expect(window.claim('a')).toBe(true);
});

it('distinguishes Android automatically presented data from headless and iOS data', () => {
  expect(isPresentedByNativeAndroid({ title: 'Обход' }, 'android')).toBe(true);
  expect(isPresentedByNativeAndroid({ message: 'Помол' }, 'android')).toBe(true);
  expect(isPresentedByNativeAndroid({ alertTitle: 'Обход' }, 'android')).toBe(false);
  expect(isPresentedByNativeAndroid({ title: 'Обход' }, 'ios')).toBe(false);
  expect(isPresentedByNativeAndroid({ dataString: '{"title":"Обход"}' }, 'android')).toBe(false);
});

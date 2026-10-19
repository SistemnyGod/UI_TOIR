import { beforeEach, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({ entries: [] as string[], deleted: [] as string[], secureDeleted: [] as string[], notifications: [] as string[] }));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app/files/',
  cacheDirectory: 'file:///app/cache/',
  readDirectoryAsync: vi.fn(async () => s.entries),
  deleteAsync: vi.fn(async (uri: string) => { s.deleted.push(uri); })
}));
vi.mock('expo-secure-store', () => ({ deleteItemAsync: vi.fn(async (key: string) => { s.secureDeleted.push(key); }) }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-notifications', () => ({
  cancelAllScheduledNotificationsAsync: vi.fn(async () => { s.notifications.push('cancelScheduled'); }),
  dismissAllNotificationsAsync: vi.fn(async () => { s.notifications.push('dismissPresented'); }),
  setBadgeCountAsync: vi.fn(async (count: number) => { s.notifications.push(`badge:${count}`); })
}));

import { deleteAccountCacheFiles } from '@/services/fileStorageService';
import { clearAccountNotifications } from '@/services/reportDeliveryNotifications';
import { clearBackgroundSyncState } from '@/sync/backgroundSyncState';
import { clearCrashRecords, readCrashRecords, recordCrash, setCrashRecordStorageForTests } from '@/services/crashRecordStore';

beforeEach(() => { s.entries = []; s.deleted = []; s.secureDeleted = []; s.notifications = []; });

it('deletes camera, picker and HTTP caches but keeps a downloaded update', async () => {
  s.entries = ['ImagePicker', 'ImageManipulator', 'Camera', 'http-cache', 'app-updates'];
  await deleteAccountCacheFiles();
  expect(s.deleted.sort()).toEqual([
    'file:///app/cache/Camera', 'file:///app/cache/ImageManipulator', 'file:///app/cache/ImagePicker', 'file:///app/cache/http-cache'
  ]);
});

it('clears tray notifications, pending reminders, the badge and the sent-notice ledger', async () => {
  await clearAccountNotifications();
  expect(s.notifications.sort()).toEqual(['badge:0', 'cancelScheduled', 'dismissPresented']);
  expect(s.secureDeleted).toEqual(['patrol360.reportDeliveryNotices.v1']);
});

it('forgets background delivery times of the previous account', async () => {
  await clearBackgroundSyncState();
  expect(s.secureDeleted.every(key => key.startsWith('patrol360.backgroundSync.'))).toBe(true);
  expect(s.secureDeleted).toHaveLength(6);
});

it('drops undelivered crash records', () => {
  let text: string | null = null;
  setCrashRecordStorageForTests({ read: () => text, write: value => { text = value; }, remove: () => { text = null; } });
  try {
    recordCrash('js.fatal', new Error('boom'));
    expect(readCrashRecords()).toHaveLength(1);
    clearCrashRecords();
    expect(readCrashRecords()).toEqual([]);
  } finally {
    setCrashRecordStorageForTests(null);
  }
});

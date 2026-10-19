import { beforeEach, expect, it, vi } from 'vitest';

const { s, step } = vi.hoisted(() => {
  const s = { calls: [] as string[], failing: new Set<string>() };
  const step = (name: string) => async (...args: unknown[]) => {
    s.calls.push(args.length ? `${name}:${String(args[0])}` : name);
    if (s.failing.has(name)) throw new Error(`${name} failed`);
  };
  return { s, step };
});
vi.mock('@/db/repositories/bootstrapRepository', () => ({ clearLocalUserData: step('sqlite') }));
vi.mock('@/db/repositories/patrolContextRepository', () => ({ deleteStoredPatrolDeviceContext: step('patrolContext') }));
vi.mock('@/services/crashRecordStore', () => ({ clearCrashRecords: step('crashRecords') }));
vi.mock('@/services/fileStorageService', () => ({ deletePatrolPhotoDirectory: step('photos'), deleteAccountCacheFiles: step('cache') }));
vi.mock('@/services/reportDeliveryNotifications', () => ({ clearAccountNotifications: step('notifications') }));
vi.mock('@/sync/backgroundSyncState', () => ({ clearBackgroundSyncState: step('backgroundSyncState') }));

import { wipeAccountDeviceTraces, wipeSignedOutAccountData } from '@/services/accountDataWipe';

beforeEach(() => { s.calls = []; s.failing.clear(); });

it('wipes SQLite, files, cache, notifications, sync times, crash records and the owner context key', async () => {
  await expect(wipeSignedOutAccountData('alice')).resolves.toEqual([]);
  expect(s.calls.sort()).toEqual([
    'backgroundSyncState', 'cache', 'crashRecords', 'notifications', 'patrolContext:alice', 'photos', 'sqlite'
  ]);
});

it('keeps wiping the rest when one step fails and names the failed steps', async () => {
  s.failing.add('cache'); s.failing.add('notifications');
  await expect(wipeAccountDeviceTraces('alice')).resolves.toEqual(['cache', 'notifications']);
  expect(s.calls).toContain('photos');
  expect(s.calls).toContain('patrolContext:alice');
});

it('still removes files when the SQLite wipe fails, then reports the failure', async () => {
  s.failing.add('sqlite');
  await expect(wipeSignedOutAccountData('alice')).rejects.toThrow('sqlite failed');
  expect(s.calls).toEqual(expect.arrayContaining(['photos', 'cache', 'notifications', 'crashRecords']));
});

it('skips the per-owner key when no owner was stored', async () => {
  await wipeAccountDeviceTraces(null);
  expect(s.calls.some(call => call.startsWith('patrolContext'))).toBe(false);
});

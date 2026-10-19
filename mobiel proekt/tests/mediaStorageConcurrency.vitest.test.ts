import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ active: 0, peak: 0, visited: 0, removed: [] as string[], failCopy: false }));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app/',
  readDirectoryAsync: async () => Array.from({ length: 600 }, (_, i) => `${i}.jpg`),
  getFreeDiskStorageAsync: async () => 1024 ** 3,
  getInfoAsync: async (path: string) => {
    if (path.endsWith('patrol-photos')) return { exists: true };
    s.active++; s.peak = Math.max(s.peak, s.active); s.visited++;
    await Promise.resolve(); s.active--; return { exists: true, size: 10 };
  },
  deleteAsync: async (path: string) => {
    s.active++; s.peak = Math.max(s.peak, s.active); s.removed.push(path);
    await Promise.resolve(); s.active--;
  },
  copyAsync: async () => { if (s.failCopy) throw new Error('disk full'); }
}));
import { deleteOrphanPatrolPhotos, deletePreparedMedia, getLocalMediaStorageAssessment, persistMobileMedia } from '@/services/fileStorageService';
beforeEach(() => { s.active = 0; s.peak = 0; s.visited = 0; s.removed = []; s.failCopy = false; });
it('counts every file while bounding concurrent native metadata requests', async () => {
  expect(await getLocalMediaStorageAssessment()).toMatchObject({ managedBytes: 6000, status: 'ready' });
  expect(s.visited).toBe(600); expect(s.peak).toBeLessThanOrEqual(4);
});
it('reuses a large catalog and adjusts its size after copy and deletion', async () => {
  await getLocalMediaStorageAssessment(); const before = s.visited;
  await Promise.all(Array.from({ length: 20 }, () => getLocalMediaStorageAssessment()));
  expect(s.visited).toBe(before);
  const uri = await persistMobileMedia('file:///temp.jpg', 'fresh', 'jpg');
  expect(await getLocalMediaStorageAssessment()).toMatchObject({ managedBytes: 6010 });
  expect(s.visited - before).toBe(1);
  await deletePreparedMedia(uri);
  expect(await getLocalMediaStorageAssessment()).toMatchObject({ managedBytes: 6000 });
  expect(s.visited - before).toBe(1);
});
it('keeps registered files during bounded orphan cleanup', async () => {
  const known = 'file:///app/patrol-photos/50.jpg';
  await deleteOrphanPatrolPhotos([known]);
  expect(s.removed).toHaveLength(599); expect(s.removed).not.toContain(known); expect(s.peak).toBeLessThanOrEqual(4);
});
it('cleans only the new destination after a failed copy', async () => {
  s.failCopy = true;
  await expect(persistMobileMedia('file:///original.mp4', 'new-id', 'mp4')).rejects.toThrow('disk full');
  expect(s.removed).toEqual(['file:///app/patrol-photos/new-id.mp4']);
});

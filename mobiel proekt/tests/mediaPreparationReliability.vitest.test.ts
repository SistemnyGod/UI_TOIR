import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({ bytes: new Uint8Array([1, 2, 3, 4, 5]), exists: true, shortRead: false, close: vi.fn(), remove: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'media' }));
vi.mock('@/services/fileStorageService', () => ({ deleteOwnedTemporaryMedia: async () => {},
  persistPatrolPhoto: async () => 'saved.jpg', persistMobileMedia: async () => 'saved.mp4',
  getLocalFileInfo: async () => ({ exists: s.exists, size: s.bytes.length }), deletePreparedMedia: s.remove
}));
vi.mock('expo-file-system', () => ({ FileMode: { ReadOnly: 1 }, File: class {
  size = s.bytes.length;
  open() {
    let offset = 0;
    return { size: this.size, close: s.close, readBytes(count: number) {
      if (s.shortRead) return new Uint8Array();
      const bytes = s.bytes.slice(offset, offset + count); offset += bytes.length; return bytes;
    } };
  }
} }));
import { prepareLocalPhoto } from '@/sync/fileUploadQueue';

beforeEach(() => { s.exists = true; s.shortRead = false; s.remove.mockReset().mockResolvedValue(undefined); s.close.mockReset(); });
it('hashes the complete saved file even when picker metadata understates its size', async () => {
  const file = await prepareLocalPhoto({ ownerUserId: 'alice', localPath: 'temp', sizeBytes: 2 });
  expect(file.sizeBytes).toBe(5);
  expect(file.sha256).toBe(createHash('sha256').update(s.bytes).digest('hex'));
  expect(s.close).toHaveBeenCalledOnce(); expect(s.remove).not.toHaveBeenCalled();
});
it('closes the handle and removes the unregistered copy when a progress callback fails', async () => {
  await expect(prepareLocalPhoto({ ownerUserId: 'alice', localPath: 'temp', onProgress: () => { throw new Error('callback'); } })).rejects.toThrow('callback');
  expect(s.close).toHaveBeenCalledOnce(); expect(s.remove).toHaveBeenCalledWith('saved.jpg');
});
it('never registers a short read as a valid file and the next queued preparation still works', async () => {
  s.shortRead = true;
  await expect(prepareLocalPhoto({ ownerUserId: 'alice', localPath: 'temp' })).rejects.toThrow('полностью прочитать');
  expect(s.close).toHaveBeenCalledOnce(); expect(s.remove).toHaveBeenCalledOnce();
  s.shortRead = false;
  await expect(prepareLocalPhoto({ ownerUserId: 'alice', localPath: 'temp' })).resolves.toMatchObject({ sizeBytes: 5 });
});
it('removes a missing or empty copy before opening a hash handle', async () => {
  s.exists = false;
  await expect(prepareLocalPhoto({ ownerUserId: 'alice', localPath: 'temp' })).rejects.toThrow('пуст');
  expect(s.close).not.toHaveBeenCalled(); expect(s.remove).toHaveBeenCalledOnce();
});

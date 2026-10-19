import { expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ pick: vi.fn(), attach: vi.fn(), fail: '', session: 0, flipOnPrepare: false }));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => ({ ownerUserId: 'owner', contourId: 'test', generation: s.session }), assertDataOwnerContext: async (scope: any) => { if (scope.generation !== s.session) throw new Error('Session changed'); } }));
vi.mock('expo-image-picker', () => ({ getMediaLibraryPermissionsAsync: async () => ({ granted: true }), launchImageLibraryAsync: s.pick }));
vi.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async (uri: string) => ({ uri }) }));
vi.mock('expo-file-system/legacy', () => ({}));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'owner' }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/db/repositories/patrolRepository', () => ({ attachPhotoToPoint: s.attach, restoreMissingPointAttachment: vi.fn() }));
vi.mock('@/db/repositories/shiftRemarkRepository', () => ({ attachMediaToShiftRemark: vi.fn() }));
vi.mock('@/db/repositories/workTaskRepository', () => ({ attachMediaToWorkTask: vi.fn() }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/services/fileStorageService', () => ({ deleteOwnedTemporaryMedia: async () => {}, hasEnoughStorageForPhoto: async () => true, assertStorageForMedia: async () => {}, getLocalFileInfo: async () => ({ exists: true, size: 100 }) }));
vi.mock('@/sync/fileUploadQueue', () => {
  const prepare = async (input: any) => {
    input.onProgress?.({ processedBytes: 50, totalBytes: 100, progress: 0.5 });
    if (input.localPath === s.fail) throw new Error('Cannot read file');
    input.onProgress?.({ processedBytes: 100, totalBytes: 100, progress: 1 });
    if (s.flipOnPrepare) s.session++;
    return { clientFileId: input.localPath };
  };
  return { prepareLocalPhoto: prepare, prepareLocalMedia: prepare };
});
import { attachPointMediaFromGallery } from '@/services/mediaAttachmentService';

it('cancelling the picker produces no attachment writes', async () => {
  s.attach.mockClear(); s.session = 0; s.flipOnPrepare = false;
  s.pick.mockResolvedValue({ canceled: true, assets: null });
  const result = await attachPointMediaFromGallery('assignment', 'point');
  expect(result.attachedCount).toBe(0);
  expect(s.attach).not.toHaveBeenCalled();
});

it('failure of the last asset returns the partial result instead of leaving a pending batch', async () => {
  s.attach.mockClear(); s.session = 0; s.flipOnPrepare = false; s.fail = 'bad-last';
  s.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'good', type: 'image' }, { uri: 'bad-last', type: 'video', fileSize: 100 }] });
  const result = await attachPointMediaFromGallery('assignment', 'point');
  expect(result.attachedCount).toBe(1);
  expect(result.errors).toEqual(['Файл 2: Cannot read file']);
});

it('selects mixed multiple assets and reports monotonic batch progress through attachment', async () => {
  s.attach.mockClear(); s.fail = ''; s.session = 0;
  s.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'one', type: 'image' }, { uri: 'two', type: 'video', fileSize: 100 }, { uri: 'three', type: 'image' }] });
  const progress: any[] = [];
  const result = await attachPointMediaFromGallery('assignment', 'point', value => progress.push(value));
  expect(s.pick).toHaveBeenLastCalledWith(expect.objectContaining({ allowsMultipleSelection: true, mediaTypes: ['images', 'videos'] }));
  expect(result).toMatchObject({ attachedCount: 3, photoCount: 2, videoCount: 1, errors: [] });
  expect(s.attach).toHaveBeenCalledTimes(3);
  expect(progress.at(-1)).toMatchObject({ fileIndex: 3, fileCount: 3, progress: 1 });
  expect(progress.every((p, i) => !i || p.progress >= progress[i - 1].progress)).toBe(true);
});

it('keeps successfully attached assets and reports a failed asset separately', async () => {
  s.attach.mockClear(); s.fail = 'bad';
  s.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'one', type: 'image' }, { uri: 'bad', type: 'video', fileSize: 100 }, { uri: 'three', type: 'image' }] });
  const result = await attachPointMediaFromGallery('assignment', 'point');
  expect(result).toMatchObject({ status: 'attached', attachedCount: 2, photoCount: 2, videoCount: 0 });
  expect(result.errors).toEqual(['Файл 2: Cannot read file']);
  expect(s.attach).toHaveBeenCalledTimes(2);
});

it('does not attach after the account changed while gallery was open', async () => {
  s.attach.mockClear(); s.session = 0; s.flipOnPrepare = false; s.fail = '';
  s.pick.mockImplementation(async () => { s.session++; return { canceled: false, assets: [{ uri: 'old-account', type: 'image' }] }; });
  await expect(attachPointMediaFromGallery('assignment', 'point')).rejects.toThrow('Session changed');
  expect(s.attach).not.toHaveBeenCalled();
});
it('stops the batch before attachment if session changed while preparing the first file', async () => {
  s.attach.mockClear(); s.session = 0; s.flipOnPrepare = true; s.fail = '';
  s.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'old-one', type: 'image' }, { uri: 'old-two', type: 'image' }] });
  await expect(attachPointMediaFromGallery('assignment', 'point')).rejects.toThrow('Session changed');
  expect(s.attach).not.toHaveBeenCalled(); s.flipOnPrepare = false;
});

import { beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ deleted: [] as string[], pick: vi.fn(), camera: vi.fn(), attach: vi.fn(), prepareFail: '' }));
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///data/user/0/app/cache/',
  documentDirectory: 'file:///data/user/0/app/files/',
  deleteAsync: async (uri: string) => { s.deleted.push(uri); },
  getInfoAsync: async () => ({ exists: true, size: 100 }),
  getFreeDiskStorageAsync: async () => 10 * 1024 * 1024 * 1024,
  readDirectoryAsync: async () => []
}));
vi.mock('@/auth/dataOwnerContext', () => ({ captureDataOwnerContext: async () => ({ ownerUserId: 'owner', contourId: 'test', generation: 0 }), assertDataOwnerContext: async () => {} }));
vi.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: async () => ({ granted: true }), getCameraPermissionsAsync: async () => ({ granted: true }),
  launchImageLibraryAsync: s.pick, launchCameraAsync: s.camera
}));
vi.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async (uri: string) => ({ uri: uri.replace('/ImagePicker/', '/ImageManipulator/') }) }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => 'owner' }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/db/repositories/patrolRepository', () => ({ attachPhotoToPoint: s.attach, restoreMissingPointAttachment: vi.fn() }));
vi.mock('@/db/repositories/shiftRemarkRepository', () => ({ attachMediaToShiftRemark: vi.fn() }));
vi.mock('@/db/repositories/workTaskRepository', () => ({ attachMediaToWorkTask: vi.fn() }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('@/sync/fileUploadQueue', () => {
  const prepare = async (input: any) => {
    if (input.localPath === s.prepareFail) throw new Error('copy failed');
    return { clientFileId: 'id', localPath: 'file:///data/user/0/app/files/patrol-photos/id.jpg' };
  };
  return { prepareLocalPhoto: prepare, prepareLocalMedia: prepare };
});
import { isOwnedTemporaryMediaUri } from '@/services/fileStorageService';
import { attachPointMediaFromGallery, attachPointPhotoFromCamera, attachPointVideoFromCamera } from '@/services/mediaAttachmentService';

const cache = 'file:///data/user/0/app/cache/';
beforeEach(() => { s.deleted = []; s.prepareFail = ''; s.attach.mockReset().mockResolvedValue(undefined); });

it('only app-cache temporaries are considered ours to delete', () => {
  expect(isOwnedTemporaryMediaUri(`${cache}ImagePicker/a.jpg`)).toBe(true);
  expect(isOwnedTemporaryMediaUri('content://media/external/images/1')).toBe(false);
  expect(isOwnedTemporaryMediaUri('file:///storage/emulated/0/DCIM/Camera/a.jpg')).toBe(false);
  expect(isOwnedTemporaryMediaUri('file:///data/user/0/app/files/patrol-photos/a.jpg')).toBe(false);
  expect(isOwnedTemporaryMediaUri(`${cache}../files/patrol-photos/a.jpg`)).toBe(false);
  expect(isOwnedTemporaryMediaUri(cache)).toBe(false);
  expect(isOwnedTemporaryMediaUri(null)).toBe(false);
});

it('a camera photo removes both the camera file and the resized copy after it is saved', async () => {
  s.camera.mockResolvedValue({ canceled: false, assets: [{ uri: `${cache}ImagePicker/shot.jpg`, width: 4000, height: 3000 }] });
  await expect(attachPointPhotoFromCamera('assignment', 'point')).resolves.toBe('attached');
  expect(s.attach).toHaveBeenCalledOnce();
  expect(new Set(s.deleted)).toEqual(new Set([`${cache}ImagePicker/shot.jpg`, `${cache}ImageManipulator/shot.jpg`]));
});

it('a failed copy still removes temporaries, and a gallery original outside the cache is never deleted', async () => {
  s.pick.mockResolvedValue({ canceled: false, assets: [
    { uri: `${cache}ImagePicker/bad.jpg`, type: 'image' },
    { uri: 'file:///storage/emulated/0/DCIM/original.jpg', type: 'image' }
  ] });
  s.prepareFail = `${cache}ImageManipulator/bad.jpg`;
  const result = await attachPointMediaFromGallery('assignment', 'point');
  expect(result.attachedCount).toBe(1);
  expect(s.deleted).toContain(`${cache}ImagePicker/bad.jpg`);
  expect(s.deleted).toContain(`${cache}ImageManipulator/bad.jpg`);
  expect(s.deleted.some(uri => uri.includes('DCIM'))).toBe(false);
});

it('a recorded video is removed from the cache once copied into managed storage', async () => {
  s.camera.mockResolvedValue({ canceled: false, assets: [{ uri: `${cache}ImagePicker/clip.mp4`, type: 'video', fileSize: 1000 }] });
  await expect(attachPointVideoFromCamera('assignment', 'point')).resolves.toBe('attached');
  expect(s.deleted).toEqual([`${cache}ImagePicker/clip.mp4`]);
});

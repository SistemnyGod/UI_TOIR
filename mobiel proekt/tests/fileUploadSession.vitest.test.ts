import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ generation: 1, upload: vi.fn(), cancel: vi.fn(), health: vi.fn(), size: 100, urls: ['https://test'], refresh: vi.fn(), calls: [] as any[] }));
vi.mock('@/auth/dataOwnerContext', () => ({
  captureDataOwnerContext: async () => ({ ownerUserId: 'alice', contourId: 'test', generation: s.generation }),
  assertDataOwnerContext: async (scope: any) => { if (scope.generation !== s.generation) throw Error('Session changed'); }
}));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/api/httpClient', () => ({ refreshStoredAccessTokenIfNeeded: async () => {}, refreshStoredAccessToken: s.refresh }));
vi.mock('@/auth/tokenStorage', () => ({ getAccessToken: async () => 'alice-token' }));
vi.mock('@/core/serverSettings', () => ({ getMobileRuntimeConfig: async () => ({ apiBaseUrl: 'https://test', contourId: 'test', syncProtocolVersion: '1' }), getServerCandidateBaseUrls: async () => s.urls }));
vi.mock('@/api/serverHealthApi', () => ({ probeServerHealthCached: s.health, invalidateServerHealthCache: vi.fn() }));
vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async () => ({ exists: true, size: s.size }), FileSystemUploadType: { MULTIPART: 1 },
  createUploadTask: (url: string, path: string, options: any) => { s.calls.push({ url, path, options }); return { uploadAsync: s.upload, cancelAsync: s.cancel }; }
}));
import { uploadMobileFile } from '@/api/fileApi';
import { FileUploadHttpError, getFileUploadFailureDisposition } from '@/domain/files/fileUploadPolicy';
const file = { clientFileId: '11111111-1111-4111-8111-111111111111', ownerUserId: 'alice', contourId: 'test', assignmentId: 'assignment', pointId: 'point', localPath: 'file:///photo.jpg', sizeBytes: 100, sha256: 'hash', contentType: 'image/jpeg', mediaKind: 'photo', createdAtLocal: '2026-09-29T00:00:00Z', status: 'queued' } as const;
beforeEach(() => { s.generation = 1; s.calls = []; s.urls = ['https://test']; s.size = 100; s.upload.mockReset(); s.cancel.mockReset().mockResolvedValue(undefined); s.health.mockReset().mockResolvedValue({ ok: true }); s.refresh.mockReset().mockResolvedValue('alice-new-token'); });
afterEach(() => vi.useRealTimers());
it('a late 401 from the previous session never refreshes or retries with another account', async () => {
  s.upload.mockImplementation(async () => { s.generation++; return { status: 401, body: '' }; });
  await expect(uploadMobileFile(file)).rejects.toThrow('Session changed');
  expect(s.calls).toHaveLength(1); expect(s.refresh).not.toHaveBeenCalled();
});
it('same-session 401 retries the original file ID with the refreshed token', async () => {
  s.upload.mockResolvedValueOnce({ status: 401, body: '' }).mockResolvedValueOnce({ status: 200, body: JSON.stringify({ clientFileId: file.clientFileId, serverFileId: '22222222-2222-4222-8222-222222222222', status: 'duplicate', uploadedAt: '2026-09-29T00:00:00Z' }) });
  await expect(uploadMobileFile(file)).resolves.toMatchObject({ status: 'duplicate', clientFileId: file.clientFileId });
  expect(s.calls).toHaveLength(2);
  expect(s.calls.map(call => call.options.parameters.clientFileId)).toEqual([file.clientFileId, file.clientFileId]);
  expect(s.calls[1].options.headers.Authorization).toBe('Bearer alice-new-token');
});
it('loss of the upload response permits a duplicate receipt using the original ID', async () => {
  s.upload.mockRejectedValueOnce(Error('Response lost'));
  await expect(uploadMobileFile(file)).rejects.toThrow();
  s.upload.mockResolvedValueOnce({ status: 200, body: JSON.stringify({ clientFileId: file.clientFileId, serverFileId: 'server-id', status: 'duplicate', uploadedAt: '2026-09-29T00:00:00Z' }) });
  await expect(uploadMobileFile(file)).resolves.toMatchObject({ status: 'duplicate' });
  expect(s.calls.map(call => call.options.parameters.clientFileId)).toEqual([file.clientFileId, file.clientFileId]);
});

it('timeout releases delivery even when native cancellation never finishes', async () => {
  vi.useFakeTimers();
  s.upload.mockImplementation(() => new Promise(() => {}));
  s.cancel.mockImplementation(() => new Promise(() => {}));
  let failure: any;
  const request = uploadMobileFile(file).catch(error => { failure = error; });
  await vi.advanceTimersByTimeAsync(60_001);
  expect(failure?.kind).toBe('timeout');
  await request;
  expect(s.cancel).toHaveBeenCalledOnce();
});

it('account switch during health validation prevents the upload', async () => {
  s.health.mockImplementation(async () => { s.generation++; return { ok: true }; });
  await expect(uploadMobileFile(file)).rejects.toThrow('Session changed');
  expect(s.calls).toHaveLength(0);
});

it('a stale gateway failure never sends the old file to the next server', async () => {
  s.urls.push('https://fallback');
  s.upload.mockImplementation(async () => { s.generation++; return { status: 502, body: '' }; });
  await expect(uploadMobileFile(file)).rejects.toThrow('Session changed');
  expect(s.calls).toHaveLength(1);
});

it('changed file size is rejected locally before the multipart request', async () => {
  s.size = 120;
  await expect(uploadMobileFile(file)).rejects.toThrow(/размер/i);
  expect(s.calls).toHaveLength(0);
});
it('a 401 after a successful refresh is a retryable HTTP failure, not a permanent rejection', async () => {
  s.upload.mockResolvedValue({ status: 401, body: '' });
  const error = await uploadMobileFile(file).catch(caught => caught);
  expect(error).toBeInstanceOf(FileUploadHttpError); expect(error.status).toBe(401);
  expect(getFileUploadFailureDisposition(error, 1)).toBe('retryLater');
});
it('a non-JSON upload response is retryable within the attempt cap', async () => {
  s.upload.mockResolvedValue({ status: 200, body: '<html>proxy</html>' });
  const error = await uploadMobileFile(file).catch(caught => caught);
  expect(getFileUploadFailureDisposition(error, 1)).toBe('retryLater');
});

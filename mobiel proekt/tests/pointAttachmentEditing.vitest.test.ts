import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openRealDatabase, selectAll, type QueryHook } from './support/realDatabase';

// Deleting, replacing and series-capturing point attachments before the report is sent, on the real
// schema: only never-attempted point commands are rewritten, anything queued, sent or accepted stays
// read-only, owner/contour/point checks hold, and only the managed copy of a deleted file is removed.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice', generation: 0, uuid: 0 }));
const fs = vi.hoisted(() => ({ deleted: [] as string[], camera: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++session.uuid}` }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => session.generation }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('react-native-nfc-manager', () => ({ default: {}, NfcAdapter: {}, NfcEvents: {}, NfcTech: {} }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///app/cache/',
  documentDirectory: 'file:///app/files/',
  deleteAsync: async (uri: string) => { fs.deleted.push(uri); },
  getInfoAsync: async () => ({ exists: true, size: 100 }),
  getFreeDiskStorageAsync: async () => 10 * 1024 * 1024 * 1024,
  readDirectoryAsync: async () => []
}));
vi.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: async () => ({ granted: true }), getCameraPermissionsAsync: async () => ({ granted: true }),
  launchImageLibraryAsync: vi.fn(), launchCameraAsync: fs.camera
}));
vi.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async (uri: string) => ({ uri: `${uri}.resized.jpg` }) }));
vi.mock('@/services/mobileErrorReporter', () => ({ logMobileError: vi.fn() }));
vi.mock('@/db/repositories/shiftRemarkRepository', () => ({ attachMediaToShiftRemark: vi.fn() }));
vi.mock('@/db/repositories/workTaskRepository', () => ({ attachMediaToWorkTask: vi.fn() }));
vi.mock('@/sync/fileUploadQueue', () => ({
  prepareLocalPhoto: async (input: { ownerUserId: string; assignmentId: string; pointId: string }) => {
    const clientFileId = `new-${++session.uuid}`;
    return { clientFileId, ownerUserId: input.ownerUserId, contourId: 'test', localPath: `${managed}/${clientFileId}.jpg`, status: 'localOnly',
      sha256: 'sha', sizeBytes: 100, contentType: 'image/jpeg', mediaKind: 'photo', assignmentId: input.assignmentId, pointId: input.pointId,
      createdAtLocal: '2026-10-19T10:00:00Z' };
  },
  prepareLocalMedia: vi.fn()
}));

const managed = 'file:///app/files/patrol-photos';
let raw: DatabaseSync;
let hooks: { afterRead: QueryHook | null };

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  session.owner = 'alice'; session.generation = 0; session.uuid = 0;
  fs.deleted = [];
  ({ raw, hooks } = await openRealDatabase());
});
afterEach(() => raw.close());

function seedPatrol(status = 'inProgress', contour = 'test') {
  raw.exec(`INSERT INTO routes(route_id, name, version) VALUES ('route', 'Route', 1)`);
  raw.prepare(`INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision,
      route_version_no, snapshot_version, snapshot_allow_free_order, snapshot_nfc_enabled, snapshot_qr_fallback_enabled)
    VALUES ('a', 'alice', ?, 'request', 'route', ?, 1, 1, 1, 1, 1, 1)`).run(contour, status);
  for (const point of ['point-1', 'point-2']) {
    raw.prepare(`INSERT INTO assignment_route_points(assignment_id, point_id, route_id, name, order_index)
      VALUES ('a', ?, 'route', ?, ?)`).run(point, point, point === 'point-1' ? 1 : 2);
  }
}
function seedResult(photos: string[], pointId = 'point-1', status = 'ok') {
  raw.prepare(`INSERT INTO point_results(local_result_id, owner_user_id, contour_id, assignment_id, point_id, status, sync_status,
      confirmation_type, completed_at_local, photo_client_file_ids_json)
    VALUES (?, 'alice', 'test', 'a', ?, ?, 'pending', 'nfc', '2026-10-19T00:00:00Z', ?)`)
    .run(`a:${pointId}`, pointId, status, JSON.stringify(photos));
}
function seedFile(clientFileId: string, { status = 'queued', owner = 'alice', contour = 'test', pointId = 'point-1', localPath = `${managed}/${clientFileId}.jpg` } = {}) {
  raw.prepare(`INSERT INTO files(client_file_id, owner_user_id, contour_id, local_path, status, sha256, size_bytes, content_type, media_kind,
      assignment_id, point_id, created_at_local)
    VALUES (?, ?, ?, ?, ?, 'sha', 100, 'image/jpeg', 'photo', 'a', ?, '2026-10-19')`)
    .run(clientFileId, owner, contour, localPath, status, pointId);
}
function seedMark(id: string, photos: string[], { status = 'pending', attempts = 0, type = 'markPatrolPointOk', pointId = 'point-1' } = {}) {
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status, attempt_count)
    VALUES (?, 'alice', 'test', ?, 'patrolPoint', ?, ?, '2026-10-19T00:00:00Z', ?, ?)`)
    .run(id, type, pointId, JSON.stringify({ assignmentId: 'a', pointId, comment: '', photoClientFileIds: photos }), status, attempts);
}

const row = (sql: string, ...args: string[]) => raw.prepare(sql).get(...args) as Record<string, unknown> | undefined;
const fileIds = () => selectAll<{ id: string }>(raw, 'SELECT client_file_id AS id FROM files ORDER BY client_file_id').map(file => file.id);
const resultIds = (pointId = 'point-1') => JSON.parse(row('SELECT photo_client_file_ids_json AS ids FROM point_results WHERE point_id = ?', pointId)!.ids as string);
const markPhotos = (id: string) => JSON.parse(row('SELECT payload_json FROM outbox_commands WHERE client_operation_id = ?', id)!.payload_json as string).photoClientFileIds;
const patrol = () => import('@/db/repositories/patrolRepository');
const media = () => import('@/services/mediaAttachmentService');

it('deletes an unsent attachment from the result, its files row and the never-sent point command', async () => {
  seedPatrol();
  seedFile('keep'); seedFile('drop');
  seedResult(['keep', 'drop']);
  seedMark('mark', ['keep', 'drop']);

  const outcome = await (await patrol()).deletePointAttachment('a', 'point-1', 'drop');

  expect(outcome.removedLocalPath).toBe(`${managed}/drop.jpg`);
  expect(fileIds()).toEqual(['keep']);
  expect(resultIds()).toEqual(['keep']);
  expect(markPhotos('mark')).toEqual(['keep']);
  expect(row("SELECT status, attempt_count FROM outbox_commands WHERE client_operation_id = 'mark'")).toEqual({ status: 'pending', attempt_count: 0 });
});

it.each([
  ['an attempted pending command', { status: 'pending', attempts: 1 }],
  ['a retryLater command', { status: 'retryLater', attempts: 1 }],
  ['a sending command', { status: 'sending', attempts: 1 }],
  ['an accepted command', { status: 'accepted', attempts: 1 }],
  ['a rejected command', { status: 'rejected', attempts: 1 }]
])('keeps an attachment referenced by %s read-only', async (_label, command) => {
  seedPatrol();
  seedFile('photo');
  seedResult(['photo']);
  seedMark('mark', ['photo'], command);
  const repository = await patrol();

  await expect(repository.deletePointAttachment('a', 'point-1', 'photo')).rejects.toThrow('передано в очередь отправки');

  expect(fileIds()).toEqual(['photo']);
  expect(resultIds()).toEqual(['photo']);
  expect(markPhotos('mark')).toEqual(['photo']);
  expect(await repository.listPointAttachmentEditBlocks('a', 'point-1')).toEqual({ photo: expect.stringContaining('очередь отправки') });
});

it('a completion command of another report that references the file also blocks deletion', async () => {
  seedPatrol();
  seedFile('photo');
  seedResult(['photo']);
  raw.prepare(`INSERT INTO outbox_commands(client_operation_id, owner_user_id, contour_id, command_type, entity_type, entity_local_id,
      payload_json, created_at_local, status) VALUES ('complete', 'alice', 'test', 'completePatrolAssignment', 'patrolAssignment', 'a', ?, '2026-10-19', 'pending')`)
    .run(JSON.stringify({ assignmentId: 'a', pointResults: [{ pointId: 'point-1', photoClientFileIds: ['photo'] }] }));

  await expect((await patrol()).deletePointAttachment('a', 'point-1', 'photo')).rejects.toThrow('передано в очередь отправки');
  expect(fileIds()).toEqual(['photo']);
});

it('superseded and cancelled commands no longer hold an attachment', async () => {
  seedPatrol();
  seedFile('photo');
  seedResult(['photo']);
  seedMark('old', ['photo'], { status: 'superseded', attempts: 1 });
  seedMark('undone', ['photo'], { status: 'cancelledLocal', attempts: 1 });

  await (await patrol()).deletePointAttachment('a', 'point-1', 'photo');

  expect(fileIds()).toEqual([]);
  expect(markPhotos('old')).toEqual(['photo']);
});

it.each(['uploading', 'uploaded', 'linked'])('an attachment in status %s is already sent and stays', async status => {
  seedPatrol();
  seedFile('photo', { status });
  seedResult(['photo']);
  const repository = await patrol();

  await expect(repository.deletePointAttachment('a', 'point-1', 'photo')).rejects.toThrow('уже отправлено');
  expect(fileIds()).toEqual(['photo']);
  expect(await repository.listPointAttachmentEditBlocks('a', 'point-1')).toEqual({ photo: expect.stringContaining('уже отправлено') });
});

it.each(['completedLocal', 'syncing', 'completedServer', 'cancelledServer'])('a %s report keeps its attachments read-only', async status => {
  seedPatrol(status);
  seedFile('photo');
  seedResult(['photo']);
  const repository = await patrol();

  await expect(repository.deletePointAttachment('a', 'point-1', 'photo')).rejects.toThrow('только для просмотра');
  expect(fileIds()).toEqual(['photo']);
  expect(await repository.listPointAttachmentEditBlocks('a', 'point-1')).toEqual({ photo: expect.stringContaining('только для просмотра') });
});

it.each([
  ['another owner', { owner: 'bob' }],
  ['another contour', { contour: 'other' }],
  ['another point', { pointId: 'point-2' }]
])('refuses to delete a file of %s', async (_label, file) => {
  seedPatrol();
  seedFile('photo', file);
  seedResult(['photo']);

  await expect((await patrol()).deletePointAttachment('a', 'point-1', 'photo')).rejects.toThrow('другому аккаунту или метке');
  expect(fileIds()).toEqual(['photo']);
  expect(resultIds()).toEqual(['photo']);
});

it('refuses a deletion that started in a session that has since changed', async () => {
  seedPatrol();
  seedFile('photo');
  seedResult(['photo']);
  const repository = await patrol();
  const { captureDataOwnerContext } = await import('@/auth/dataOwnerContext');
  const scope = await captureDataOwnerContext();
  session.generation++;

  await expect(repository.deletePointAttachment('a', 'point-1', 'photo', scope)).rejects.toThrow('Устаревший ответ');
  expect(fileIds()).toEqual(['photo']);
});

it('a send attempt that starts during the check makes the delete roll back', async () => {
  seedPatrol();
  seedFile('photo');
  seedResult(['photo']);
  seedMark('mark', ['photo']);
  hooks.afterRead = sql => {
    if (sql.includes('FROM outbox_commands') && sql.includes('instr(payload_json')) {
      hooks.afterRead = null;
      raw.exec("UPDATE outbox_commands SET status = 'sending', attempt_count = 1 WHERE client_operation_id = 'mark'");
    }
  };

  await expect((await patrol()).deletePointAttachment('a', 'point-1', 'photo')).rejects.toThrow('передано в очередь отправки');
  expect(fileIds()).toEqual(['photo']);
  expect(markPhotos('mark')).toEqual(['photo']);
});

it('replacing keeps the position in the result and queues the new file', async () => {
  seedPatrol();
  seedFile('first'); seedFile('old'); seedFile('last');
  seedResult(['first', 'old', 'last']);
  seedMark('mark', ['first', 'old', 'last']);
  const replacement = { clientFileId: 'new', ownerUserId: 'alice', localPath: `${managed}/new.jpg`, status: 'localOnly' as const,
    sha256: 'sha', sizeBytes: 100, contentType: 'image/jpeg' as const, mediaKind: 'photo' as const, assignmentId: 'a', pointId: 'point-1',
    createdAtLocal: '2026-10-19T10:00:00Z' };

  const outcome = await (await patrol()).replacePointAttachment('a', 'point-1', 'old', replacement);

  expect(outcome.removedLocalPath).toBe(`${managed}/old.jpg`);
  expect(resultIds()).toEqual(['first', 'new', 'last']);
  expect(markPhotos('mark')).toEqual(['first', 'new', 'last']);
  expect(fileIds()).toEqual(['first', 'last', 'new']);
  expect(row("SELECT status FROM files WHERE client_file_id = 'new'")!.status).toBe('queued');
});

it('the service removes the managed copy only after the row is gone, and never a file outside managed storage', async () => {
  seedPatrol();
  seedFile('managed');
  seedFile('outside', { localPath: 'file:///storage/emulated/0/DCIM/outside.jpg' });
  seedResult(['managed', 'outside']);
  const service = await media();

  await service.deletePointAttachmentFile('a', 'point-1', 'managed');
  await service.deletePointAttachmentFile('a', 'point-1', 'outside');

  expect(fileIds()).toEqual([]);
  expect(fs.deleted).toEqual([`${managed}/managed.jpg`]);
});

it('a refused deletion leaves the managed file on disk', async () => {
  seedPatrol();
  seedFile('photo', { status: 'uploaded' });
  seedResult(['photo']);

  await expect((await media()).deletePointAttachmentFile('a', 'point-1', 'photo')).rejects.toThrow('уже отправлено');
  expect(fs.deleted).toEqual([]);
});

it('a refused camera replacement deletes the new copy and keeps the original', async () => {
  seedPatrol();
  seedFile('photo');
  seedResult(['photo']);
  seedMark('mark', ['photo'], { status: 'accepted', attempts: 1 });
  fs.camera.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///app/cache/ImagePicker/shot.jpg', width: 100, height: 100 }] });

  await expect((await media()).replacePointPhotoFromCamera('a', 'point-1', 'photo')).rejects.toThrow('передано в очередь отправки');

  expect(fileIds()).toEqual(['photo']);
  expect(resultIds()).toEqual(['photo']);
  expect(fs.deleted.some(uri => /\/patrol-photos\/new-\d+\.jpg$/.test(uri))).toBe(true);
  expect(fs.deleted).not.toContain(`${managed}/photo.jpg`);
});

it('a photo series keeps every shot until the camera is closed', async () => {
  seedPatrol();
  seedResult([], 'point-1', 'deferred');
  const shot = (name: string) => ({ canceled: false, assets: [{ uri: `file:///app/cache/ImagePicker/${name}.jpg`, width: 100, height: 100 }] });
  fs.camera.mockResolvedValueOnce(shot('one')).mockResolvedValueOnce(shot('two')).mockResolvedValueOnce({ canceled: true, assets: null });
  const seen: number[] = [];

  const series = await (await media()).attachPointPhotoSeriesFromCamera('a', 'point-1', { onPhotoAttached: count => { seen.push(count, resultIds().length); } });

  expect(series).toEqual({ attachedCount: 2, error: null });
  expect(seen).toEqual([1, 1, 2, 2]);
  expect(fs.camera).toHaveBeenCalledTimes(3);
  expect(resultIds()).toHaveLength(2);
});

it('a failed shot ends the series without losing the photos already taken', async () => {
  seedPatrol();
  seedResult([], 'point-1', 'deferred');
  fs.camera.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///app/cache/ImagePicker/one.jpg', width: 100, height: 100 }] })
    .mockRejectedValueOnce(new Error('camera crashed'));

  const series = await (await media()).attachPointPhotoSeriesFromCamera('a', 'point-1');

  expect(series).toEqual({ attachedCount: 1, error: 'camera crashed' });
  expect(resultIds()).toHaveLength(1);
});

it('a photo series stops as soon as the form is no longer current and has an upper bound', async () => {
  seedPatrol();
  seedResult([], 'point-1', 'deferred');
  let shots = 0;
  fs.camera.mockImplementation(async () => ({ canceled: false, assets: [{ uri: `file:///app/cache/ImagePicker/${++shots}.jpg`, width: 100, height: 100 }] }));
  const service = await media();

  expect(await service.attachPointPhotoSeriesFromCamera('a', 'point-1', { shouldContinue: () => shots < 2 })).toEqual({ attachedCount: 2, error: null });
  shots = 0;
  expect((await service.attachPointPhotoSeriesFromCamera('a', 'point-1')).attachedCount).toBe(service.maxPhotoSeriesLength);
});

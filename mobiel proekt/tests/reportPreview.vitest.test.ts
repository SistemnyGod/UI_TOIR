import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openRealDatabase } from './support/realDatabase';
import { buildReportPreview, confirmationLabel, excerpt, type ReportPreviewInput } from '@/features/patrol/reportPreviewPresentation';
import { resolvePhotoInstructionSlot } from '@/domain/patrol/pointPhotoInstruction';

// The report preview shows every point with its result, comment start, photo count and confirmation,
// highlights what the readiness policy reports as missing, and reads attachment counts from this
// phone's owner/contour only. Also covers the reserved photo-instruction slot.
vi.mock('expo-sqlite', () => ({}));
const session = vi.hoisted(() => ({ owner: 'alice' }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
vi.mock('@/auth/tokenStorage', () => ({ getStoredOwnerUserId: async () => session.owner }));
vi.mock('@/auth/sessionGeneration', () => ({ getSessionGeneration: () => 0 }));
vi.mock('@/sync/mutationSyncRequest', () => ({ requestSyncAfterMutation: vi.fn() }));
vi.mock('react-native-nfc-manager', () => ({ default: {}, NfcAdapter: {}, NfcEvents: {}, NfcTech: {} }));
vi.mock('@/core/environments', () => ({ currentContourId: 'test' }));
vi.mock('@/db/repositories/mobileActionLogRepository', () => ({ logMobileAction: async () => {} }));
vi.mock('@/services/fileStorageService', () => ({ getLocalFileInfo: vi.fn() }));
vi.mock('@/db/encryptedDatabase', () => ({ openProtectedDatabase: vi.fn(), openProtectedDatabaseConnection: vi.fn() }));

const point = (overrides: Partial<ReportPreviewInput> = {}): ReportPreviewInput => ({
  pointId: 'p1', name: 'Щит 1', orderIndex: 1, status: 'ok', comment: null, requiresPhoto: false, confirmationType: 'nfc',
  photoCount: 0, videoCount: 0, missingAttachmentCount: 0, ...overrides
});

describe('presentation', () => {
  it('lists every point in route order with result, comment start, photo count and confirmation', () => {
    const preview = buildReportPreview([
      point({ pointId: 'p2', name: 'Насос', orderIndex: 2, status: 'issue', comment: 'Течь  у\nфланца', confirmationType: 'qr', photoCount: 2, videoCount: 1 }),
      point({ pointId: 'p1', comment: 'Без замечаний', photoCount: 1 }),
      point({ pointId: 'p3', name: 'Дверь', orderIndex: 3, status: 'skipped', comment: 'Нет доступа', confirmationType: 'manual' })
    ], []);

    expect(preview.rows.map(row => [row.orderIndex, row.resultLabel, row.commentExcerpt, row.photoCount, row.videoCount, row.confirmationLabel])).toEqual([
      [1, 'Исправно', 'Без замечаний', 1, 0, 'NFC'],
      [2, 'Неисправно', 'Течь у фланца', 2, 1, 'QR'],
      [3, 'Не осмотрено', 'Нет доступа', 0, 0, 'Вручную']
    ]);
    expect(preview.attentionCount).toBe(0);
    expect(preview.rows.every(row => row.problems.length === 0)).toBe(true);
  });

  it('shows the readiness problems on their points and keeps route problems apart', () => {
    const preview = buildReportPreview([point(), point({ pointId: 'p2', orderIndex: 2, status: 'pending', confirmationType: null })], [
      { pointId: 'p2', pointName: 'Щит 2', orderIndex: 2, reason: 'Обязательная метка не заполнена.' },
      { pointId: 'p2', pointName: 'Щит 2', orderIndex: 2, reason: 'Обязательная метка не заполнена.' },
      { pointId: 'snapshot-version', pointName: 'Маршрут', orderIndex: 0, reason: 'Снимок маршрута не совпадает' }
    ]);

    expect(preview.rows[1]).toMatchObject({ resultLabel: 'Не заполнена', confirmationLabel: 'Не подтверждена', problems: ['Обязательная метка не заполнена.'] });
    expect(preview.rows[0].problems).toEqual([]);
    expect(preview.attentionCount).toBe(1);
    expect(preview.routeProblems).toEqual(['Снимок маршрута не совпадает']);
  });

  it('follows the photo policy: a legacy required-photo flag without photos is not a problem', () => {
    const preview = buildReportPreview([point({ requiresPhoto: true, photoCount: 0 })], []);
    expect(preview.rows[0].problems).toEqual([]);
  });

  it('flags attachments that the result references but this phone no longer has', () => {
    const preview = buildReportPreview([point({ photoCount: 1, missingAttachmentCount: 2 })], []);
    expect(preview.rows[0].problems).toEqual(['Вложение не найдено на телефоне: 2. Замените его']);
    expect(preview.attentionCount).toBe(1);
  });

  it('shortens long comments at a word-agnostic limit and drops empty ones', () => {
    expect(excerpt('а'.repeat(200))).toHaveLength(80);
    expect(excerpt('а'.repeat(200))!.endsWith('…')).toBe(true);
    expect(excerpt('  ')).toBeNull();
    expect(excerpt(null)).toBeNull();
    expect(confirmationLabel(undefined)).toBe('Не подтверждена');
  });

  it('keeps the photo-instruction slot empty unless a photo exists or the placeholder flag is set', () => {
    expect(resolvePhotoInstructionSlot(undefined)).toBeNull();
    expect(resolvePhotoInstructionSlot({ uri: '  ' })).toBeNull();
    expect(resolvePhotoInstructionSlot(null, true)).toEqual({ kind: 'placeholder', message: 'Фото-инструкция появится позже' });
    expect(resolvePhotoInstructionSlot({ uri: 'file:///hint.jpg', caption: ' Щит ' })).toEqual({ kind: 'photo', uri: 'file:///hint.jpg', caption: 'Щит' });
  });
});

describe('repository', () => {
  let raw: DatabaseSync;
  beforeEach(async () => {
    vi.resetModules();
    session.owner = 'alice';
    ({ raw } = await openRealDatabase());
    raw.exec(`INSERT INTO routes(route_id, name, version) VALUES ('route', 'Route', 1);
      INSERT INTO patrol_assignments(assignment_id, owner_user_id, contour_id, request_id, route_id, status, revision, route_version_no, snapshot_version)
        VALUES ('a', 'alice', 'test', 'request', 'route', 'inProgress', 1, 1, 1);
      INSERT INTO assignment_route_points(assignment_id, point_id, route_id, name, order_index) VALUES ('a', 'p1', 'route', 'Щит', 1), ('a', 'p2', 'route', 'Насос', 2);`);
  });
  afterEach(() => raw.close());

  const file = (id: string, kind: string, owner = 'alice', contour = 'test') => raw.prepare(`INSERT INTO files(client_file_id, owner_user_id, contour_id, local_path,
      status, content_type, media_kind, assignment_id, point_id, created_at_local) VALUES (?, ?, ?, ?, 'queued', ?, ?, 'a', 'p1', '2026-10-19')`)
    .run(id, owner, contour, `file:///${id}`, kind === 'video' ? 'video/mp4' : 'image/jpeg', kind);

  it('counts photos and videos of each point and reports referenced files missing on this phone', async () => {
    raw.prepare(`INSERT INTO point_results(local_result_id, owner_user_id, contour_id, assignment_id, point_id, status, sync_status,
        confirmation_type, comment, photo_client_file_ids_json) VALUES ('r1', 'alice', 'test', 'a', 'p1', 'issue', 'pending', 'qr', 'Течь', ?)`)
      .run(JSON.stringify(['photo-1', 'photo-2', 'video-1', 'gone', 'bobs', 'photo-1']));
    file('photo-1', 'photo'); file('photo-2', 'photo'); file('video-1', 'video');
    file('bobs', 'photo', 'bob');
    const { getReportPreviewPoints } = await import('@/db/repositories/patrolRepository');

    const points = await getReportPreviewPoints('a');

    expect(points.map(({ pointId, status, comment, confirmationType, photoCount, videoCount, missingAttachmentCount }) =>
      ({ pointId, status, comment, confirmationType, photoCount, videoCount, missingAttachmentCount }))).toEqual([
      { pointId: 'p1', status: 'issue', comment: 'Течь', confirmationType: 'qr', photoCount: 2, videoCount: 1, missingAttachmentCount: 2 },
      { pointId: 'p2', status: 'pending', comment: null, confirmationType: null, photoCount: 0, videoCount: 0, missingAttachmentCount: 0 }
    ]);
  });

  it('shows nothing of an assignment that belongs to another owner', async () => {
    session.owner = 'bob';
    const { getReportPreviewPoints } = await import('@/db/repositories/patrolRepository');
    expect(await getReportPreviewPoints('a')).toEqual([]);
  });
});

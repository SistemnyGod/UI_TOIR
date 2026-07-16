import { getDatabase } from "@/db/database";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { LocalMobileFile } from "@/domain/files/fileTypes";

export type SyncQueueFileItem = Pick<
  LocalMobileFile,
  "clientFileId" | "localPath" | "serverFileId" | "status" | "contentType" | "mediaKind" | "assignmentId" | "pointId" | "remarkId" | "workTaskId" | "createdAtLocal"
> & {
  assignmentRouteName: string | null;
};

export async function insertLocalFile(file: LocalMobileFile) {
  const db = await getDatabase();

  await insertLocalFileInTransaction(db, file);
}

export async function insertLocalFileInTransaction(executor: Pick<Awaited<ReturnType<typeof getDatabase>>, "runAsync">, file: LocalMobileFile) {
  await executor.runAsync(
    `
      INSERT OR REPLACE INTO files (
        client_file_id,
        owner_user_id,
        local_path,
        preview_path,
        server_file_id,
        status,
        sha256,
        size_bytes,
        content_type,
        media_kind,
        assignment_id,
        point_id,
        remark_id,
        work_task_id,
        created_at_local
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      file.clientFileId,
      file.ownerUserId,
      file.localPath,
      file.previewPath ?? null,
      file.serverFileId ?? null,
      file.status,
      file.sha256 ?? null,
      file.sizeBytes ?? null,
      file.contentType ?? null,
      file.mediaKind ?? null,
      file.assignmentId ?? null,
      file.pointId ?? null,
      file.remarkId ?? null,
      file.workTaskId ?? null,
      file.createdAtLocal
    ]
  );
}

export async function listPointFiles(assignmentId: string, pointId: string) {
  const db = await getDatabase();

  return withSqliteBusyRetry(() =>
    db.getAllAsync<LocalMobileFile>(
      `
        SELECT
          client_file_id AS clientFileId,
          owner_user_id AS ownerUserId,
          local_path AS localPath,
          preview_path AS previewPath,
          server_file_id AS serverFileId,
          status,
          sha256,
          size_bytes AS sizeBytes,
          content_type AS contentType,
          media_kind AS mediaKind,
          assignment_id AS assignmentId,
          point_id AS pointId,
          remark_id AS remarkId,
          work_task_id AS workTaskId,
          created_at_local AS createdAtLocal
        FROM files
        WHERE assignment_id = ?
          AND point_id = ?
        ORDER BY created_at_local ASC
      `,
      [assignmentId, pointId]
    )
  );
}

export async function listFilesByClientIds(clientFileIds: string[]) {
  if (clientFileIds.length === 0) {
    return [];
  }

  const db = await getDatabase();
  const placeholders = clientFileIds.map(() => "?").join(", ");

  return db.getAllAsync<LocalMobileFile>(
    `
      SELECT
        client_file_id AS clientFileId,
        owner_user_id AS ownerUserId,
        local_path AS localPath,
        preview_path AS previewPath,
        server_file_id AS serverFileId,
        status,
        sha256,
        size_bytes AS sizeBytes,
        content_type AS contentType,
        media_kind AS mediaKind,
        assignment_id AS assignmentId,
        point_id AS pointId,
        remark_id AS remarkId,
        work_task_id AS workTaskId,
        created_at_local AS createdAtLocal
      FROM files
      WHERE client_file_id IN (${placeholders})
      ORDER BY created_at_local ASC
    `,
    clientFileIds
  );
}

export async function listRemarkFiles(remarkId: string) {
  const db = await getDatabase();

  return db.getAllAsync<LocalMobileFile>(
    `
      SELECT
        client_file_id AS clientFileId,
        owner_user_id AS ownerUserId,
        local_path AS localPath,
        preview_path AS previewPath,
        server_file_id AS serverFileId,
        status,
        sha256,
        size_bytes AS sizeBytes,
        content_type AS contentType,
        media_kind AS mediaKind,
        assignment_id AS assignmentId,
        point_id AS pointId,
        remark_id AS remarkId,
        work_task_id AS workTaskId,
        created_at_local AS createdAtLocal
      FROM files
      WHERE remark_id = ?
      ORDER BY created_at_local ASC
    `,
    [remarkId]
  );
}

export async function listWorkTaskFiles(workTaskId: string) {
  const db = await getDatabase();

  return db.getAllAsync<LocalMobileFile>(
    `
      SELECT
        client_file_id AS clientFileId,
        owner_user_id AS ownerUserId,
        local_path AS localPath,
        preview_path AS previewPath,
        server_file_id AS serverFileId,
        status,
        sha256,
        size_bytes AS sizeBytes,
        content_type AS contentType,
        media_kind AS mediaKind,
        assignment_id AS assignmentId,
        point_id AS pointId,
        remark_id AS remarkId,
        work_task_id AS workTaskId,
        created_at_local AS createdAtLocal
      FROM files
      WHERE work_task_id = ?
      ORDER BY created_at_local ASC
    `,
    [workTaskId]
  );
}

export async function listKnownLocalFilePaths() {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{ local_path: string }>(
    `
      SELECT local_path
      FROM files
      WHERE local_path IS NOT NULL
    `
  );

  return rows.map((row) => row.local_path);
}

export async function listSyncQueueFiles(ownerUserId: string, limit = 100) {
  const db = await getDatabase();

  return withSqliteBusyRetry(() =>
    db.getAllAsync<SyncQueueFileItem>(
      `
        SELECT
          file.client_file_id AS clientFileId,
          file.local_path AS localPath,
          file.server_file_id AS serverFileId,
          file.status,
          file.content_type AS contentType,
          file.media_kind AS mediaKind,
          file.assignment_id AS assignmentId,
          file.point_id AS pointId,
          file.remark_id AS remarkId,
          file.work_task_id AS workTaskId,
          file.created_at_local AS createdAtLocal,
          assignment.route_name AS assignmentRouteName
        FROM files file
        LEFT JOIN patrol_assignments assignment
          ON assignment.assignment_id = file.assignment_id
        WHERE file.owner_user_id = ?
          AND file.status NOT IN ('uploaded', 'linked')
        ORDER BY file.created_at_local DESC
        LIMIT ?
      `,
      [ownerUserId, limit]
    )
  );
}

export async function markFileUploading(clientFileId: string) {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE files
      SET status = 'uploading'
      WHERE client_file_id = ?
    `,
    [clientFileId]
  );
}

export async function markFileUploaded(clientFileId: string, serverFileId: string) {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE files
      SET status = 'uploaded',
          server_file_id = ?
      WHERE client_file_id = ?
    `,
    [serverFileId, clientFileId]
  );
}

export async function markFileUploadFailed(clientFileId: string) {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE files
      SET status = 'retryLater'
      WHERE client_file_id = ?
    `,
    [clientFileId]
  );
}

export async function listLinkedLocalFiles(ownerUserId: string, clientFileIds?: readonly string[]) {
  const db = await getDatabase();
  if (clientFileIds && clientFileIds.length === 0) {
    return [];
  }

  const clientFileFilter = clientFileIds
    ? ` AND client_file_id IN (${clientFileIds.map(() => "?").join(", ")})`
    : "";
  return db.getAllAsync<Pick<LocalMobileFile, "clientFileId" | "localPath" | "status">>(
    `
      SELECT client_file_id AS clientFileId, local_path AS localPath, status
      FROM files
      WHERE owner_user_id = ? AND status = 'linked'${clientFileFilter}
      ORDER BY created_at_local ASC
    `,
    [ownerUserId, ...(clientFileIds ?? [])]
  );
}

export async function deleteLinkedLocalFileRecord(ownerUserId: string, clientFileId: string) {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM files WHERE owner_user_id = ? AND client_file_id = ? AND status = 'linked'",
    [ownerUserId, clientFileId]
  );
}

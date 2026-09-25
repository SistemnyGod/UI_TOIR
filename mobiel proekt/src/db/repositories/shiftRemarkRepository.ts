import { currentContourId } from "@/core/environments";
import * as Crypto from "expo-crypto";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase, withProtectedExclusiveTransactionAsync } from "@/db/database";
import { insertLocalFileInTransaction } from "@/db/repositories/filesRepository";
import { insertOutboxCommandInTransaction } from "@/db/repositories/outboxSql";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";
import { LocalMobileFile } from "@/domain/files/fileTypes";
import { deleteWorkDraftInTransaction } from "@/db/repositories/workDraftRepository";

export type ShiftRemark = {
  remarkId: string;
  title: string;
  comment: string;
  mediaClientFileIds: string[];
  status: "pending" | "accepted" | "duplicate" | "retryLater" | "rejected" | "conflict";
  createdAtLocal: string;
  serverRemarkId: string | null;
  sectionId: string | null;
  sectionName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  syncStatus: string;
};

export async function createShiftRemarkLocally(input: {
  title?: string;
  comment: string;
  sectionId: string;
  sectionName: string;
  employeeId: string;
  employeeName: string;
  draftEmployeeId?: string;
  mediaClientFileIds?: string[];
}) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Нужно войти в мобильный аккаунт.");
  }

  const title = input.title?.trim() || "Замечание по смене";
  const comment = input.comment.trim();
  if (!comment) {
    throw new Error("Заполните текст замечания.");
  }

  const db = await getDatabase();
  const remarkId = Crypto.randomUUID();
  const clientOperationId = Crypto.randomUUID();
  const createdAtLocal = new Date().toISOString();
  const mediaClientFileIds = input.mediaClientFileIds ?? [];

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      await tx.runAsync(
        `
          INSERT INTO shift_remarks (
            remark_id,
            owner_user_id,
            title,
            comment,
            media_client_file_ids_json,
            status,
            created_at_local,
            server_remark_id,
            section_id,
            section_name,
            employee_id,
            employee_name,
            sync_status
          )
          VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?, ?, ?, 'pending')
        `,
        [
          remarkId,
          ownerUserId,
          title,
          comment,
          JSON.stringify(mediaClientFileIds),
          createdAtLocal,
          input.sectionId,
          input.sectionName,
          input.employeeId,
          input.employeeName
        ]
      );

      await insertOutboxCommandInTransaction(tx, {
        clientOperationId,
        ownerUserId,
        contourId: currentContourId,
        commandType: "createShiftRemark",
        entityType: "shiftRemark",
        entityLocalId: remarkId,
        entityServerId: null,
        payload: {
          remarkId,
          title,
          comment,
          sectionId: input.sectionId,
          employeeId: input.employeeId,
          mediaClientFileIds,
          createdAtLocal
        },
        createdAtLocal,
        attemptCount: 0,
        status: "pending"
      });
      await deleteWorkDraftInTransaction(tx, ownerUserId, input.draftEmployeeId ?? input.employeeId, "remark");
    })
  );

  requestSyncAfterMutation();
  return remarkId;
}

export async function attachMediaToShiftRemark(remarkId: string, file: LocalMobileFile) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Нужно войти в мобильный аккаунт.");
  }

  const db = await getDatabase();
  const row = await db.getFirstAsync<{ media_client_file_ids_json: string }>(
    "SELECT media_client_file_ids_json FROM shift_remarks WHERE remark_id = ? AND owner_user_id = ?",
    [remarkId, ownerUserId]
  );
  if (!row) {
    throw new Error("Замечание не найдено на телефоне.");
  }

  const mediaClientFileIds = Array.from(new Set([...safeParseStringArray(row.media_client_file_ids_json), file.clientFileId]));
  const outboxRow = await db.getFirstAsync<{ payload_json: string }>(
    `
      SELECT payload_json
      FROM outbox_commands
      WHERE entity_local_id = ?
        AND contour_id = ?
        AND command_type = 'createShiftRemark'
        AND status IN ('pending', 'retryLater')
      ORDER BY created_at_local DESC
      LIMIT 1
    `,
    [remarkId, currentContourId]
  );
  const nextPayload = {
    ...safeParseRecord(outboxRow?.payload_json),
    mediaClientFileIds
  };
  const clientOperationId = Crypto.randomUUID();
  const createdAtLocal = new Date().toISOString();

  await withSqliteBusyRetry(() =>
    withProtectedExclusiveTransactionAsync(db, async (tx) => {
      await insertLocalFileInTransaction(tx, { ...file, status: "queued", remarkId });
      await tx.runAsync(
        `
          UPDATE shift_remarks
          SET media_client_file_ids_json = ?,
              status = 'pending',
              sync_status = 'pending'
          WHERE remark_id = ?
        `,
        [JSON.stringify(mediaClientFileIds), remarkId]
      );

      if (outboxRow) {
        await tx.runAsync(
          `
            UPDATE outbox_commands
            SET payload_json = ?,
                updated_at_local = ?
            WHERE owner_user_id = ?
        AND contour_id = ?
              AND entity_local_id = ?
              AND command_type = 'createShiftRemark'
              AND status IN ('pending', 'retryLater')
          `,
          [JSON.stringify(nextPayload), createdAtLocal, ownerUserId, currentContourId, remarkId]
        );
      }

      await insertOutboxCommandInTransaction(tx, {
        clientOperationId,
        ownerUserId,
        contourId: currentContourId,
        commandType: "attachShiftRemarkMedia",
        entityType: "shiftRemark",
        entityLocalId: remarkId,
        entityServerId: null,
        payload: {
          remarkId,
          mediaClientFileIds: [file.clientFileId],
          createdAtLocal
        },
        createdAtLocal,
        attemptCount: 0,
        status: "pending"
      });
    })
  );
  requestSyncAfterMutation();
}

export type ShiftRemarkPage = {
  items: ShiftRemark[];
  nextCursor: string | null;
};

type ShiftRemarkCursor = { createdAtLocal: string; remarkId: string };

function encodeShiftRemarkCursor(row: { created_at_local: string; remark_id: string }) {
  return JSON.stringify({ createdAtLocal: row.created_at_local, remarkId: row.remark_id } satisfies ShiftRemarkCursor);
}

function decodeShiftRemarkCursor(value: string | null | undefined): ShiftRemarkCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ShiftRemarkCursor>;
    return typeof parsed.createdAtLocal === "string" && typeof parsed.remarkId === "string"
      ? { createdAtLocal: parsed.createdAtLocal, remarkId: parsed.remarkId }
      : null;
  } catch {
    return null;
  }
}

export async function listShiftRemarksPage(limit = 25, cursor: string | null = null): Promise<ShiftRemarkPage> {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return { items: [], nextCursor: null };
  }

  const db = await getDatabase();
  const parsedCursor = decodeShiftRemarkCursor(cursor);
  const pageSize = Math.max(1, Math.min(limit, 100));
  const continuation = parsedCursor ? " AND (created_at_local < ? OR (created_at_local = ? AND remark_id < ?))" : "";
  const values: (string | number)[] = [ownerUserId];
  if (parsedCursor) values.push(parsedCursor.createdAtLocal, parsedCursor.createdAtLocal, parsedCursor.remarkId);
  const rows = await db.getAllAsync<{
    remark_id: string;
    title: string;
    comment: string;
    media_client_file_ids_json: string;
   status: ShiftRemark["status"];
    created_at_local: string;
    server_remark_id: string | null;
    section_id: string | null;
    section_name: string | null;
    employee_id: string | null;
    employee_name: string | null;
    sync_status: string;
  }>(
    `
      SELECT
        remark_id,
        title,
        comment,
        media_client_file_ids_json,
        status,
        created_at_local,
        server_remark_id,
        section_id,
        section_name,
        employee_id,
        employee_name,
        sync_status
      FROM shift_remarks
      WHERE owner_user_id = ?${continuation}
      ORDER BY created_at_local DESC, remark_id DESC
      LIMIT ?
    `,
    [...values, pageSize + 1]
  );

  const pageRows = rows.slice(0, pageSize);
  return {
    items: pageRows.map((row) => ({
    remarkId: row.remark_id,
    title: row.title,
    comment: row.comment,
    mediaClientFileIds: safeParseStringArray(row.media_client_file_ids_json),
    status: row.status,
    createdAtLocal: row.created_at_local,
    serverRemarkId: row.server_remark_id,
    sectionId: row.section_id,
    sectionName: row.section_name,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    syncStatus: row.sync_status
    })),
    nextCursor: rows.length > pageSize ? encodeShiftRemarkCursor(pageRows[pageRows.length - 1]) : null
  };
}

/** Backwards-compatible full read for sync/bootstrap code. UI uses the page API. */
export async function listShiftRemarks(limit = 20) {
  const items: ShiftRemark[] = [];
  let cursor: string | null = null;
  do {
    const page = await listShiftRemarksPage(Math.max(1, Math.min(limit, 100)), cursor);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && items.length < limit);
  return items.slice(0, limit);
}

function safeParseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function safeParseRecord(value: string | undefined) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

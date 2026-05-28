import * as Crypto from "expo-crypto";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getDatabase } from "@/db/database";
import { insertLocalFileInTransaction } from "@/db/repositories/filesRepository";
import { withSqliteBusyRetry } from "@/db/sqliteBusyRetry";
import { LocalMobileFile } from "@/domain/files/fileTypes";

export type ShiftRemark = {
  remarkId: string;
  title: string;
  comment: string;
  mediaClientFileIds: string[];
  status: "pending" | "accepted" | "duplicate" | "retryLater" | "rejected" | "conflict";
  createdAtLocal: string;
  serverRemarkId: string | null;
};

export async function createShiftRemarkLocally(input: { title: string; comment: string; mediaClientFileIds?: string[] }) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Нужно войти в мобильный аккаунт.");
  }

  const title = input.title.trim() || "Замечание по смене";
  const comment = input.comment.trim();
  if (!comment) {
    throw new Error("Заполните текст замечания.");
  }

  const db = await getDatabase();
  const remarkId = Crypto.randomUUID();
  const clientOperationId = Crypto.randomUUID();
  const createdAtLocal = new Date().toISOString();
  const mediaClientFileIds = input.mediaClientFileIds ?? [];

  await db.withExclusiveTransactionAsync(async (tx) => {
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
          server_remark_id
        )
        VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL)
      `,
      [remarkId, ownerUserId, title, comment, JSON.stringify(mediaClientFileIds), createdAtLocal]
    );

    await tx.runAsync(
      `
        INSERT INTO outbox_commands (
          client_operation_id,
          owner_user_id,
          command_type,
          entity_type,
          entity_local_id,
          entity_server_id,
          payload_json,
          created_at_local,
          updated_at_local,
          attempt_count,
          status
        )
        VALUES (?, ?, 'createShiftRemark', 'shiftRemark', ?, NULL, ?, ?, ?, 0, 'pending')
      `,
      [
        clientOperationId,
        ownerUserId,
        remarkId,
        JSON.stringify({
          remarkId,
          title,
          comment,
          mediaClientFileIds,
          createdAtLocal
        }),
        createdAtLocal,
        createdAtLocal
      ]
    );
  });

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
        AND command_type = 'createShiftRemark'
        AND status IN ('pending', 'retryLater')
      ORDER BY created_at_local DESC
      LIMIT 1
    `,
    [remarkId]
  );
  const nextPayload = {
    ...safeParseRecord(outboxRow?.payload_json),
    mediaClientFileIds
  };
  const clientOperationId = Crypto.randomUUID();
  const createdAtLocal = new Date().toISOString();

  await withSqliteBusyRetry(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      await insertLocalFileInTransaction(tx, { ...file, status: "queued", remarkId });
      await tx.runAsync(
        `
          UPDATE shift_remarks
          SET media_client_file_ids_json = ?,
              status = 'pending'
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
            WHERE entity_local_id = ?
              AND command_type = 'createShiftRemark'
              AND status IN ('pending', 'retryLater')
          `,
          [JSON.stringify(nextPayload), createdAtLocal, remarkId]
        );
      }

      await tx.runAsync(
        `
          INSERT INTO outbox_commands (
            client_operation_id,
            owner_user_id,
            command_type,
            entity_type,
            entity_local_id,
            entity_server_id,
            payload_json,
            created_at_local,
            updated_at_local,
            attempt_count,
            status
          )
          VALUES (?, ?, 'attachShiftRemarkMedia', 'shiftRemark', ?, NULL, ?, ?, ?, 0, 'pending')
        `,
        [
          clientOperationId,
          ownerUserId,
          remarkId,
          JSON.stringify({
            remarkId,
            mediaClientFileIds: [file.clientFileId],
            createdAtLocal
          }),
          createdAtLocal
        ]
      );
    })
  );
}

export async function listShiftRemarks(limit = 20) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return [];
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    remark_id: string;
    title: string;
    comment: string;
    media_client_file_ids_json: string;
    status: ShiftRemark["status"];
    created_at_local: string;
    server_remark_id: string | null;
  }>(
    `
      SELECT
        remark_id,
        title,
        comment,
        media_client_file_ids_json,
        status,
        created_at_local,
        server_remark_id
      FROM shift_remarks
      WHERE owner_user_id = ?
      ORDER BY created_at_local DESC
      LIMIT ?
    `,
    [ownerUserId, limit]
  );

  return rows.map((row) => ({
    remarkId: row.remark_id,
    title: row.title,
    comment: row.comment,
    mediaClientFileIds: safeParseStringArray(row.media_client_file_ids_json),
    status: row.status,
    createdAtLocal: row.created_at_local,
    serverRemarkId: row.server_remark_id
  }));
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

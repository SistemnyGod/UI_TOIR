import { uploadMobileFile } from "@/api/fileApi";
import { getOutboxResult, postOutbox } from "@/api/mobileApi";
import { checkServerConnection } from "@/api/serverHealthApi";
import { getAccessToken } from "@/auth/tokenStorage";
import { hasUsableNetwork } from "@/core/network";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import {
  listFilesByClientIds,
  markFileUploaded,
  markFileUploadFailed,
  markFileUploading
} from "@/db/repositories/filesRepository";
import {
  applyOutboxResponses,
  finalizeAcceptedCompleteReportCommands,
  listUnconfirmedCompleteReportCommands,
  markPendingOutboxCommandsAuthRequired,
  markOutboxCommandsRetryLater,
  markOutboxCommandsSending,
  markPendingOutboxCommandsRetryLater,
  resetStaleSendingOutboxCommands
} from "@/db/repositories/outboxRepository";
import { OutboxCommand, OutboxResponse } from "@/domain/sync/syncTypes";
import { getPendingOutboxBatch } from "@/sync/outboxProcessor";
import { emitSyncEvent } from "@/sync/syncEvents";

type ForegroundSyncResult = {
  sent: number;
  skipped: "offline" | "serverUnavailable" | "busy" | "unauthenticated" | null;
};

const staleSendingTimeoutMs = 5 * 60 * 1000;
const maxSyncBatchesPerRun = 4;
let foregroundSyncPromise: Promise<ForegroundSyncResult> | null = null;

export async function runForegroundSync(): Promise<ForegroundSyncResult> {
  if (foregroundSyncPromise) {
    return { sent: 0, skipped: "busy" };
  }

  foregroundSyncPromise = runForegroundSyncInternal();

  try {
    return await foregroundSyncPromise;
  } finally {
    foregroundSyncPromise = null;
  }
}

async function runForegroundSyncInternal(): Promise<ForegroundSyncResult> {
  await finalizeAcceptedCompleteReportCommands();

  if (!(await hasUsableNetwork())) {
    return { sent: 0, skipped: "offline" as const };
  }

  const serverCheck = await checkServerConnection();
  if (!serverCheck.ok) {
    await markPendingOutboxCommandsRetryLater(serverCheck.message);
    return { sent: 0, skipped: "serverUnavailable" as const };
  }

  if (!(await getAccessToken())) {
    await markPendingOutboxCommandsAuthRequired(authRequiredMessage);
    return { sent: 0, skipped: "unauthenticated" as const };
  }

  await resetStaleSendingOutboxCommands(getStaleSendingBoundaryIso());
  await reconcileAcceptedCompleteReports();

  let sent = 0;

  for (let batchIndex = 0; batchIndex < maxSyncBatchesPerRun; batchIndex += 1) {
    const commands = await getPendingOutboxBatch();

    if (commands.length === 0) {
      break;
    }

    const commandIds = commands.map((command) => command.clientOperationId);
    await markOutboxCommandsSending(commandIds);

    try {
      await uploadFilesForCompleteCommands(commands);
      const responses = await postOutboxWithServerReconciliation(commands);
      await applyOutboxResponses(responses);
      logAcceptedReports(commands, responses);
      emitSyncEvent(buildSyncEvent(commands, responses));
      sent += responses.length;
    } catch (error) {
      const readableError = getReadableSyncError(error);
      if (isAuthRequiredError(error)) {
        await markPendingOutboxCommandsAuthRequired(readableError);
      } else {
        await markOutboxCommandsRetryLater(commandIds, readableError);
      }
      throw error;
    }
  }

  return { sent, skipped: null };
}

async function postOutboxWithServerReconciliation(commands: OutboxCommand[]) {
  try {
    return await postOutbox(commands);
  } catch (error) {
    const reconciledResponses = await getAcceptedOutboxResults(commands);

    const reconciledIds = new Set(reconciledResponses.map((response) => response.clientOperationId));
    const remainingCommandIds = commands
      .map((command) => command.clientOperationId)
      .filter((clientOperationId) => !reconciledIds.has(clientOperationId));

    if (remainingCommandIds.length === 0) {
      return reconciledResponses;
    }

    if (reconciledResponses.length > 0) {
      await applyOutboxResponses(reconciledResponses);
      logAcceptedReports(commands, reconciledResponses);
      emitSyncEvent(buildSyncEvent(commands, reconciledResponses));
    }

    await markOutboxCommandsRetryLater(remainingCommandIds, getReadableSyncError(error));

    throw error;
  }
}

async function getAcceptedOutboxResults(commands: OutboxCommand[]): Promise<OutboxResponse[]> {
  const responses = await Promise.all(
    commands.map(async (command) => {
      try {
        return await getOutboxResult(command.clientOperationId);
      } catch {
        return null;
      }
    })
  );

  return responses.filter(isAcceptedOutboxResponse);
}

function isAcceptedOutboxResponse(response: OutboxResponse | null): response is OutboxResponse {
  return response?.status === "accepted" || response?.status === "duplicate";
}

function buildSyncEvent(commands: OutboxCommand[], responses: OutboxResponse[]) {
  const acceptedOperationIds = responses
    .filter((response) => response.status === "accepted" || response.status === "duplicate")
    .map((response) => response.clientOperationId);
  const acceptedOperationIdSet = new Set(acceptedOperationIds);
  const completedAssignmentIds = commands
    .filter(
      (command) =>
        command.commandType === "completePatrolAssignment" &&
        command.entityLocalId &&
        acceptedOperationIdSet.has(command.clientOperationId)
    )
    .map((command) => command.entityLocalId as string);

  return {
    acceptedOperationIds,
    completedAssignmentIds
  };
}

export async function recoverStaleSendingOutboxCommands() {
  await resetStaleSendingOutboxCommands(getStaleSendingBoundaryIso());
}

export async function reconcileAcceptedCompleteReports(assignmentId?: string) {
  const localFinalized = await finalizeAcceptedCompleteReportCommands(assignmentId);
  const commands = await listUnconfirmedCompleteReportCommands(assignmentId);
  if (commands.length === 0) {
    return { reconciled: localFinalized.finalized };
  }

  const responses = await getAcceptedOutboxResults(commands);
  if (responses.length === 0) {
    return { reconciled: localFinalized.finalized };
  }

  await applyOutboxResponses(responses);
  logAcceptedReports(commands, responses);
  emitSyncEvent(buildSyncEvent(commands, responses));

  return { reconciled: localFinalized.finalized + responses.length };
}

function getStaleSendingBoundaryIso() {
  return new Date(Date.now() - staleSendingTimeoutMs).toISOString();
}

async function uploadFilesForCompleteCommands(commands: OutboxCommand[]) {
  const clientFileIds = Array.from(new Set(commands.flatMap(extractUploadClientFileIds)));
  const files = await listFilesByClientIds(clientFileIds);

  for (const file of files) {
    if (file.status === "uploaded" || file.status === "linked") {
      continue;
    }

    try {
      await markFileUploading(file.clientFileId);
      const response = await uploadMobileFile(file);
      await markFileUploaded(file.clientFileId, response.serverFileId);
      const mediaLabel = file.mediaKind === "video" ? "Видео" : "Фото";
      void logMobileAction({
        eventType: file.mediaKind === "video" ? "sync.video.uploaded" : "sync.photo.uploaded",
        entityType: file.remarkId ? "shiftRemark" : "patrolPoint",
        entityId: file.remarkId ?? file.pointId ?? file.assignmentId ?? file.clientFileId,
        message: `${mediaLabel} отправлено на сервер.`,
        payload: { clientFileId: file.clientFileId, serverFileId: response.serverFileId }
      }).catch(() => undefined);
    } catch {
      await markFileUploadFailed(file.clientFileId);
      throw new Error("Не удалось отправить файл на сервер. Отчет останется в очереди восстановления.");
    }
  }
}

function extractUploadClientFileIds(command: OutboxCommand) {
  if (command.commandType === "createShiftRemark" || command.commandType === "attachShiftRemarkMedia") {
    const mediaClientFileIds = command.payload.mediaClientFileIds;
    return Array.isArray(mediaClientFileIds)
      ? mediaClientFileIds.filter((item): item is string => typeof item === "string")
      : [];
  }

  if (command.commandType === "completePatrolAssignment") {
    return extractPatrolPhotoClientFileIds(command);
  }

  return [];
}

function extractPatrolPhotoClientFileIds(command: OutboxCommand) {
  const pointResults = command.payload.pointResults;
  if (!Array.isArray(pointResults)) {
    return [];
  }

  return pointResults.flatMap((result) => {
    if (!isRecord(result) || !Array.isArray(result.photoClientFileIds)) {
      return [];
    }

    return result.photoClientFileIds.filter((item): item is string => typeof item === "string");
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function logAcceptedReports(commands: OutboxCommand[], responses: OutboxResponse[]) {
  const acceptedIds = new Set(
    responses
      .filter((response) => response.status === "accepted" || response.status === "duplicate")
      .map((response) => response.clientOperationId)
  );

  for (const command of commands) {
    if (command.commandType !== "completePatrolAssignment" || !acceptedIds.has(command.clientOperationId)) {
      continue;
    }

    void logMobileAction({
      eventType: "sync.report.accepted",
      entityType: "patrolAssignment",
      entityId: command.entityLocalId ?? command.entityServerId ?? command.clientOperationId,
      message: "Отчет принят сервером.",
      payload: { clientOperationId: command.clientOperationId }
    }).catch(() => undefined);
  }
}

function getReadableSyncError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Не удалось отправить данные. Приложение повторит отправку автоматически.";
}

const authRequiredMessage = "Сессия истекла. Войдите в аккаунт повторно. Локальные данные и очередь отправки сохранены.";

function isAuthRequiredError(error: unknown) {
  return error instanceof Error && (
    error.message.includes("Сессия истекла")
    || error.message.includes("Войдите в аккаунт повторно")
  );
}

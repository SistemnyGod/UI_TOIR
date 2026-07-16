import { uploadMobileFile } from "@/api/fileApi";
import { getOutboxResult, postOutbox } from "@/api/mobileApi";
import { checkServerConnection } from "@/api/serverHealthApi";
import { getAccessToken, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { isReauthenticationRequiredError } from "@/auth/sessionErrors";
import { hasUsableNetwork } from "@/core/network";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { logMobileError } from "@/services/mobileErrorReporter";
import { reclaimAcceptedLocalMedia } from "@/services/localMediaReclamationService";
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
  resetSendingOutboxCommandsForManualRetry,
  resetStaleSendingOutboxCommands
} from "@/db/repositories/outboxRepository";
import { OutboxCommand, OutboxResponse } from "@/domain/sync/syncTypes";
import { getPendingOutboxBatch } from "@/sync/outboxProcessor";
import { findMissingClientFileIds } from "@/sync/fileReferenceIntegrity";
import { SerializedTaskQueue } from "@/sync/serializedTaskQueue";
import { processOrderedOutboxBatch } from "@/sync/orderedOutboxBatch";
import { mapWithConcurrency } from "@/sync/boundedAsync";
import { shouldContinueOutboxSync } from "@/sync/outboxContinuationPolicy";
import { emitSyncEvent } from "@/sync/syncEvents";

export type ForegroundSyncResult = {
  sent: number;
  skipped: "offline" | "serverUnavailable" | "unauthenticated" | null;
  hasMore: boolean;
};

const staleSendingTimeoutMs = 5 * 60 * 1000;
const maxSyncBatchesPerRun = 4;
const reconciliationPageSize = 24;
const reconciliationConcurrency = 4;
const foregroundSyncQueue = new SerializedTaskQueue<ForegroundSyncResult>();

export async function runForegroundSync(): Promise<ForegroundSyncResult> {
  // Never discard a sync request that arrives while another pass is running.
  // The previous `busy` result could leave a newly queued report untouched until
  // some later trigger (often the submission of the next report).
  const result = await foregroundSyncQueue.run(runForegroundSyncInternal);
  if (result.hasMore) {
    scheduleOutboxContinuation();
  }
  return result;
}

function scheduleOutboxContinuation() {
  void foregroundSyncQueue.run(runForegroundSyncInternal).then((result) => {
    if (result.hasMore) {
      scheduleOutboxContinuation();
    }
  }).catch((error) => {
    void logMobileError("sync.continuation.failed", error);
  });
}

async function runForegroundSyncInternal(): Promise<ForegroundSyncResult> {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return { sent: 0, skipped: "unauthenticated" as const, hasMore: false };
  }

  await finalizeAcceptedCompleteReportCommands(ownerUserId);
  await reclaimAcceptedLocalMedia(ownerUserId);

  if (!(await hasUsableNetwork())) {
    return { sent: 0, skipped: "offline" as const, hasMore: false };
  }

  const serverCheck = await checkServerConnection();
  if (!serverCheck.ok) {
    await markPendingOutboxCommandsRetryLater(ownerUserId, serverCheck.message);
    return { sent: 0, skipped: "serverUnavailable" as const, hasMore: false };
  }

  if (!(await getAccessToken())) {
    await markPendingOutboxCommandsAuthRequired(ownerUserId, authRequiredMessage);
    return { sent: 0, skipped: "unauthenticated" as const, hasMore: false };
  }

  await resetStaleSendingOutboxCommands(ownerUserId, getStaleSendingBoundaryIso());
  await reconcileAcceptedCompleteReports();

  let sent = 0;

  let processedBatches = 0;
  const attemptedOperationIds = new Set<string>();
  for (let batchIndex = 0; batchIndex < maxSyncBatchesPerRun; batchIndex += 1) {
    const commands = await getPendingOutboxBatch(ownerUserId);

    if (commands.length === 0) {
      break;
    }

    processedBatches += 1;
    commands.forEach((command) => attemptedOperationIds.add(command.clientOperationId));

    const batchResult = await processOrderedOutboxBatch(commands, {
      getDependencyKey: getCommandDependencyKey,
      isFatal: isAuthRequiredError,
      process: async (command) => {
        const commandIds = [command.clientOperationId];
        await markOutboxCommandsSending(commandIds);
        try {
          await uploadFilesForCompleteCommands(ownerUserId, [command]);
          const responses = await postOutboxWithServerReconciliation(ownerUserId, [command]);
          await applyOutboxResponses(responses);
          await reclaimAcceptedLocalMedia(ownerUserId, getAcceptedCompletionFileIds([command], responses));
          logAcceptedReports([command], responses);
          emitSyncEvent(buildSyncEvent([command], responses));
          sent += responses.length;
        } catch (error) {
          const readableError = getReadableSyncError(error);
          void logMobileError("sync.failed", error);
          if (isAuthRequiredError(error)) {
            await markPendingOutboxCommandsAuthRequired(ownerUserId, readableError);
          } else {
            await markOutboxCommandsRetryLater(commandIds, readableError);
          }
          throw error;
        }
      }
    });

    if (batchResult.firstError) {
      throw batchResult.firstError;
    }
  }

  const hasMore = shouldContinueOutboxSync(
    processedBatches,
    maxSyncBatchesPerRun,
    (await getPendingOutboxBatch(ownerUserId)).some(
      (command) => !attemptedOperationIds.has(command.clientOperationId)
    )
  );

  return { sent, skipped: null, hasMore };
}

function getCommandDependencyKey(command: OutboxCommand) {
  const assignmentId = command.payload.assignmentId;
  if (typeof assignmentId === "string" && assignmentId) {
    return `patrolAssignment:${assignmentId}`;
  }

  return `${command.entityType}:${command.entityLocalId ?? command.entityServerId ?? command.clientOperationId}`;
}

async function postOutboxWithServerReconciliation(ownerUserId: string, commands: OutboxCommand[]) {
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
      await reclaimAcceptedLocalMedia(ownerUserId, getAcceptedCompletionFileIds(commands, reconciledResponses));
      logAcceptedReports(commands, reconciledResponses);
      emitSyncEvent(buildSyncEvent(commands, reconciledResponses));
    }

    await markOutboxCommandsRetryLater(remainingCommandIds, getReadableSyncError(error));

    throw error;
  }
}

async function getAcceptedOutboxResults(commands: OutboxCommand[]): Promise<OutboxResponse[]> {
  const responses = await mapWithConcurrency(commands, reconciliationConcurrency, async (command) => {
      try {
        return await getOutboxResult(command.clientOperationId);
      } catch {
        return null;
      }
    });

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
  const ownerUserId = await getStoredOwnerUserId();
  if (ownerUserId) {
    await resetStaleSendingOutboxCommands(ownerUserId, getStaleSendingBoundaryIso());
  }
}

export async function prepareManualSyncRetry() {
  const ownerUserId = await getStoredOwnerUserId();
  if (ownerUserId) {
    await resetSendingOutboxCommandsForManualRetry(ownerUserId);
  }
}

export async function reconcileAcceptedCompleteReports(assignmentId?: string) {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return { reconciled: 0 };
  }

  const localFinalized = await finalizeAcceptedCompleteReportCommands(ownerUserId, assignmentId);
  const commands = await listUnconfirmedCompleteReportCommands(ownerUserId, assignmentId, reconciliationPageSize);
  if (commands.length === 0) {
    return { reconciled: localFinalized.finalized };
  }

  const responses = await getAcceptedOutboxResults(commands);
  if (responses.length === 0) {
    return { reconciled: localFinalized.finalized };
  }

  await applyOutboxResponses(responses);
  await reclaimAcceptedLocalMedia(ownerUserId, getAcceptedCompletionFileIds(commands, responses));
  logAcceptedReports(commands, responses);
  emitSyncEvent(buildSyncEvent(commands, responses));

  return { reconciled: localFinalized.finalized + responses.length };
}

function getStaleSendingBoundaryIso() {
  return new Date(Date.now() - staleSendingTimeoutMs).toISOString();
}

async function uploadFilesForCompleteCommands(ownerUserId: string, commands: OutboxCommand[]) {
  const clientFileIds = Array.from(new Set(commands.flatMap(extractUploadClientFileIds)));
  const files = await listFilesByClientIds(clientFileIds);
  const missingClientFileIds = findMissingClientFileIds(
    clientFileIds,
    files.map((file) => file.clientFileId)
  );

  if (missingClientFileIds.length > 0) {
    throw new Error(
      `Не найдены локальные вложения: ${missingClientFileIds.length}. Добавьте фото или видео повторно перед отправкой отчета.`
    );
  }

  for (const file of files) {
    if (file.ownerUserId !== ownerUserId) {
      throw new Error("Локальный файл принадлежит другому пользователю и не будет отправлен.");
    }

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
    } catch (error) {
      await markFileUploadFailed(file.clientFileId);
      if (error instanceof Error && error.message.includes("Mobile session is invalid")) {
        throw error;
      }
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

function getAcceptedCompletionFileIds(commands: OutboxCommand[], responses: OutboxResponse[]) {
  const acceptedOperationIds = new Set(
    responses
      .filter((response) => response.status === "accepted" || response.status === "duplicate")
      .map((response) => response.clientOperationId)
  );

  return Array.from(
    new Set(
      commands
        .filter(
          (command) =>
            command.commandType === "completePatrolAssignment" && acceptedOperationIds.has(command.clientOperationId)
        )
        .flatMap(extractPatrolPhotoClientFileIds)
    )
  );
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
  return error instanceof Error && isReauthenticationRequiredError(error.message);
}

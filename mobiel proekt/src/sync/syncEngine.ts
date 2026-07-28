import { uploadMobileFile } from "@/api/fileApi";
import { refreshStoredAccessToken } from "@/api/httpClient";
import { getOutboxResult, postOutbox } from "@/api/mobileApi";
import { MobileNetworkError } from "@/api/networkTimeout";
import { checkServerConnection } from "@/api/serverHealthApi";
import { getAccessToken, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { isReauthenticationRequiredError } from "@/auth/sessionErrors";
import { hasUsableNetwork } from "@/core/network";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { logMobileError } from "@/services/mobileErrorReporter";
import { reclaimAcceptedLocalMedia } from "@/services/localMediaReclamationService";
import {
  listFilesByClientIds,
  listWorkTaskFiles,
  markFileUploaded,
  markFileUploadFailed,
  markFileUploading
} from "@/db/repositories/filesRepository";
import {
  activateNetworkRecoveredOutboxCommands,
  activateRetryableOutboxCommandsForImmediateRetry,
  activateRetryableReportCommands,
  applyOutboxResponses,
  activateWaitingAuthOutboxCommands,
  activateWrongContourOutboxCommands,
  countRetryableOutboxCommands,
  countOutboxDeliveryProblems,
  finalizeAcceptedCompleteReportCommands,
  getNextOutboxRetryAt,
  listUnconfirmedCompleteReportCommands,
  markPendingOutboxCommandsAuthRequired,
  markPendingOutboxCommandsWaitingNetwork,
  markPendingOutboxCommandsWrongContour,
  quarantineInvalidPatrolCompletionCommands,
  markOutboxCommandsWrongContour,
  markOutboxCommandsRejected,
  markOutboxCommandsRetryLater,
  markOutboxCommandsSending,
  markPendingOutboxCommandsRetryLater,
  reactivateRecoverableRejectedPointCommands,
  reactivateRecoverableRejectedStartCommands,
  resetStaleSendingOutboxCommands
} from "@/db/repositories/outboxRepository";
import type { OutboxRetryReason } from "@/db/repositories/outboxRepository";
import { OutboxCommand, OutboxResponse } from "@/domain/sync/syncTypes";
import { resolvePatrolAssignmentIdentity } from "@/db/repositories/outboxPolicies";
import type { LocalMobileFile } from "@/domain/files/fileTypes";
import { getPendingOutboxBatch } from "@/sync/outboxProcessor";
import { findMissingClientFileIds } from "@/sync/fileReferenceIntegrity";
import { SerializedTaskQueue } from "@/sync/serializedTaskQueue";
import { processOrderedOutboxBatch } from "@/sync/orderedOutboxBatch";
import { getCommandAggregateKey } from "@/sync/outboxOrderingPolicy";
import { mapWithConcurrency } from "@/sync/boundedAsync";
import { shouldContinueOutboxSync } from "@/sync/outboxContinuationPolicy";
import { scheduleNextOutboxRetry } from "@/sync/outboxRetryScheduler";
import { emitSyncEvent, mergeSyncEvents, type SyncEvent } from "@/sync/syncEvents";
import { extractUploadClientFileIds, extractUploadFileReferences } from "@/sync/uploadCandidatePolicy";
import type { UploadFileReference } from "@/sync/uploadCandidatePolicy";
import { FileUploadFailureDisposition, PermanentFileUploadError, getFileUploadFailureDisposition } from "@/domain/files/fileUploadPolicy";

export type SyncOutcome = "complete" | "partial" | "skipped" | "failed";

export type ForegroundSyncResult = {
  sent: number;
  skipped: "offline" | "serverUnavailable" | "unauthenticated" | "wrongContour" | null;
  hasMore: boolean;
  nextRetryAt: string | null;
  retryableCount: number;
  outcome: SyncOutcome;
};

export type SyncRequestMode = "normal" | "networkRecovered" | "manualReport" | "manualAll";

export type ForegroundSyncOptions = {
  mode?: SyncRequestMode;
  assignmentId?: string;
};

type SyncResultBase = Omit<ForegroundSyncResult, "nextRetryAt" | "retryableCount" | "outcome">;
type InternalForegroundSyncOptions = Required<Pick<ForegroundSyncOptions, "mode">> & ForegroundSyncOptions & { skipPreparation?: boolean };

const staleSendingTimeoutMs = 5 * 60 * 1000;
const maxSyncBatchesPerRun = 4;
const reconciliationPageSize = 24;
const reconciliationConcurrency = 4;
const foregroundSyncQueue = new SerializedTaskQueue<ForegroundSyncResult>();

export async function runForegroundSync(options: ForegroundSyncOptions = {}): Promise<ForegroundSyncResult> {
  return executeForegroundSync(normalizeSyncOptions(options));
}

async function executeForegroundSync(options: InternalForegroundSyncOptions): Promise<ForegroundSyncResult> {
  const result = await foregroundSyncQueue.run(() => runForegroundSyncInternal(options));
  const ownerUserId = await getStoredOwnerUserId();
  void scheduleNextOutboxRetry(ownerUserId).catch((error) => {
    void logMobileError("sync.retry_schedule.failed", error);
  });

  if (result.hasMore) {
    scheduleOutboxContinuation(options);
  }

  return result;
}

function normalizeSyncOptions(options: ForegroundSyncOptions): InternalForegroundSyncOptions {
  const mode = options.mode ?? "normal";
  if (mode === "manualReport" && !options.assignmentId) {
    throw new Error("Для ручной отправки необходимо указать назначение.");
  }

  return { ...options, mode };
}

function scheduleOutboxContinuation(options: InternalForegroundSyncOptions) {
  const continuationOptions: InternalForegroundSyncOptions = options.mode === "manualReport"
    ? { ...options, skipPreparation: true }
    : { mode: "normal" };
  void executeForegroundSync(continuationOptions).catch((error) => {
    void logMobileError("sync.continuation.failed", error);
  });
}

async function runForegroundSyncInternal(options: InternalForegroundSyncOptions): Promise<ForegroundSyncResult> {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return buildForegroundSyncResult(null, { sent: 0, skipped: "unauthenticated", hasMore: false });
  }

  const aggregateKey = options.mode === "manualReport" && options.assignmentId
    ? `patrolAssignment:${options.assignmentId}`
    : undefined;

  const quarantined = await quarantineInvalidPatrolCompletionCommands(ownerUserId, options.assignmentId);
  if (quarantined.assignmentIds.length > 0) {
    emitSyncEvent({
      acceptedOperationIds: [],
      completedAssignmentIds: [],
      changedAssignmentIds: quarantined.assignmentIds,
      deliveryChangedAssignmentIds: quarantined.assignmentIds
    });
  }

  if (options.mode === "manualReport" && options.assignmentId) {
    await reconcileAcceptedCompleteReports(options.assignmentId);
    await resetStaleSendingOutboxCommands(ownerUserId, getStaleSendingBoundaryIso(), aggregateKey);
  }

  if (!options.skipPreparation) {
    await prepareSyncRequest(ownerUserId, options);
  }
  await finalizeAcceptedCompleteReportCommands(ownerUserId, options.assignmentId);
  await reactivateRecoverableRejectedStartCommands(ownerUserId, options.assignmentId);
  await reactivateRecoverableRejectedPointCommands(ownerUserId, options.assignmentId);
  if (!aggregateKey) {
    await reclaimAcceptedLocalMedia(ownerUserId);
  }

  if (!(await hasUsableNetwork())) {
    await markPendingOutboxCommandsWaitingNetwork(ownerUserId, "Сеть недоступна. Отчет сохранён на телефоне.", aggregateKey);
    return buildForegroundSyncResult(ownerUserId, { sent: 0, skipped: "offline", hasMore: false });
  }

  const serverCheck = await checkServerConnection(undefined, { useCache: true });
  if (!serverCheck.ok) {
    if (serverCheck.failureKind === "wrongContour") {
      await markPendingOutboxCommandsWrongContour(ownerUserId, serverCheck.message, aggregateKey);
      return buildForegroundSyncResult(ownerUserId, { sent: 0, skipped: "wrongContour", hasMore: false });
    }

    if (serverCheck.failureKind === "offline" || serverCheck.errorKind === "offline") {
      await markPendingOutboxCommandsWaitingNetwork(ownerUserId, serverCheck.message, aggregateKey);
      return buildForegroundSyncResult(ownerUserId, { sent: 0, skipped: "offline", hasMore: false });
    }

    await markPendingOutboxCommandsRetryLater(ownerUserId, serverCheck.message, "server", aggregateKey);
    return buildForegroundSyncResult(ownerUserId, { sent: 0, skipped: "serverUnavailable", hasMore: false });
  }

  await activateWrongContourOutboxCommands(ownerUserId, aggregateKey);

  const accessTokenState = await ensureAccessTokenForSync(ownerUserId, aggregateKey);
  if (accessTokenState !== "ok") {
    return buildForegroundSyncResult(ownerUserId, { sent: 0, skipped: accessTokenState, hasMore: false });
  }

  await activateWaitingAuthOutboxCommands(ownerUserId, aggregateKey);
  if (!aggregateKey) {
    await resetStaleSendingOutboxCommands(ownerUserId, getStaleSendingBoundaryIso());
  }
  await reconcileAcceptedCompleteReports(options.assignmentId);

  let sent = 0;
  let processedBatches = 0;
  const attemptedOperationIds = new Set<string>();
  for (let batchIndex = 0; batchIndex < maxSyncBatchesPerRun; batchIndex += 1) {
    const commands = await getPendingOutboxBatch(ownerUserId, undefined, attemptedOperationIds, aggregateKey);
    if (commands.length === 0) {
      break;
    }

    processedBatches += 1;
    commands.forEach((command) => attemptedOperationIds.add(command.clientOperationId));

    const batchEvents: SyncEvent[] = [];
    try {
      await processOrderedOutboxBatch(commands, {
      getDependencyKey: getCommandDependencyKey,
      isFatal: (error) => isAuthRequiredError(error) || isOfflineNetworkError(error),
      process: async (command) => {
        const commandIds = [command.clientOperationId];
        await markOutboxCommandsSending(ownerUserId, commandIds);
        try {
          await uploadFilesForCompleteCommands(ownerUserId, [command]);
          const responses = await postOutboxWithServerReconciliation(ownerUserId, [command]);
          await applyOutboxResponses(ownerUserId, responses);
          await reclaimAcceptedLocalMedia(ownerUserId, getAcceptedCompletionFileIds([command], responses));
          logAcceptedReports([command], responses);
          batchEvents.push(buildSyncEvent([command], responses));
          sent += responses.length;
        } catch (error) {
          const readableError = getReadableSyncError(error);
          void logMobileError("sync.failed", error);
          if (isWrongContourError(error)) {
            await markOutboxCommandsWrongContour(ownerUserId, commandIds, readableError);
          } else if (isAuthRequiredError(error)) {
            await markPendingOutboxCommandsAuthRequired(ownerUserId, readableError, aggregateKey);
          } else if (isOfflineNetworkError(error)) {
            await markPendingOutboxCommandsWaitingNetwork(ownerUserId, readableError, aggregateKey);
          } else if (error instanceof PermanentFileUploadError) {
            await markOutboxCommandsRejected(ownerUserId, commandIds, readableError);
          } else {
            await markOutboxCommandsRetryLater(ownerUserId, commandIds, readableError, null, getRetryReason(error));
          }
          batchEvents.push(buildSyncEvent([command], [], [getCommandAssignmentId(command)].filter((id): id is string => id !== null)));
          throw error;
        }
      }
      });
    } finally {
      if (batchEvents.length > 0) {
        emitSyncEvent(mergeSyncEvents(batchEvents));
      }
    }
  }

  const hasMore = shouldContinueOutboxSync(
    processedBatches,
    maxSyncBatchesPerRun,
    (await getPendingOutboxBatch(ownerUserId, undefined, attemptedOperationIds, aggregateKey)).some(
      (command) => !attemptedOperationIds.has(command.clientOperationId)
    )
  );

  return buildForegroundSyncResult(ownerUserId, { sent, skipped: null, hasMore });
}

async function prepareSyncRequest(
  ownerUserId: string,
  options: InternalForegroundSyncOptions
) {
  if (options.mode === "networkRecovered") {
    await activateNetworkRecoveredOutboxCommands(ownerUserId);
  } else if (options.mode === "manualReport" && options.assignmentId) {
    await activateRetryableReportCommands(ownerUserId, options.assignmentId);
  } else if (options.mode === "manualAll") {
    await activateRetryableOutboxCommandsForImmediateRetry(ownerUserId);
  }
}

async function buildForegroundSyncResult(ownerUserId: string | null, result: SyncResultBase): Promise<ForegroundSyncResult> {
  if (!ownerUserId) {
    return { ...result, nextRetryAt: null, retryableCount: 0, outcome: result.skipped ? "skipped" : "complete" };
  }

  const [nextRetryAt, retryableCount, problemCount] = await Promise.all([
    getNextOutboxRetryAt(ownerUserId),
    countRetryableOutboxCommands(ownerUserId),
    countOutboxDeliveryProblems(ownerUserId)
  ]);
  const outcome: SyncOutcome = result.skipped
    ? "skipped"
    : (problemCount > 0 || result.hasMore ? "partial" : "complete");
  return { ...result, nextRetryAt, retryableCount, outcome };
}

async function ensureAccessTokenForSync(
  ownerUserId: string,
  aggregateKey?: string
): Promise<"ok" | "serverUnavailable" | "unauthenticated"> {
  if (await getAccessToken()) {
    return "ok";
  }

  try {
    await refreshStoredAccessToken();
    return "ok";
  } catch (error) {
    const readableError = getReadableSyncError(error);
    if (isAuthRequiredError(error)) {
      await markPendingOutboxCommandsAuthRequired(ownerUserId, readableError, aggregateKey);
      return "unauthenticated";
    }

    if (isOfflineNetworkError(error)) {
      await markPendingOutboxCommandsWaitingNetwork(ownerUserId, readableError, aggregateKey);
      return "serverUnavailable";
    }

    await markPendingOutboxCommandsRetryLater(ownerUserId, readableError, getRetryReason(error), aggregateKey);
    return "serverUnavailable";
  }
}

function getCommandDependencyKey(command: OutboxCommand) {
  return getCommandAggregateKey(command) ?? `${command.entityType}:${command.entityLocalId ?? command.entityServerId ?? command.clientOperationId}`;
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
      await applyOutboxResponses(ownerUserId, reconciledResponses);
      await reclaimAcceptedLocalMedia(ownerUserId, getAcceptedCompletionFileIds(commands, reconciledResponses));
      logAcceptedReports(commands, reconciledResponses);
      emitSyncEvent(buildSyncEvent(commands, reconciledResponses));
    }

    await markOutboxCommandsRetryLater(ownerUserId, remainingCommandIds, getReadableSyncError(error), null, getRetryReason(error));

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

function getCommandAssignmentId(command: OutboxCommand) {
  const payloadAssignmentId = command.payload.assignmentId;
  if (typeof payloadAssignmentId === "string" && payloadAssignmentId) {
    return payloadAssignmentId;
  }
  return resolvePatrolAssignmentIdentity({
    commandType: command.commandType,
    entityType: command.entityType,
    entityLocalId: command.entityLocalId,
    payload: command.payload
  });
}

function buildSyncEvent(
  commands: OutboxCommand[],
  responses: OutboxResponse[],
  additionalAssignmentIds: string[] = []
) {
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

  const cancelledAssignmentIds = commands.flatMap((command) => {
    const cancelled = responses.some(
      (response) =>
        response.clientOperationId === command.clientOperationId
        && response.reasonCode === "assignmentCancelled"
    );
    if (!cancelled) {
      return [];
    }

    const assignmentId = command.payload.assignmentId;
    if (typeof assignmentId === "string" && assignmentId) {
      return [assignmentId];
    }

    return command.entityLocalId ? [command.entityLocalId] : [];
  });

  const respondedOperationIds = new Set(responses.map((response) => response.clientOperationId));
  const changedAssignmentIds = commands
    .filter((command) => respondedOperationIds.has(command.clientOperationId))
    .map(getCommandAssignmentId)
    .filter((assignmentId): assignmentId is string => assignmentId !== null);
  const deliveryChangedAssignmentIds = commands
    .filter((command) => command.commandType === 'completePatrolAssignment'
      || responses.some((response) => response.clientOperationId === command.clientOperationId
        && (response.status === 'rejected' || response.status === 'conflict')))
    .map(getCommandAssignmentId)
    .filter((assignmentId): assignmentId is string => assignmentId !== null);

  return {
    acceptedOperationIds,
    completedAssignmentIds,
    cancelledAssignmentIds: Array.from(new Set(cancelledAssignmentIds)),
    changedAssignmentIds: Array.from(new Set([...changedAssignmentIds, ...additionalAssignmentIds])),
    deliveryChangedAssignmentIds: Array.from(new Set(deliveryChangedAssignmentIds))
  };
}

export async function recoverStaleSendingOutboxCommands() {
  const ownerUserId = await getStoredOwnerUserId();
  if (ownerUserId) {
    await resetStaleSendingOutboxCommands(ownerUserId, getStaleSendingBoundaryIso());
  }
}

export async function prepareManualSyncRetry() {
  await runForegroundSync({ mode: "manualAll" });
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

  await applyOutboxResponses(ownerUserId, responses);
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
  const fileReferencesById = new Map<string, UploadFileReference[]>();
  for (const reference of commands.flatMap(extractUploadFileReferences)) {
    const references = fileReferencesById.get(reference.clientFileId) ?? [];
    references.push(reference);
    fileReferencesById.set(reference.clientFileId, references);
  }
  const workTaskIds = new Set(commands
    .filter((command) => command.entityType === "workTask")
    .map((command) => command.entityLocalId ?? command.entityServerId)
    .filter((value): value is string => Boolean(value)));
  const files = await listFilesByClientIds(clientFileIds);
  const workFiles = await listWorkFilesForCommands(commands);
  const allFilesById = new Map([...files, ...workFiles].map((file) => [file.clientFileId, file]));
  const missingClientFileIds = findMissingClientFileIds(
    clientFileIds,
    Array.from(allFilesById.keys())
  );

  if (missingClientFileIds.length > 0) {
    throw new PermanentFileUploadError(
      `Не найдены локальные вложения: ${missingClientFileIds.length}. Добавьте фото или видео повторно перед отправкой отчёта.`,
      missingClientFileIds[0] ?? "unknown"
    );
  }

  for (const file of allFilesById.values()) {
    try {
      if (file.ownerUserId !== ownerUserId) {
        throw new PermanentFileUploadError("Локальный файл принадлежит другому пользователю и не будет отправлен.", file.clientFileId);
      }

      const scopeError = getPermanentFileScopeError(file, fileReferencesById.get(file.clientFileId) ?? [], workTaskIds);
      if (scopeError) {
        throw new PermanentFileUploadError(scopeError, file.clientFileId);
      }

      if (file.status === "uploaded" || file.status === "linked") {
        continue;
      }
      await markFileUploading(file.clientFileId);
      const response = await uploadMobileFile(file);
      await markFileUploaded(file.clientFileId, response.serverFileId);
      const mediaLabel = file.mediaKind === "video" ? "Видео" : "Фото";
      const entityType = file.workTaskId ? "workTask" : file.remarkId ? "shiftRemark" : "patrolPoint";
      const entityId = file.workTaskId ?? file.remarkId ?? file.pointId ?? file.assignmentId ?? file.clientFileId;
      void logMobileAction({
        eventType: file.mediaKind === "video" ? "sync.video.uploaded" : "sync.photo.uploaded",
        entityType,
        entityId,
        message: `${mediaLabel} отправлено на сервер.`,
        payload: { clientFileId: file.clientFileId, serverFileId: response.serverFileId }
      }).catch(() => undefined);
    } catch (error) {
      if (isAuthRequiredError(error)) {
        await markFileUploadFailed(file.clientFileId, "retryLater", error instanceof Error ? error.message : "Неизвестная ошибка загрузки файла.");
        throw error;
      }
      if (error instanceof PermanentFileUploadError) {
        try {
          await markFileUploadFailed(file.clientFileId, "failed", error.message);
        } catch (markError) {
          void logMobileError("sync.file.mark_failed", markError);
        }
        throw error;
      }
      const disposition: FileUploadFailureDisposition = error instanceof MobileNetworkError ? "retryLater" : getFileUploadFailureDisposition(error);
      await markFileUploadFailed(file.clientFileId, disposition, error instanceof Error ? error.message : "Неизвестная ошибка загрузки файла.");
      const message = "Не удалось отправить файл на сервер. Отчет останется в очереди восстановления.";
      if (error instanceof MobileNetworkError) {
        throw new MobileNetworkError(error.kind, error, `${message} ${error.message}`);
      }
      if (disposition === "failed") {
        throw new PermanentFileUploadError(message, file.clientFileId);
      }
      throw new Error(message);
    }
  }
}

function getPermanentFileScopeError(
  file: LocalMobileFile,
  references: UploadFileReference[],
  workTaskIds: Set<string>
): string | null {
  if (references.length > 0 && !references.some((reference) => {
    if (reference.assignmentId && file.assignmentId !== reference.assignmentId) {
      return false;
    }
    if (reference.pointId && file.pointId !== reference.pointId) {
      return false;
    }
    if (reference.remarkId && file.remarkId !== reference.remarkId) {
      return false;
    }
    return true;
  })) {
    return "Локальное вложение связано с другим назначением, точкой или замечанием. Вложение нужно заменить.";
  }

  if (file.workTaskId && workTaskIds.size > 0 && !workTaskIds.has(file.workTaskId)) {
    return "Локальное вложение связано с другой задачей ЭМУ. Вложение нужно заменить.";
  }

  return null;
}
async function listWorkFilesForCommands(commands: OutboxCommand[]) {
  const workTaskIds = Array.from(new Set(commands
    .filter((command) => command.entityType === "workTask")
    .map((command) => command.entityLocalId ?? command.entityServerId)
    .filter((value): value is string => Boolean(value))));
  const files = await Promise.all(workTaskIds.map((workTaskId) => listWorkTaskFiles(workTaskId)));
  return files.flat();
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
        .flatMap(extractUploadClientFileIds)
    )
  );
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

function getRetryReason(error: unknown): OutboxRetryReason {
  if (error instanceof MobileNetworkError) {
    return error.kind === "timeout" ? "timeout" : "network";
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/\b429\b|too many requests|rate.?limit/i.test(message)) {
    return "rateLimit";
  }
  if (/\b5\d\d\b|server unavailable|сервер/i.test(message)) {
    return "server";
  }
  return "unknown";
}
function isAuthRequiredError(error: unknown) {
  return error instanceof Error && isReauthenticationRequiredError(error.message);
}

function isWrongContourError(error: unknown) {
  return error instanceof Error && /wrong_contour|друг(ого|ому|ом)\s+(?:серверн(ого|ом)\s+)?контур/i.test(error.message);
}

function isOfflineNetworkError(error: unknown) {
  return error instanceof MobileNetworkError && error.kind === "offline";
}

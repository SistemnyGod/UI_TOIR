import { uploadMobileFile } from "@/api/fileApi";
import { refreshStoredAccessToken, refreshStoredAccessTokenIfNeeded } from "@/api/httpClient";
import { getOutboxResult, postOutbox } from "@/api/mobileApi";
import { MobileNetworkError } from "@/api/networkTimeout";
import { checkServerConnection, invalidateServerHealthFailures } from "@/api/serverHealthApi";
import { getAccessToken, getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getSessionGeneration } from "@/auth/sessionGeneration";
import { assertDataOwnerContext, captureDataOwnerContext, StaleDataOwnerContextError, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { isReauthenticationRequiredError } from "@/auth/sessionErrors";
import { hasUsableNetwork } from "@/core/network";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { logMobileError } from "@/services/mobileErrorReporter";
import { triggerReportDeliveryDiagnostic } from "@/services/diagnosticReportService";
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
  activateWaitingNetworkOutboxCommands,
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
  markReportDeliveryDiagnosticIfDue,
  markOutboxCommandsSending,
  markPendingOutboxCommandsRetryLater,
  reactivateRecoverableRejectedPointCommands,
  reactivateRecoverableRejectedStartCommands,
  resetSendingOutboxCommandsForProcessRestart,
  resetStaleSendingOutboxCommands
} from "@/db/repositories/outboxRepository";
import type { OutboxRetryReason } from "@/db/repositories/outboxRepository";
import { classifySyncFailure, classifyHttpStatus, TransientSyncError } from "@/sync/syncErrorClassification";
import { OutboxCommand, OutboxResponse } from "@/domain/sync/syncTypes";
import { resolvePatrolAssignmentIdentity } from "@/db/repositories/outboxPolicies";
import type { LocalMobileFile } from "@/domain/files/fileTypes";
import { getPendingOutboxBatch } from "@/sync/outboxProcessor";
import { findMissingClientFileIds } from "@/sync/fileReferenceIntegrity";
import { PrioritySyncQueue } from "@/sync/prioritySyncQueue";
import { processOrderedOutboxBatch } from "@/sync/orderedOutboxBatch";
import { getCommandAggregateKey } from "@/sync/outboxOrderingPolicy";
import { mapWithConcurrency } from "@/sync/boundedAsync";
import { shouldContinueOutboxSync } from "@/sync/outboxContinuationPolicy";
import { scheduleNextOutboxRetry } from "@/sync/outboxRetryScheduler";
import { emitSyncEvent, mergeSyncEvents, type RefreshZone, type SyncEvent } from "@/sync/syncEvents";
import { extractUploadClientFileIds, extractUploadFileReferences } from "@/sync/uploadCandidatePolicy";
import type { UploadFileReference } from "@/sync/uploadCandidatePolicy";
import { FileUploadFailureDisposition, FileUploadHttpError, PermanentFileUploadError, getFileUploadFailureDisposition } from "@/domain/files/fileUploadPolicy";

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
type InternalForegroundSyncOptions = Required<Pick<ForegroundSyncOptions, "mode">> & ForegroundSyncOptions & { skipPreparation?: boolean; deferContinuation?: boolean };

const staleSendingTimeoutMs = 5 * 60 * 1000;
// After a reconnect the health check must answer fast: Wi-Fi without Internet
// should not hold the queue for the full multi-server budget.
const reconnectHealthCheckBudgetMs = 3_000;
const maxSyncBatchesPerRun = 4;
const reconciliationPageSize = 24;
const reconciliationConcurrency = 4;
const foregroundSyncQueue = new PrioritySyncQueue<ForegroundSyncResult>();

export async function runForegroundSync(options: ForegroundSyncOptions = {}): Promise<ForegroundSyncResult> {
  return executeForegroundSync(normalizeSyncOptions(options));
}

/** Keep the registered background task alive for its queue continuations.
 * Time is checked only between passes; no polling or forced interruption of
 * an in-flight upload/transaction. Unfinished work stays in the durable queue.
 */
export async function runBackgroundOutboxSync(): Promise<ForegroundSyncResult> {
  const generation = getSessionGeneration();
  const deadline = Date.now() + 90_000;
  let result = await executeForegroundSync({ mode: "networkRecovered", deferContinuation: true });
  let sent = result.sent;
  for (let pass = 1; result.hasMore && pass < 8 && Date.now() < deadline; pass++) {
    if (generation !== getSessionGeneration()) throw new StaleDataOwnerContextError("Сессия изменилась во время фоновой отправки.");
    result = await executeForegroundSync({ mode: "normal", skipPreparation: true, deferContinuation: true });
    sent += result.sent;
  }
  return { ...result, sent };
}

async function executeForegroundSync(options: InternalForegroundSyncOptions): Promise<ForegroundSyncResult> {
  const generation = getSessionGeneration();
  const result = await foregroundSyncQueue.run(async checkpoint => {
    if (generation !== getSessionGeneration()) throw new StaleDataOwnerContextError("Сессия изменилась до отправки отчёта.");
    try {
      return await runForegroundSyncInternal(options, checkpoint);
    } finally {
      // Also publish preflight outcomes (offline/auth/server unavailable).
      // No polling: one delivery update after this pass has persisted its state.
      if (generation === getSessionGeneration()) emitSyncEvent({
        acceptedOperationIds: [], completedAssignmentIds: [],
        deliveryChangedAssignmentIds: options.assignmentId ? [options.assignmentId] : [],
        refreshedZones: options.assignmentId ? [] : ["reportDelivery"]
      });
    }
  }, options.mode === "manualReport");
  const ownerUserId = await getStoredOwnerUserId();
  void scheduleNextOutboxRetry(ownerUserId).catch((error) => {
    void logMobileError("sync.retry_schedule.failed", error);
  });

  if (result.hasMore && !options.deferContinuation && generation === getSessionGeneration()) {
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

async function runForegroundSyncInternal(options: InternalForegroundSyncOptions, checkpoint: () => Promise<boolean>): Promise<ForegroundSyncResult> {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return buildForegroundSyncResult(null, { sent: 0, skipped: "unauthenticated", hasMore: false });
  }

  const ownerContext = await captureDataOwnerContext();
  if (ownerContext.ownerUserId !== ownerUserId) throw new StaleDataOwnerContextError("Сессия изменилась до синхронизации.");

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

  if (options.mode === "networkRecovered") {
    // A reconnect (new route, server reachable again, OS background run) makes
    // an earlier "server unreachable" meaningless; probe again right away.
    invalidateServerHealthFailures();
  }
  const serverCheck = await checkServerConnection(undefined, {
    useCache: true,
    timeoutMs: options.mode === "networkRecovered" ? reconnectHealthCheckBudgetMs : undefined
  });
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

  // The server answered, so anything parked as "no network" can go now. This
  // also covers the foreground timer and app resume, not only NetInfo events.
  await activateWaitingNetworkOutboxCommands(ownerUserId, aggregateKey);
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
  await checkpoint();
  await assertDataOwnerContext(ownerContext);

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
      isFatal: (error) => error instanceof StaleDataOwnerContextError || isAuthRequiredError(error) || isOfflineNetworkError(error),
      process: async (command) => {
        const resumedAfterPriority = await checkpoint();
        await assertDataOwnerContext(ownerContext);
        if (resumedAfterPriority) {
          // The priority pass may have accepted this command, changed its
          // revision or scheduled a server-directed retry. Never claim a stale
          // cached head and accidentally bypass Retry-After.
          const [current] = await getPendingOutboxBatch(ownerUserId, 1, new Set(), getCommandDependencyKey(command));
          await assertDataOwnerContext(ownerContext);
          if (!current || current.clientOperationId !== command.clientOperationId) return;
          command = current;
        }
        const commandIds = [command.clientOperationId];
        const claimed = await markOutboxCommandsSending(ownerUserId, commandIds, command.payload);
        // Cancellation or another worker can win after the queue was read.
        // Only the worker that changed the durable status may send this item.
        if (claimed === 0) return;
        await assertDataOwnerContext(ownerContext);
        notifyReportDeliveryChanged(command);
        try {
          await uploadFilesForCompleteCommands(ownerUserId, [command], ownerContext);
          await assertDataOwnerContext(ownerContext);
          const responses = await postOutboxWithServerReconciliation(ownerUserId, [command], ownerContext, aggregateKey);
          await assertDataOwnerContext(ownerContext);
          await applyOutboxResponses(ownerUserId, responses, ownerContext);
          // The receipt is durable now. A slow operation elsewhere in this
          // batch (or local media cleanup) must not leave the open report stale.
          notifyReportDeliveryChanged(command);
          await reclaimAcceptedLocalMedia(ownerUserId, getAcceptedCompletionFileIds([command], responses));
          logAcceptedReports([command], responses);
          batchEvents.push(buildSyncEvent([command], responses));
          sent += responses.length;
        } catch (error) {
          void logMobileError("sync.failed", error);
          const outcome = await markCommandsAfterSendFailure(ownerUserId, commandIds, error, aggregateKey);
          if (outcome === "retry") {
            void maybeTriggerReportDeliveryDiagnostic(ownerUserId, command);
          }
          notifyReportDeliveryChanged(command);
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
    try {
      await refreshStoredAccessTokenIfNeeded();
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

async function postOutboxWithServerReconciliation(ownerUserId: string, commands: OutboxCommand[], context: DataOwnerContext, aggregateKey?: string) {
  try {
    await assertDataOwnerContext(context);
    return await postOutbox(commands);
  } catch (error) {
    await assertDataOwnerContext(context);
    const reconciledResponses = await getAcceptedOutboxResults(commands, context);

    const reconciledIds = new Set(reconciledResponses.map((response) => response.clientOperationId));
    const remainingCommandIds = commands
      .map((command) => command.clientOperationId)
      .filter((clientOperationId) => !reconciledIds.has(clientOperationId));

    if (remainingCommandIds.length === 0) {
      return reconciledResponses;
    }

    if (reconciledResponses.length > 0) {
      await applyOutboxResponses(ownerUserId, reconciledResponses, context);
      emitSyncEvent(buildSyncEvent(commands, reconciledResponses));
      await reclaimAcceptedLocalMedia(ownerUserId, getAcceptedCompletionFileIds(commands, reconciledResponses));
      logAcceptedReports(commands, reconciledResponses);
    }

    const outcome = await markCommandsAfterSendFailure(ownerUserId, remainingCommandIds, error, aggregateKey);
    if (outcome === "retry") await Promise.all(commands.filter((command) => remainingCommandIds.includes(command.clientOperationId)).map((command) => maybeTriggerReportDeliveryDiagnostic(ownerUserId, command)));

    throw error;
  }
}

async function getAcceptedOutboxResults(commands: OutboxCommand[], context: DataOwnerContext): Promise<OutboxResponse[]> {
  const responses = await mapWithConcurrency(commands, reconciliationConcurrency, async (command) => {
      try {
        await assertDataOwnerContext(context);
        const response = await getOutboxResult(command.clientOperationId);
        await assertDataOwnerContext(context);
        return response;
      } catch {
        await assertDataOwnerContext(context);
        return null;
      }
    });

  return responses.filter(isAcceptedOutboxResponse);
}

function isAcceptedOutboxResponse(response: OutboxResponse | null): response is OutboxResponse {
  return response?.status === "accepted" || response?.status === "duplicate";
}

async function maybeTriggerReportDeliveryDiagnostic(ownerUserId: string, command: OutboxCommand) {
  if (command.commandType !== "completePatrolAssignment") {
    return;
  }

  try {
    if (await markReportDeliveryDiagnosticIfDue(ownerUserId, command.clientOperationId)) {
      void triggerReportDeliveryDiagnostic().catch((error) => {
        void logMobileError("diagnostic.report_delivery.failed", error);
      });
    }
  } catch (error) {
    void logMobileError("diagnostic.report_delivery.threshold.failed", error);
  }
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

function notifyReportDeliveryChanged(command: OutboxCommand) {
  if (command.commandType !== "completePatrolAssignment") return;
  const assignmentId = getCommandAssignmentId(command);
  if (!assignmentId) return;
  // Only delivery subscribers need this immediate update. List refreshes and
  // accepted-operation events remain coalesced at the end of the batch.
  emitSyncEvent({ acceptedOperationIds: [], completedAssignmentIds: [], deliveryChangedAssignmentIds: [assignmentId] });
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
  const changedWorkItemIds = commands
    .filter((command) => command.entityType === "workTask" && respondedOperationIds.has(command.clientOperationId))
    .map((command) => command.entityLocalId)
    .filter((id): id is string => Boolean(id));
  const changedRemarkIds = commands
    .filter((command) => command.entityType === "shiftRemark" && respondedOperationIds.has(command.clientOperationId))
    .map((command) => command.entityLocalId)
    .filter((id): id is string => Boolean(id));

  const refreshedZones = new Set<RefreshZone>();
  for (const command of commands) {
    if (command.commandType === "completePatrolAssignment") {
      refreshedZones.add("reportDelivery");
      refreshedZones.add("activePatrols");
      refreshedZones.add("points");
    }
    if (command.entityType === "workTask" || command.entityType === "shiftRemark") {
      refreshedZones.add("workItems");
    }
  }
  return {
    acceptedOperationIds,
    completedAssignmentIds,
    cancelledAssignmentIds: Array.from(new Set(cancelledAssignmentIds)),
    changedAssignmentIds: Array.from(new Set([...changedAssignmentIds, ...additionalAssignmentIds])),
    deliveryChangedAssignmentIds: Array.from(new Set(deliveryChangedAssignmentIds)),
    changedWorkItemIds: Array.from(new Set(changedWorkItemIds)),
    changedRemarkIds: Array.from(new Set(changedRemarkIds)),
    refreshedZones: Array.from(refreshedZones)
  };
}

export async function recoverStaleSendingOutboxCommands() {
  const ownerUserId = await getStoredOwnerUserId();
  if (ownerUserId) {
    await resetStaleSendingOutboxCommands(ownerUserId, getStaleSendingBoundaryIso());
  }
}
export async function recoverSendingOutboxCommandsAfterProcessRestart() {
  const ownerUserId = await getStoredOwnerUserId();
  if (ownerUserId) {
    await resetSendingOutboxCommandsForProcessRestart(ownerUserId);
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

  const context = await captureDataOwnerContext();
  if (context.ownerUserId !== ownerUserId) throw new StaleDataOwnerContextError("Сессия изменилась до сверки отчётов.");

  const localFinalized = await finalizeAcceptedCompleteReportCommands(ownerUserId, assignmentId);
  const commands = await listUnconfirmedCompleteReportCommands(ownerUserId, assignmentId, reconciliationPageSize);
  if (commands.length === 0) {
    return { reconciled: localFinalized.finalized };
  }

  const responses = await getAcceptedOutboxResults(commands, context);
  if (responses.length === 0) {
    return { reconciled: localFinalized.finalized };
  }

  await applyOutboxResponses(ownerUserId, responses, context);
  emitSyncEvent(buildSyncEvent(commands, responses));
  await reclaimAcceptedLocalMedia(ownerUserId, getAcceptedCompletionFileIds(commands, responses));
  logAcceptedReports(commands, responses);

  return { reconciled: localFinalized.finalized + responses.length };
}

function getStaleSendingBoundaryIso() {
  return new Date(Date.now() - staleSendingTimeoutMs).toISOString();
}

async function uploadFilesForCompleteCommands(ownerUserId: string, commands: OutboxCommand[], context: DataOwnerContext) {
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
  await assertDataOwnerContext(context);
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
      await assertDataOwnerContext(context);
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
      await assertDataOwnerContext(context);
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
      // markFileUploading counted this attempt in the database row only.
      const attemptNumber = (file.attemptCount ?? 0) + 1;
      const disposition: FileUploadFailureDisposition = error instanceof MobileNetworkError ? "retryLater" : getFileUploadFailureDisposition(error, attemptNumber);
      await markFileUploadFailed(file.clientFileId, disposition, error instanceof Error ? error.message : "Неизвестная ошибка загрузки файла.");
      const message = "Не удалось отправить файл на сервер. Отчет останется в очереди восстановления.";
      if (error instanceof MobileNetworkError) {
        throw new MobileNetworkError(error.kind, error, `${message} ${error.message}`);
      }
      if (disposition === "failed") {
        throw new PermanentFileUploadError(message, file.clientFileId);
      }
      // The upload policy already decided to retry (5xx, 408, 429 or a bounded
      // ambiguous 404/409); keep that decision instead of a terminal 4xx.
      throw new TransientSyncError(message, getFileUploadRetryReason(error));
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

/** Reason for a retry decided by HTTP status / error type, never by message text. */
function getRetryReason(error: unknown): OutboxRetryReason {
  const disposition = classifySyncFailure(error);
  return disposition.kind === "retry" ? disposition.reason : "unknown";
}

function getFileUploadRetryReason(error: unknown): OutboxRetryReason {
  if (!(error instanceof FileUploadHttpError)) return getRetryReason(error);
  const disposition = classifyHttpStatus(error.status);
  return disposition.kind === "retry" ? disposition.reason : "unknown";
}

type SendFailureOutcome = "wrongContour" | "authentication" | "offline" | "terminal" | "retry";

/**
 * One place decides what a failed send means for the durable queue. Repeated
 * calls are harmless: per-command updates only touch rows still in `sending`.
 */
async function markCommandsAfterSendFailure(
  ownerUserId: string,
  commandIds: string[],
  error: unknown,
  aggregateKey?: string
): Promise<SendFailureOutcome> {
  const readableError = getReadableSyncError(error);
  if (isWrongContourError(error)) {
    await markOutboxCommandsWrongContour(ownerUserId, commandIds, readableError);
    return "wrongContour";
  }
  if (isAuthRequiredError(error)) {
    await markPendingOutboxCommandsAuthRequired(ownerUserId, readableError, aggregateKey);
    return "authentication";
  }
  if (isOfflineNetworkError(error)) {
    await markPendingOutboxCommandsWaitingNetwork(ownerUserId, readableError, aggregateKey);
    return "offline";
  }
  if (error instanceof PermanentFileUploadError) {
    await markOutboxCommandsRejected(ownerUserId, commandIds, readableError);
    return "terminal";
  }

  const disposition = classifySyncFailure(error);
  if (disposition.kind === "terminal") {
    await markOutboxCommandsRejected(
      ownerUserId,
      commandIds,
      `Сервер отклонил отправку (HTTP ${disposition.status}). Нужно решение: автоматический повтор не поможет. ${readableError}`
    );
    return "terminal";
  }

  await markOutboxCommandsRetryLater(ownerUserId, commandIds, readableError, disposition.retryAfterSeconds, disposition.reason);
  return "retry";
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

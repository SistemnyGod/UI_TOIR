import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";

import { StaleDataOwnerContextError, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { listSyncQueueFiles, retryFailedFileUpload, type SyncQueueFileItem } from "@/db/repositories/filesRepository";
import { listSyncQueueCommands, type SyncQueueCommandItem } from "@/db/repositories/outboxRepository";
import { deliveryStages, type DeliveryStage } from "@/features/syncQueue/QueueDeliveryTimeline";
import { countWaitingAuthItems } from "@/features/syncQueue/syncQueueAuthPolicy";
import { buildQueueSummary, countRetryable, formatDateTime, syncResultMessage, type CommandResolution, type DestructiveResolution } from "@/features/syncQueue/syncQueuePresentation";
import { acceptServerConflict, cancelRejectedCommand, retryConflictWithLatestRevision, sendConflictToDispatcher } from "@/services/conflictResolutionService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { continuePatrolWithReconciliation } from "@/services/patrolContinuationService";
import { retainEqualItems } from "@/sync/retainEqualItems";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { requestMobileDataRefresh, triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { useFocusedOwnerLoad } from "@/sync/useFocusedOwnerLoad";

type SyncQueueState = {
  commands: SyncQueueCommandItem[];
  files: SyncQueueFileItem[];
};

export type PendingConfirmation = { command: SyncQueueCommandItem; action: DestructiveResolution };

export type SyncQueueRow =
  | { kind: "section"; key: string; title: string }
  | { kind: "command"; key: string; command: SyncQueueCommandItem; stages: DeliveryStage[] }
  | { kind: "file"; key: string; file: SyncQueueFileItem; stages: DeliveryStage[] };

const emptyQueue: SyncQueueState = { commands: [], files: [] };
const commandsSection: SyncQueueRow = { kind: "section", key: "section:commands", title: "Операции синхронизации" };
const filesSection: SyncQueueRow = { kind: "section", key: "section:files", title: "Вложения" };

// retainEqualItems keeps unchanged items by identity across reads, so their rows (and the
// delivery timeline derived from them) are reused and memoized cards skip re-rendering.
const commandRows = new WeakMap<SyncQueueCommandItem, SyncQueueRow>();
const fileRows = new WeakMap<SyncQueueFileItem, SyncQueueRow>();

function commandRow(command: SyncQueueCommandItem) {
  let row = commandRows.get(command);
  if (!row) {
    row = { kind: "command", key: `command:${command.clientOperationId}`, command, stages: deliveryStages(command, formatDateTime) };
    commandRows.set(command, row);
  }
  return row;
}

function fileRow(file: SyncQueueFileItem) {
  let row = fileRows.get(file);
  if (!row) {
    const stages = deliveryStages({ ...file, createdAtLocal: file.createdAtLocal ?? null, lastAttemptAt: file.lastAttemptAt ?? null, nextAttemptAt: file.nextAttemptAt ?? null, attemptCount: file.attemptCount ?? 0 }, formatDateTime);
    row = { kind: "file", key: `file:${file.clientFileId}`, file, stages };
    fileRows.set(file, row);
  }
  return row;
}

export function buildQueueRows({ commands, files }: SyncQueueState): SyncQueueRow[] {
  const rows: SyncQueueRow[] = [];
  if (commands.length > 0) rows.push(commandsSection, ...commands.map(commandRow));
  if (files.length > 0) rows.push(filesSection, ...files.map(fileRow));
  return rows;
}

/** Outbox state of the sync queue screen: grouped items, manual send, conflict and file actions. */
export function useSyncQueue() {
  const [state, setState] = useState<SyncQueueState>(emptyQueue);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const retryInFlight = useRef(false);
  // Mirrors actionInProgressId so the row callbacks stay stable and a double tap is refused in the same frame.
  const actionInFlight = useRef(false);

  const readQueue = useCallback(async (scope: DataOwnerContext) => {
    const [commands, files] = await Promise.all([
      listSyncQueueCommands(scope.ownerUserId), listSyncQueueFiles(scope.ownerUserId)
    ]);
    return { commands, files };
  }, []);
  const publishQueue = useCallback(({ commands, files }: SyncQueueState) => {
    setState(previous => {
      const nextCommands = retainEqualItems(previous.commands, commands, item => item.clientOperationId);
      const nextFiles = retainEqualItems(previous.files, files, item => item.clientFileId);
      return nextCommands === previous.commands && nextFiles === previous.files ? previous : { commands: nextCommands, files: nextFiles };
    });
    setLoadError(null);
  }, []);
  const loadFailed = useCallback((caught: unknown) => {
    if (caught instanceof StaleDataOwnerContextError) setState(emptyQueue);
    setLoadError(caught instanceof Error ? caught.message : "Не удалось прочитать очередь отправки.");
    void logMobileError("sync.queue.load.failed", caught);
  }, []);
  const loadSettled = useCallback(() => setIsLoading(false), []);
  const load = useFocusedOwnerLoad(readQueue, publishQueue, loadFailed, loadSettled);
  useFocusEffect(useCallback(() => { requestMobileDataRefresh("appActive"); }, []));

  // Sync events arriving during a read are coalesced into one more pass by the focused load.
  useFocusEffect(useCallback(() => subscribeToSyncEvents(() => {
    void load();
  }), [load]));

  const reload = useCallback(() => { void load(); }, [load]);

  const resolveCommand = useCallback(async (command: SyncQueueCommandItem, action: CommandResolution) => {
    if (actionInFlight.current) {
      return;
    }

    actionInFlight.current = true;
    setActionInProgressId(command.clientOperationId);
    setFeedback(null);
    try {
      const ownerUserId = await getStoredOwnerUserId();
      if (!ownerUserId) {
        throw new Error("Не удалось определить пользователя устройства.");
      }
      if (action === "serverWins") {
        await acceptServerConflict(ownerUserId, command);
        setFeedback("Состояние сервера принято. Конфликт закрыт, локальная очередь обновлена.");
      } else if (action === "dispatcher") {
        await sendConflictToDispatcher(ownerUserId, command);
        setFeedback("Конфликт сохранён и отмечен как ожидающий решения диспетчера.");
      } else if (action === "retryRevision") {
        await retryConflictWithLatestRevision(ownerUserId, command);
        setFeedback("Конфликт закрыт, команда создана с актуальной ревизией.");
      } else if (action === "continueSwitch") {
        await continuePatrolWithReconciliation(ownerUserId, command.clientOperationId);
        setFeedback("Новый обход поставлен на отдельный запуск. Результаты сохранены.");
      } else {
        await cancelRejectedCommand(ownerUserId, command);
        setFeedback("Отклонённое локальное действие отменено. Запись сохранена в журнале действий.");
      }
      await load();
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Не удалось изменить состояние команды.");
      void logMobileError("sync.queue.resolution.failed", caught);
    } finally {
      actionInFlight.current = false;
      setActionInProgressId(null);
    }
  }, [load]);

  const retryFailedFile = useCallback(async (file: SyncQueueFileItem) => {
    if (actionInFlight.current) {
      return;
    }
    actionInFlight.current = true;
    setActionInProgressId(file.clientFileId);
    setFeedback(null);
    try {
      const ownerUserId = await getStoredOwnerUserId();
      if (!ownerUserId) {
        throw new Error("Не удалось определить пользователя устройства.");
      }
      await retryFailedFileUpload(ownerUserId, file.clientFileId);
      await load();
      const result = await triggerForegroundSyncWithRetry({ mode: "manualAll" });
      await load();
      setFeedback(result.skipped ? syncResultMessage(result.skipped) : "Вложение снова поставлено в очередь отправки.");
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Не удалось повторить загрузку вложения.");
      void logMobileError("sync.queue.file_retry.failed", caught);
    } finally {
      actionInFlight.current = false;
      setActionInProgressId(null);
    }
  }, [load]);

  const retryNow = useCallback(async () => {
    if (retryInFlight.current) {
      return;
    }
    retryInFlight.current = true;
    setIsSyncing(true);
    setFeedback(null);
    try {
      const result = await triggerForegroundSyncWithRetry({ mode: "manualAll" });
      await load();
      setFeedback(syncResultMessage(result.skipped));
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Не удалось проверить очередь отправки.");
      void logMobileError("sync.queue.retry.failed", caught);
    } finally {
      retryInFlight.current = false;
      setIsSyncing(false);
    }
  }, [load]);

  const toggleError = useCallback((clientOperationId: string) => {
    setExpandedErrorId(current => (current === clientOperationId ? null : clientOperationId));
  }, []);
  const requestConfirmation = useCallback((command: SyncQueueCommandItem, action: DestructiveResolution) => {
    setPendingConfirmation({ command, action });
  }, []);
  const closeConfirmation = useCallback(() => setPendingConfirmation(null), []);

  const rows = useMemo(() => buildQueueRows(state), [state]);
  const counts = useMemo(() => ({
    summary: buildQueueSummary(state.commands, state.files),
    pendingCount: state.commands.length + state.files.length,
    waitingAuthCount: countWaitingAuthItems(state.commands),
    retryableCount: countRetryable(state.commands, state.files)
  }), [state]);

  return {
    ...counts,
    rows,
    isLoading,
    isSyncing,
    feedback,
    loadError,
    expandedErrorId,
    actionInProgressId,
    pendingConfirmation,
    reload,
    retryNow,
    resolveCommand,
    retryFailedFile,
    toggleError,
    requestConfirmation,
    closeConfirmation
  };
}

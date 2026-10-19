import { useFocusedOwnerLoad } from '@/sync/useFocusedOwnerLoad';
import { StaleDataOwnerContextError, type DataOwnerContext } from '@/auth/dataOwnerContext';
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { listSyncQueueFiles, retryFailedFileUpload, SyncQueueFileItem } from "@/db/repositories/filesRepository";
import { listSyncQueueCommands, SyncQueueCommandItem } from "@/db/repositories/outboxRepository";
import { continuePatrolWithReconciliation } from "@/services/patrolContinuationService";
import { useAppTheme } from "@/features/settings/themePreference";
import { countWaitingAuthItems } from "@/features/syncQueue/syncQueueAuthPolicy";
import { logMobileError } from "@/services/mobileErrorReporter";
import { requestMobileDataRefresh, triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { retainEqualItems } from "@/sync/retainEqualItems";
import { acceptServerConflict, canAcceptServerConflict, cancelRejectedCommand, retryConflictWithLatestRevision, sendConflictToDispatcher } from "@/services/conflictResolutionService";
import { ActionSheet } from "@/ui/ActionSheet";
import type { ThemeColors } from "@/ui/atomTheme";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type SyncQueueState = {
  commands: SyncQueueCommandItem[];
  files: SyncQueueFileItem[];
};

type CommandResolution = "serverWins" | "dispatcher" | "retryRevision" | "cancelRejected" | "continueSwitch";
type DestructiveResolution = Extract<CommandResolution, "serverWins" | "cancelRejected">;

export function SyncQueueScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [state, setState] = useState<SyncQueueState>({ commands: [], files: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ command: SyncQueueCommandItem; action: DestructiveResolution } | null>(null);
  const retryInFlight = useRef(false);
  const fileRetryInFlight = useRef(false);

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
    if (caught instanceof StaleDataOwnerContextError) setState({ commands: [], files: [] });
    setLoadError(caught instanceof Error ? caught.message : "Не удалось прочитать очередь отправки.");
    void logMobileError("sync.queue.load.failed", caught);
  }, []);
  const loadSettled = useCallback(() => setIsLoading(false), []);
  const load = useFocusedOwnerLoad(readQueue, publishQueue, loadFailed, loadSettled);
  useFocusEffect(useCallback(() => { requestMobileDataRefresh("appActive"); }, []));

  useFocusEffect(useCallback(() => subscribeToSyncEvents(() => {
    void load();
  }), [load]));

  async function resolveCommand(command: SyncQueueCommandItem, action: CommandResolution) {
    if (actionInProgressId) {
      return;
    }

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
      setActionInProgressId(null);
    }
  }
  async function retryFailedFile(file: SyncQueueFileItem) {
    if (actionInProgressId || fileRetryInFlight.current) {
      return;
    }
    fileRetryInFlight.current = true;
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
      fileRetryInFlight.current = false;
      setActionInProgressId(null);
    }
  }

  async function retryNow() {
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
  }

  const summary = useMemo(() => buildQueueSummary(state), [state]);
  const pendingCount = state.commands.length + state.files.length;
  const waitingAuthCount = countWaitingAuthItems(state.commands);
  const retryableCount = state.commands.filter((command) => ["pending", "sending", "retryLater", "waiting_network"].includes(command.status)).length
    + state.files.filter((file) => file.status !== "failed").length;

  return (
    <Screen title="Очередь отправки">
      {isLoading ? <ActivityIndicator /> : null}

      {!isLoading && loadError ? (
        <Card>
          <Text style={[styles.errorText, dangerBox(colors)]}>{loadError}</Text>
          <PrimaryButton icon="refresh-outline" label="\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0443" onPress={() => void load()} variant="secondary" />
        </Card>
      ) : null}

      {!isLoading && !loadError && pendingCount === 0 ? (
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>Все данные отправлены</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Сервер подтвердил все отчеты, команды и вложения.</Text>
          <PrimaryButton icon="refresh-outline" label="Проверить еще раз" onPress={() => void load()} variant="ghost" />
        </Card>
      ) : null}

      {!isLoading && pendingCount > 0 ? (
        <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Данные ожидают отправки</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>
              Приложение повторит отправку автоматически после восстановления связи.
            </Text>
          </View>
          <StatusPill label={`${pendingCount} в очереди`} tone="warning" />
        </View>

        {summary.errors > 0 ? (
          <Text style={[styles.notice, { backgroundColor: colors.backgroundAccent, borderColor: colors.border, color: colors.primary }]}>
            Требуют проверки: {summary.errors}. Откройте запись ниже, чтобы увидеть причину и исправить данные.
          </Text>
        ) : null}

        {waitingAuthCount > 0 ? (
          <View accessibilityLiveRegion="polite" style={[styles.authNotice, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
            <Text style={[styles.authNoticeTitle, { color: colors.warning }]}>Нужно подтвердить вход</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>
              Локальные данные сохранены. После подтверждения приложение автоматически отправит {waitingAuthCount} ожидающих операций.
            </Text>
            <PrimaryButton
              icon="log-in-outline"
              label="Подтвердить вход для синхронизации"
              onPress={() => router.push("/(auth)/login")}
              size="large"
              variant="secondary"
            />
          </View>
        ) : null}

        {feedback ? <Text accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: colors.backgroundAccent, borderColor: colors.border, color: colors.text }]}>{feedback}</Text> : null}

        {retryableCount > 0 ? (
          <PrimaryButton
            disabled={isSyncing}
            icon="refresh-outline"
            label={isSyncing ? "Проверяем отправку…" : "Отправить сейчас"}
            onPress={() => void retryNow()}
            size="large"
          />
        ) : null}
      </Card>
      ) : null}

      {state.commands.length > 0 ? (
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>Операции синхронизации</Text>
          {state.commands.map((command) => (
            <View
              key={command.clientOperationId}
              style={[styles.queueItem, { borderColor: colors.border }]}
            >
              <View style={styles.itemTop}>
                <View style={styles.itemTitleBox}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>{commandTitle(command)}</Text>
                  <Text style={[styles.text, { color: colors.mutedText }]}>
                    {commandSubject(command)}
                  </Text>
                </View>
                <StatusPill label={statusLabel(command.status, command.resolutionStatus)} tone={statusTone(command.status, command.resolutionStatus)} />
              </View>
                            <View style={styles.metaGrid}>
                <Meta label="Попытки" value={String(command.attemptCount)} />
                <Meta label="Последняя попытка" value={formatDateTime(command.lastAttemptAt)} />
                <Meta label="Следующая попытка" value={formatDateTime(command.nextAttemptAt)} />
                <Meta label={command.commandType === "completePatrolAssignment" ? "Отчёт" : "Маршрут"} value={command.assignmentRouteName || "-"} />
                <Meta label="Действие" value={commandActionLabel(command.status)} />
              </View>
              {command.lastError ? (
                <Pressable
                  accessibilityLabel={expandedErrorId === command.clientOperationId ? "Свернуть описание ошибки" : "Показать описание ошибки полностью"}
                  accessibilityRole="button"
                  onPress={() => setExpandedErrorId((current) => (current === command.clientOperationId ? null : command.clientOperationId))}
                >
                  <Text
                    style={expandedErrorId === command.clientOperationId ? [styles.errorText, dangerBox(colors)] : [styles.errorPreview, warningBox(colors)]}
                    numberOfLines={expandedErrorId === command.clientOperationId ? undefined : 2}
                  >
                    {command.lastError}
                  </Text>
                </Pressable>
              ) : null}
              {command.status === "conflict" ? (
                <View style={styles.actionGroup}>
                {command.commandType === "switchPatrolAssignment" && command.sourceAssignmentId ? (
                  <>
                    <Text style={[styles.text, { color: colors.mutedText }]}>Переход на другой обход не принят: {command.lastError ?? "сервер отменил исходный обход"}</Text>
                    <PrimaryButton
                      disabled={actionInProgressId === command.clientOperationId}
                      icon="play-circle-outline"
                      label="Продолжить новый обход"
                      onPress={() => void resolveCommand(command, "continueSwitch")}
                      size="large"
                      variant="secondary"
                    />
                  </>
                ) : null}
                {canAcceptServerConflict(command) ? (
                  <PrimaryButton
                    disabled={actionInProgressId === command.clientOperationId}
                    icon="cloud-done-outline"
                    label="Принять состояние сервера"
                    onPress={() => setPendingConfirmation({ command, action: "serverWins" })}
                    size="large"
                    variant="secondary"
                  />
                ) : null}
                  <PrimaryButton
                    disabled={actionInProgressId === command.clientOperationId}
                    icon="people-outline"
                    label="Передать диспетчеру"
                    onPress={() => void resolveCommand(command, "dispatcher")}
                    size="large"
                    variant="ghost"
                  />
                  {command.commandType === "completePatrolAssignment" && command.entityLocalId ? (
                    <PrimaryButton
                      disabled={actionInProgressId === command.clientOperationId}
                      icon="refresh-outline"
                      label="Повторить с актуальной ревизией"
                      onPress={() => void resolveCommand(command, "retryRevision")}
                      size="large"
                      variant="ghost"
                    />
                  ) : null}
                </View>
              ) : null}
              {command.status === "rejected" ? (
                <View style={styles.actionGroup}>
                  {command.commandType === "switchPatrolAssignment" && command.sourceAssignmentId ? (
                    <PrimaryButton
                      disabled={actionInProgressId === command.clientOperationId}
                      icon="play-circle-outline"
                      label="Продолжить новый обход"
                      onPress={() => void resolveCommand(command, "continueSwitch")}
                      size="large"
                      variant="secondary"
                    />
                  ) : null}
                  <PrimaryButton
                    disabled={actionInProgressId === command.clientOperationId}
                    icon="close-circle-outline"
                    label="Отменить локальное действие"
                    onPress={() => setPendingConfirmation({ command, action: "cancelRejected" })}
                    size="large"
                    variant="ghost"
                  />
                </View>
              ) : null}
              {command.commandType === "completePatrolAssignment" && command.entityLocalId ? (
                <PrimaryButton
                  icon={command.status === "rejected" || command.status === "conflict" ? "build-outline" : "shield-checkmark-outline"}
                  label={command.status === "rejected" || command.status === "conflict" ? "Проверить и исправить отчет" : "Открыть обход"}
                  onPress={() => router.push(
                    command.status === "rejected" || command.status === "conflict"
                      ? `/patrol/assignment/${command.entityLocalId}/all-points`
                      : `/patrol/assignment/${command.entityLocalId}`
                  )}
                  variant="secondary"
                />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      {state.files.length > 0 ? (
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>Вложения</Text>
          {state.files.map((file) => (
            <View key={file.clientFileId} style={[styles.queueItem, { borderColor: colors.border }]}>
              <View style={styles.itemTop}>
                <View style={[styles.fileIconBox, { backgroundColor: colors.backgroundAccent }]}>
                  <Ionicons color={colors.primary} name={file.mediaKind === "video" ? "videocam-outline" : "image-outline"} size={22} />
                </View>
                <View style={styles.itemTitleBox}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>{file.mediaKind === "video" ? "Видео" : "Фото"}</Text>
                  <Text style={[styles.text, { color: colors.mutedText }]} numberOfLines={2}>
                    {fileSubject(file)}
                  </Text>
                </View>
                <StatusPill label={fileStatusLabel(file.status)} tone={statusTone(file.status)} />
              </View>
                            <View style={styles.metaGrid}>
                <Meta label="Попытки" value={String(file.attemptCount ?? 0)} />
                <Meta label="Последняя попытка" value={formatDateTime(file.lastAttemptAt ?? null)} />
                <Meta label="Следующая попытка" value={formatDateTime(file.nextAttemptAt ?? null)} />
                <Meta label="Отчёт" value={file.assignmentRouteName || "-"} />
                <Meta label="Точка" value={file.pointName || (file.pointId ? "Точка маршрута" : "-")} />
                <Meta label="Действие" value={file.status === "failed" ? "Повторите загрузку" : "Ожидает отправки"} />
              </View>
              {file.lastError ? <Text style={[styles.errorPreview, warningBox(colors)]} numberOfLines={2}>{file.lastError}</Text> : null}
              {file.status === "failed" ? (
                <PrimaryButton
                  disabled={actionInProgressId !== null}
                  icon="cloud-upload-outline"
                  label="Повторить загрузку"
                  onPress={() => void retryFailedFile(file)}
                  size="large"
                  variant="secondary"
                />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <ActionSheet
        visible={pendingConfirmation !== null}
        title={pendingConfirmation ? confirmationTitle(pendingConfirmation.action) : ""}
        message={pendingConfirmation ? confirmationMessage(pendingConfirmation.command, pendingConfirmation.action) : undefined}
        onClose={() => setPendingConfirmation(null)}
        actions={pendingConfirmation ? [
          {
            danger: true,
            icon: pendingConfirmation.action === "serverWins" ? "cloud-done-outline" : "close-circle-outline",
            label: pendingConfirmation.action === "serverWins" ? "Да, принять состояние сервера" : "Да, отменить действие",
            onPress: () => void resolveCommand(pendingConfirmation.command, pendingConfirmation.action)
          },
          { icon: "arrow-undo-outline", label: "Оставить как есть", onPress: () => undefined }
        ] : []}
      />
    </Screen>
  );
}

function confirmationTitle(action: DestructiveResolution) {
  return action === "serverWins" ? "Принять состояние сервера?" : "Отменить локальное действие?";
}

function confirmationMessage(command: Pick<SyncQueueCommandItem, "commandType" | "assignmentRouteName">, action: DestructiveResolution) {
  const subject = `«${commandTitle(command)}»${command.assignmentRouteName ? ` (${command.assignmentRouteName})` : ""}`;
  if (action === "serverWins") {
    return `Телефон заменит локальное состояние данными сервера. Действие ${subject} не будет отправлено, а локальные изменения по этому обходу, которых нет на сервере, будут потеряны.`;
  }
  return `Действие ${subject} не будет отправлено на сервер и уйдёт из очереди. Вернуть его в очередь будет нельзя. Запись останется в журнале действий.`;
}

function commandSubject(command: SyncQueueCommandItem) {
  if (command.assignmentRouteName) return command.assignmentRouteName;
  switch (command.entityType) {
    case "workTask":
      return "Работа ЭМУ";
    case "shiftRemark":
      return "Замечание по смене";
    case "patrolPoint":
      return "Точка обхода";
    default:
      return "Обход";
  }
}

function fileSubject(file: SyncQueueFileItem) {
  if (file.assignmentRouteName) return file.pointName ? `${file.assignmentRouteName} · ${file.pointName}` : file.assignmentRouteName;
  if (file.workTaskId) return "Вложение к работе";
  if (file.remarkId) return "Вложение к замечанию";
  return "Вложение к отчёту";
}

function warningBox(colors: Partial<ThemeColors>) {
  return { backgroundColor: colors.warningSurface, borderColor: colors.warning, color: colors.warning };
}

function dangerBox(colors: Partial<ThemeColors>) {
  return { backgroundColor: colors.dangerSurface, borderColor: colors.danger, color: colors.danger };
}

function Meta({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.meta, { backgroundColor: colors.backgroundAccent }]}>
      <Text style={[styles.metaLabel, { color: colors.mutedText }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function buildQueueSummary(state: SyncQueueState) {
  const errors =
    state.commands.filter((command) => command.status === "conflict" || command.status === "rejected" || command.status === "invalidPayload").length +
    state.files.filter((file) => file.status === "failed").length;
  return { errors };
}

function commandTitle(command: Pick<SyncQueueCommandItem, "commandType">) {
  switch (command.commandType) {
    case "completePatrolAssignment":
      return "Отчет обхода";
    case "takePatrolRequest":
      return "Принятие заявки";
    case "acceptPatrolRequest":
      return "Заявка принята";
    case "releasePatrolRequest":
      return "Возврат заявки";
    case "startPatrolAssignment":
      return "Начало обхода";
    case "pausePatrolAssignment":
      return "Пауза обхода";
    case "resumePatrolAssignment":
      return "Продолжение обхода";
    case "handoffPatrolAssignment":
      return "Передача диспетчеру";
    case "markPatrolPointOk":
      return "Метка исправна";
    case "markPatrolPointIssue":
      return "Метка неисправна";
    case "scanPatrolPointNfc":
      return "Сканирование NFC";
    case "scanPatrolPointQr":
      return "Сканирование QR";
    case "createShiftRemark":
      return "Замечание по смене";
    case "attachShiftRemarkMedia":
      return "Вложение замечания";
    case "switchPatrolAssignment":
      return "Переход на другой обход";
    case "createPatrolAppeal":
      return "Обращение";
    case "uploadPatrolPhoto":
      return "Фото точки";
    case "createWorkTask":
      return "Новая работа";
    case "updateWorkTask":
      return "Изменение работы";
    case "pauseWorkTask":
      return "Приостановка работы";
    case "resumeWorkTask":
      return "Продолжение работы";
    case "completeWorkTask":
      return "Завершение работы";
    case "startPlannedWork":
      return "Начало плановой работы";
    case "joinWorkTask":
      return "Участие в работе";
    case "replaceWorkTaskParticipant":
      return "Замена участника работы";
    default:
      return "Операция синхронизации";
  }
}

function commandActionLabel(status: string) {
  switch (status) {
    case "conflict":
      return "Выбрать решение";
    case "rejected":
      return "Отменить локально";
    case "invalidPayload":
      return "Исправить данные";
    case "pending":
    case "sending":
    case "retryLater":
      return "Повторить отправку";
    default:
      return "-";
  }
}
function statusLabel(status: string, resolutionStatus: string | null = null) {
  if (status === "conflict" && resolutionStatus === "dispatcher") {
    return "Ожидает диспетчера";
  }

  if (resolutionStatus === "resolvedServerWins") {
    return "Принято состояние сервера";
  }
  if (resolutionStatus === "cancelledLocal") {
    return "Отменено локально";
  }
  if (resolutionStatus === "retryRequested") {
    return "Автоповтор запланирован";
  }

  switch (status) {
    case "pending":
      return "Локально сохранено";
    case "sending":
      return "Отправляется";
    case "retryLater":
      return "Повтор позже";
    case "accepted":
    case "duplicate":
      return "Принято сервером";
    case "conflict":
      return "Конфликт";
    case "rejected":
      return "Отклонено";
    case "invalidPayload":
      return "Повреждённые данные";
    case "waiting_network":
      return "Ждёт сети";
    case "waiting_auth":
      return "Нужен вход";
    case "wrong_contour":
      return "Другой сервер";
    case "blocked":
      return "Ждёт предыдущих действий";
    default:
      return "Ожидает отправки";
  }
}
function fileStatusLabel(status: string) {
  switch (status) {
    case "queued":
    case "localOnly":
      return "Ждёт загрузки";
    case "uploading":
      return "Загружается";
    case "retryLater":
      return "Повтор позже";
    case "uploaded":
    case "linked":
      return "Загружено";
    case "duplicate":
      return "Уже загружено";
    case "failed":
      return "Ошибка загрузки";
    default:
      return statusLabel(status);
  }
}
function statusTone(status: string, resolutionStatus: string | null = null): "success" | "warning" | "danger" {
  if (status === "accepted" || status === "duplicate" || status === "uploaded" || status === "linked") {
    return "success";
  }

  if (status === "conflict" && resolutionStatus === "dispatcher") {
    return "warning";
  }

  if (resolutionStatus === "resolvedServerWins" || resolutionStatus === "cancelledLocal") {
    return "success";
  }
  if (resolutionStatus === "retryRequested") {
    return "warning";
  }

  if (status === "conflict" || status === "rejected" || status === "invalidPayload" || status === "failed") {
    return "danger";
  }

  return "warning";
}
function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function syncResultMessage(skipped: "offline" | "serverUnavailable" | "unauthenticated" | "wrongContour" | "failed" | null) {
  switch (skipped) {
    case "offline":
      return "Нет подключения. Очередь сохранена и повторится автоматически после появления сети.";
    case "serverUnavailable":
      return "Сервер временно недоступен. Следующая попытка уже запланирована.";
    case "unauthenticated":
      return "Нужно войти повторно. Данные сохранены на телефоне.";
    case "failed":
      return "Отправка прервалась. Данные не потеряны — повтор можно запустить еще раз.";
    default:
      return "Проверка завершена. Список обновлен по подтверждениям сервера.";
  }
}

const styles = StyleSheet.create({
  actionGroup: {
    gap: 8
  },
  errorPreview: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    lineHeight: 18,
    padding: 10
  },
  errorText: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    lineHeight: 18,
    padding: 10
  },
  fileIconBox: {
    alignItems: "center",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  feedback: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    lineHeight: 18,
    padding: 10
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  itemTitle: {
    fontSize: 16,
    fontFamily: "Manrope_800ExtraBold"
  },
  itemTitleBox: {
    flex: 1,
    gap: 3
  },
  itemTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  meta: {
    borderRadius: 10,
    flex: 1,
    gap: 2,
    minWidth: 96,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  metaLabel: {
    fontSize: 11,
    fontFamily: "Manrope_800ExtraBold",
    textTransform: "uppercase"
  },
  metaValue: {
    fontSize: 13,
    fontFamily: "Manrope_700Bold"
  },
  authNotice: {
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1
  },
  authNoticeTitle: {
    fontSize: 16,
    fontFamily: "Manrope_800ExtraBold"
  },
  notice: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 13,
    fontFamily: "Manrope_700Bold",
    lineHeight: 18,
    padding: 10
  },
  queueItem: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  },
  title: {
    fontSize: 18,
    fontFamily: "Manrope_800ExtraBold"
  }
});

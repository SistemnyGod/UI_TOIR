import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { listSyncQueueFiles, SyncQueueFileItem } from "@/db/repositories/filesRepository";
import { listSyncQueueCommands, SyncQueueCommandItem } from "@/db/repositories/outboxRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { countWaitingAuthItems } from "@/features/syncQueue/syncQueueAuthPolicy";
import { logMobileError } from "@/services/mobileErrorReporter";
import { requestMobileDataRefresh, triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { acceptServerConflict, canAcceptServerConflict, cancelRejectedCommand, retryConflictWithLatestRevision, sendConflictToDispatcher } from "@/services/conflictResolutionService";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type SyncQueueState = {
  commands: SyncQueueCommandItem[];
  files: SyncQueueFileItem[];
};

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
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }
    try {
      const ownerUserId = await getStoredOwnerUserId();
      if (!ownerUserId) {
        setLoadError(null);
        setState({ commands: [], files: [] });
        return;
      }
      const [commands, files] = await Promise.all([
        listSyncQueueCommands(ownerUserId),
        listSyncQueueFiles(ownerUserId)
      ]);
      setState({ commands, files });
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Не удалось прочитать очередь отправки.");
      void logMobileError("sync.queue.load.failed", caught);
    } finally {
      hasLoadedRef.current = true;
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      requestMobileDataRefresh("appActive");
    }, [load])
  );

  useEffect(() => subscribeToSyncEvents(() => {
    void load();
  }), [load]);

  async function resolveCommand(command: SyncQueueCommandItem, action: "serverWins" | "dispatcher" | "retryRevision" | "cancelRejected") {
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
  async function retryNow() {
    if (isSyncing) {
      return;
    }

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
      setIsSyncing(false);
    }
  }

  const summary = useMemo(() => buildQueueSummary(state), [state]);
  const pendingCount = state.commands.length + state.files.length;
  const waitingAuthCount = countWaitingAuthItems(state.commands);
  const retryableCount = state.commands.filter((command) => ["pending", "sending", "retryLater"].includes(command.status)).length
    + state.files.filter((file) => file.status !== "failed").length;

  return (
    <Screen title="Очередь отправки">
      {isLoading ? <ActivityIndicator /> : null}

      {!isLoading && loadError ? (
        <Card>
          <Text style={styles.errorText}>{loadError}</Text>
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

      {!isLoading && !loadError && pendingCount > 0 ? (
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
          <Text style={styles.notice}>
            Требуют проверки: {summary.errors}. Откройте запись ниже, чтобы увидеть причину и исправить данные.
          </Text>
        ) : null}

        {waitingAuthCount > 0 ? (
          <View accessibilityLiveRegion="polite" style={styles.authNotice}>
            <Text style={styles.authNoticeTitle}>Нужно подтвердить вход</Text>
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

        {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text> : null}

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
                    {command.assignmentRouteName ?? command.entityLocalId ?? command.clientOperationId}
                  </Text>
                </View>
                <StatusPill label={statusLabel(command.status, command.resolutionStatus)} tone={statusTone(command.status, command.resolutionStatus)} />
              </View>
                            <View style={styles.metaGrid}>
                <Meta label="Попытки" value={String(command.attemptCount)} />
                <Meta label="Последняя попытка" value={formatDateTime(command.lastAttemptAt)} />
                <Meta label="Следующая попытка" value={formatDateTime(command.nextAttemptAt)} />
                <Meta label={command.commandType === "completePatrolAssignment" ? "Отчёт" : "Маршрут"} value={command.assignmentRouteName ?? command.entityLocalId ?? "-"} />
                <Meta label="Действие" value={commandActionLabel(command.status)} />
              </View>
              {command.lastError ? (
                <Pressable
                  accessibilityLabel={expandedErrorId === command.clientOperationId ? "Свернуть описание ошибки" : "Показать описание ошибки полностью"}
                  accessibilityRole="button"
                  onPress={() => setExpandedErrorId((current) => (current === command.clientOperationId ? null : command.clientOperationId))}
                >
                  <Text
                    style={expandedErrorId === command.clientOperationId ? styles.errorText : styles.errorPreview}
                    numberOfLines={expandedErrorId === command.clientOperationId ? undefined : 2}
                  >
                    {command.lastError}
                  </Text>
                </Pressable>
              ) : null}
              {command.status === "conflict" ? (
                <View style={styles.actionGroup}>
                {canAcceptServerConflict(command) ? (
                  <PrimaryButton
                    disabled={actionInProgressId === command.clientOperationId}
                    icon="cloud-done-outline"
                    label="Принять состояние сервера"
                    onPress={() => void resolveCommand(command, "serverWins")}
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
                <PrimaryButton
                  disabled={actionInProgressId === command.clientOperationId}
                  icon="close-circle-outline"
                  label="Отменить локальное действие"
                  onPress={() => void resolveCommand(command, "cancelRejected")}
                  size="large"
                  variant="ghost"
                />
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
                <View style={styles.fileIconBox}>
                  <Ionicons color="#1e5bff" name={file.mediaKind === "video" ? "videocam-outline" : "image-outline"} size={22} />
                </View>
                <View style={styles.itemTitleBox}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>{file.mediaKind === "video" ? "Видео" : "Фото"}</Text>
                  <Text style={[styles.text, { color: colors.mutedText }]} numberOfLines={2}>
                    {file.assignmentRouteName ?? file.localPath}
                  </Text>
                </View>
                <StatusPill label={fileStatusLabel(file.status)} tone={statusTone(file.status)} />
              </View>
                            <View style={styles.metaGrid}>
                <Meta label="Попытки" value={String(file.attemptCount ?? 0)} />
                <Meta label="Последняя попытка" value={formatDateTime(file.lastAttemptAt ?? null)} />
                <Meta label="Следующая попытка" value={formatDateTime(file.nextAttemptAt ?? null)} />
                <Meta label="Отчёт" value={file.assignmentRouteName ?? file.assignmentId ?? "-"} />
                <Meta label="Точка" value={file.pointId ?? "-"} />
                <Meta label="Действие" value={file.status === "failed" ? "Повторить загрузку" : "Ожидает отправки"} />
              </View>
              {file.lastError ? <Text style={styles.errorPreview} numberOfLines={2}>{file.lastError}</Text> : null}
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function buildQueueSummary(state: SyncQueueState) {
  const errors =
    state.commands.filter((command) => command.status === "conflict" || command.status === "rejected" || command.status === "invalidPayload").length +
    state.files.filter((file) => file.status === "failed").length;
  return { errors };
}

function commandTitle(command: SyncQueueCommandItem) {
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
    default:
      return command.commandType;
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
    default:
      return status;
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
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 10,
    borderWidth: 1,
    color: "#9a3412",
    fontSize: 13,
    lineHeight: 18,
    padding: 10
  },
  errorText: {
    backgroundColor: "#fff1f1",
    borderColor: "#fecaca",
    borderRadius: 10,
    borderWidth: 1,
    color: "#991b1b",
    fontSize: 13,
    lineHeight: 18,
    padding: 10
  },
  fileIconBox: {
    alignItems: "center",
    backgroundColor: "#eef5ff",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  feedback: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 10,
    borderWidth: 1,
    color: "#334155",
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
    fontWeight: "800"
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
    backgroundColor: "#f6f9fe",
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
    color: "#65758b",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  metaValue: {
    color: "#0b1f3f",
    fontSize: 13,
    fontWeight: "700"
  },
  authNotice: {
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fdba74"
  },
  authNoticeTitle: {
    color: "#9a3412",
    fontSize: 16,
    fontWeight: "800"
  },
  notice: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderRadius: 12,
    borderWidth: 1,
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700",
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
    fontWeight: "800"
  }
});

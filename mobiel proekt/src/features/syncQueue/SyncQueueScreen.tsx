import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { listSyncQueueFiles, SyncQueueFileItem } from "@/db/repositories/filesRepository";
import { listSyncQueueCommands, SyncQueueCommandItem } from "@/db/repositories/outboxRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
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
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const ownerUserId = await getStoredOwnerUserId();
      if (!ownerUserId) {
        setState({ commands: [], files: [] });
        return;
      }
      const [commands, files] = await Promise.all([
        listSyncQueueCommands(ownerUserId),
        listSyncQueueFiles(ownerUserId)
      ]);
      setState({ commands, files });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function retryNow() {
    if (isSyncing) {
      return;
    }

    setIsSyncing(true);
    setFeedback(null);
    try {
      const result = await triggerForegroundSyncWithRetry({ forceRetry: true });
      await load();
      setFeedback(syncResultMessage(result.skipped));
    } finally {
      setIsSyncing(false);
    }
  }

  const summary = useMemo(() => buildQueueSummary(state), [state]);
  const pendingCount = state.commands.length + state.files.length;
  const retryableCount = state.commands.filter((command) => ["pending", "sending", "retryLater"].includes(command.status)).length
    + state.files.filter((file) => file.status !== "failed").length;

  return (
    <Screen title="Очередь отправки">
      {isLoading ? <ActivityIndicator /> : null}

      {!isLoading && pendingCount === 0 ? (
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
          <Text style={styles.notice}>
            Требуют проверки: {summary.errors}. Откройте запись ниже, чтобы увидеть причину и исправить данные.
          </Text>
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
          <Text style={[styles.title, { color: colors.text }]}>Отчеты и команды</Text>
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
                <StatusPill label={statusLabel(command.status)} tone={statusTone(command.status)} />
              </View>
              <View style={styles.metaGrid}>
                <Meta label="Попытки" value={String(command.attemptCount)} />
                <Meta label="Обновлено" value={formatDateTime(command.updatedAtLocal)} />
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
                <Meta label="Точка" value={file.pointId ?? "-"} />
                <Meta label="Добавлено" value={formatDateTime(file.createdAtLocal)} />
              </View>
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
    state.commands.filter((command) => command.status === "conflict" || command.status === "rejected" || Boolean(command.lastError)).length +
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

function statusLabel(status: string) {
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
    default:
      return status;
  }
}

function fileStatusLabel(status: string) {
  switch (status) {
    case "queued":
    case "localOnly":
      return "Ждет загрузки";
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

function statusTone(status: string): "success" | "warning" | "danger" {
  if (status === "accepted" || status === "duplicate" || status === "uploaded" || status === "linked") {
    return "success";
  }

  if (status === "conflict" || status === "rejected" || status === "failed") {
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

function syncResultMessage(skipped: "offline" | "serverUnavailable" | "unauthenticated" | "failed" | null) {
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

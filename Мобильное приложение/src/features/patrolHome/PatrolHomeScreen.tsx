import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ActiveAssignment,
  AssignmentProgress,
  getActiveAssignmentWithProgress,
  listRequestBoard,
  RequestBoardItem
} from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function PatrolHomeScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [active, setActive] = useState<{ assignment: ActiveAssignment; progress: AssignmentProgress } | null>(null);
  const [requests, setRequests] = useState<RequestBoardItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    const [activeAssignment, requestRows] = await Promise.all([
      getActiveAssignmentWithProgress(),
      listRequestBoard()
    ]);
    setActive(activeAssignment);
    setRequests(requestRows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void loadLocal().catch(() => {
        if (isMounted) {
          setActive(null);
        }
      });

      return () => {
        isMounted = false;
      };
    }, [loadLocal])
  );

  useEffect(() => {
    return subscribeToSyncEvents(() => {
      void loadLocal();
    });
  }, [loadLocal]);

  async function handleRefresh() {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setMessage(null);

    try {
      const updated = await refreshMobileData();
      await loadLocal();
      setMessage(updated ? "Заявки обновлены." : "Нет сети. Показаны данные, сохранённые на телефоне.");
    } catch (error) {
      await loadLocal();
      setMessage(error instanceof Error ? error.message : "Не удалось обновить заявки.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const summary = useMemo(
    () => ({
      available: requests.filter((request) => request.status === "available" || request.status === "assigned").length,
      mine: requests.filter((request) => ["accepted", "inProgress", "paused"].includes(request.status)).length,
      unsent: requests.filter((request) => ["completedLocal", "syncing", "syncError", "authRequired", "needsDispatcherDecision"].includes(request.status)).length
    }),
    [requests]
  );
  const isCompletedLocal = active?.assignment.status === "completedLocal";
  const isAccepted = active?.assignment.status === "accepted";
  const isPaused = active?.assignment.status === "paused";
  const isInProgress = active?.assignment.status === "inProgress";
  const primaryAction = getPrimaryAction(active?.assignment.status);
  const visibleRequests = requests
    .filter((request) => ["available", "assigned", "accepted"].includes(request.status))
    .filter((request) => request.requestId !== active?.assignment.requestId)
    .slice(0, 5);

  return (
    <Screen title="Обход" subtitle={active ? undefined : "Выберите заявку, проверьте маршрут и подтвердите принятие."}>
      {active ? (
        <Card>
          <View style={styles.headerRow}>
            <View style={styles.titleBlock}>
              <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>Текущая заявка</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{active.assignment.routeName}</Text>
            </View>
            <StatusPill
              label={assignmentStatusLabel(active.assignment.status)}
              tone={isCompletedLocal || isAccepted || isPaused ? "warning" : isInProgress ? "success" : "neutral"}
            />
          </View>

          <View style={styles.progressHeader}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              {active.progress.completed} из {active.progress.total} меток
            </Text>
            <Text style={[styles.percent, { color: colors.text }]}>{progressPercent(active.progress)}%</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${progressPercent(active.progress)}%` }]} />
          </View>

          {!isCompletedLocal ? (
            <PrimaryButton
              icon={primaryAction.icon}
              label={primaryAction.label}
              onPress={() => router.push(primaryAction.path(active.assignment.assignmentId) as never)}
              size="large"
            />
          ) : (
            <Text style={[styles.text, { color: colors.mutedText }]}>
              Отчёт сохранён на телефоне. Он отправится автоматически при связи; статус можно посмотреть в очереди.
            </Text>
          )}

          <View style={styles.actions}>
            <PrimaryButton icon="list-outline" label="Все метки" onPress={() => router.push(`/patrol/assignment/${active.assignment.assignmentId}/all-points`)} variant="secondary" />
            <PrimaryButton icon="swap-horizontal-outline" label="Сменить заявку" onPress={() => router.push("/patrol/request-board")} variant="secondary" />
            {isCompletedLocal ? (
              <PrimaryButton icon="cloud-upload-outline" label="Очередь отправки" onPress={() => router.push("/settings/sync-queue" as never)} variant="secondary" />
            ) : null}
          </View>
        </Card>
      ) : (
        <Card>
          <View style={styles.headerRow}>
            <View style={styles.titleBlock}>
              <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>Активный обход</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Заявка не выбрана</Text>
            </View>
            <StatusPill label="Нет обхода" tone="neutral" />
          </View>
          <Text style={[styles.text, { color: colors.mutedText }]}>
            Откройте карточку заявки, проверьте маршрут и подтвердите принятие. Одним касанием из списка заявка не принимается.
          </Text>
          <View style={styles.quickStats}>
            <Text style={[styles.quickStat, { color: colors.text }]}>Доступно: {summary.available}</Text>
            <Text style={[styles.quickStat, { color: colors.text }]}>Мои: {summary.mine}</Text>
            <Text style={[styles.quickStat, { color: colors.text }]}>Не отправлено: {summary.unsent}</Text>
          </View>
          <PrimaryButton icon="list-outline" label="Выбрать заявку" onPress={() => router.push("/patrol/request-board")} size="large" />
        </Card>
      )}

      <View style={styles.requestSection}>
        <View style={styles.requestSectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Действующие заявки</Text>
          <Pressable accessibilityRole="button" disabled={isRefreshing} onPress={() => void handleRefresh()}>
            <Text style={[styles.link, { color: isRefreshing ? colors.mutedText : colors.primary }]}>
              {isRefreshing ? "Обновляем..." : "Обновить"}
            </Text>
          </Pressable>
        </View>

        {visibleRequests.length > 0 ? visibleRequests.map((request) => (
          <Pressable
            accessibilityHint="Открыть и проверить заявку"
            accessibilityRole="button"
            key={request.requestId}
            onPress={() => router.push(`/patrol/request/${request.requestId}`)}
          >
            <Card style={styles.requestCard}>
              <View style={styles.headerRow}>
                <View style={styles.titleBlock}>
                  <Text style={[styles.requestTitle, { color: colors.text }]}>{request.routeName}</Text>
                  <Text style={[styles.requestMeta, { color: colors.mutedText }]}>{request.assignedFullName ?? "Свободная заявка"}</Text>
                  <Text style={[styles.requestMeta, { color: colors.mutedText }]}>План: {formatDateTime(request.plannedStartAt)}</Text>
                </View>
                <StatusPill label={requestStatusLabel(request.status)} tone={request.status === "accepted" ? "warning" : "success"} />
              </View>
            </Card>
          </Pressable>
        )) : (
          <Card style={styles.requestCard}>
            <Text style={[styles.requestTitle, { color: colors.text }]}>Заявок нет</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>
              Новые заявки появятся здесь автоматически после push-сигнала или обновления данных.
            </Text>
          </Card>
        )}
      </View>

      {message ? <Text style={[styles.message, { color: colors.mutedText }]}>{message}</Text> : null}
    </Screen>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function progressPercent(progress: AssignmentProgress) {
  return progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
}

function assignmentStatusLabel(status: ActiveAssignment["status"]) {
  switch (status) {
    case "accepted":
      return "Принята";
    case "inProgress":
      return "В работе";
    case "paused":
      return "Пауза";
    case "completedLocal":
      return "Ожидает отправки";
    case "completedServer":
      return "Отправлено";
    case "syncError":
      return "Ошибка отправки";
    case "authRequired":
      return "Нужно войти";
    case "needsDispatcherDecision":
      return "Решение диспетчера";
    case "cancelledServer":
      return "Отменена";
    default:
      return "Обход";
  }
}

function requestStatusLabel(status: RequestBoardItem["status"]) {
  if (status === "accepted") {
    return "Принята";
  }

  if (status === "assigned") {
    return "Назначена";
  }

  return "Доступна";
}

function getPrimaryAction(status: ActiveAssignment["status"] | undefined) {
  if (status === "accepted" || status === "paused") {
    return {
      icon: "play-outline" as const,
      label: status === "paused" ? "Продолжить обход" : "Начать обход",
      path: (assignmentId: string) => `/patrol/assignment/${assignmentId}`
    };
  }

  return {
    icon: "scan-outline" as const,
    label: "Сканировать NFC",
    path: (assignmentId: string) => `/patrol/assignment/${assignmentId}/scan-nfc`
  };
}

const styles = StyleSheet.create({
  actions: {
    gap: 10
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  link: {
    fontSize: 14,
    fontWeight: "800"
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  },
  percent: {
    fontSize: 18,
    fontWeight: "900"
  },
  progressFill: {
    backgroundColor: "#1e5bff",
    height: 12
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  progressTrack: {
    borderRadius: 999,
    height: 12,
    overflow: "hidden"
  },
  quickStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  quickStat: {
    backgroundColor: "#eef4ff",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  requestCard: {
    padding: 14
  },
  requestMeta: {
    fontSize: 13,
    lineHeight: 18
  },
  requestSection: {
    gap: 10
  },
  requestSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 23
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800"
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900"
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  titleBlock: {
    flex: 1,
    gap: 6
  }
});

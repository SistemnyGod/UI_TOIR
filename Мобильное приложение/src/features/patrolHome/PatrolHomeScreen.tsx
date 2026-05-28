import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { listLocalNotifications } from "@/db/repositories/notificationRepository";
import {
  ActiveAssignment,
  AssignmentProgress,
  getActiveAssignmentWithProgress,
  listRequestBoard,
  RequestBoardItem
} from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function PatrolHomeScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [active, setActive] = useState<{ assignment: ActiveAssignment; progress: AssignmentProgress } | null>(null);
  const [requests, setRequests] = useState<RequestBoardItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    const [activeAssignment, requestRows, notifications] = await Promise.all([
      getActiveAssignmentWithProgress(),
      listRequestBoard(),
      listLocalNotifications(20)
    ]);
    setActive(activeAssignment);
    setRequests(requestRows);
    setUnreadNotifications(notifications.filter((notification) => !notification.readAt).length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void Promise.all([getActiveAssignmentWithProgress(), listRequestBoard(), listLocalNotifications(20)]).then(
        ([activeAssignment, requestRows, notifications]) => {
          if (isMounted) {
            setActive(activeAssignment);
            setRequests(requestRows);
            setUnreadNotifications(notifications.filter((notification) => !notification.readAt).length);
          }
        }
      );

      return () => {
        isMounted = false;
      };
    }, [])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    setMessage(null);

    try {
      const updated = await refreshMobileData();
      await loadLocal();
      setMessage(updated ? "Заявки обновлены." : "Нет сети. Показаны данные, сохраненные на телефоне.");
    } catch (error) {
      await loadLocal();
      setMessage(error instanceof Error ? error.message : "Не удалось обновить заявки.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const summary = useMemo(
    () => ({
      available: requests.filter((request) => request.status === "available").length,
      inProgress: requests.filter((request) => request.status === "inProgress").length,
      total: requests.length
    }),
    [requests]
  );

  return (
    <Screen title="Обход" subtitle="Рабочий экран сотрудника для заявок, меток и отправки отчета.">
      <View style={styles.summaryRow}>
        <Metric label="Доступно" value={summary.available} tone="success" />
        <Metric label="В работе" value={summary.inProgress} tone="warning" />
        <Metric label="Всего" value={summary.total} />
      </View>

      <View style={styles.actions}>
        <PrimaryButton disabled={isRefreshing} label={isRefreshing ? "Обновляем заявки..." : "Обновить заявки"} onPress={handleRefresh} />
        <PrimaryButton label="Выбрать заявку" onPress={() => router.push("/patrol/request-board")} variant="secondary" />
      </View>

      {message ? <Text style={[styles.message, { color: colors.mutedText }]}>{message}</Text> : null}

      {unreadNotifications > 0 ? (
        <Card style={styles.notificationCard}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Новые уведомления</Text>
            <StatusPill label={`${unreadNotifications}`} tone="warning" />
          </View>
          <Text style={[styles.text, { color: colors.mutedText }]}>Есть новые сообщения по заявкам или синхронизации.</Text>
        </Card>
      ) : null}

      {active ? (
        <Card>
          <View style={styles.row}>
            <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>Текущая заявка</Text>
            <StatusPill
              label={active.assignment.status === "completedLocal" ? "Ожидает отправки" : "В работе"}
              tone={active.assignment.status === "completedLocal" ? "warning" : "success"}
            />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{active.assignment.routeName}</Text>
          {active.assignment.status === "completedLocal" ? (
            <Text style={[styles.text, { color: colors.mutedText }]}>
              Отчет сохранен на телефоне и отправится автоматически, когда приложение открыто и есть интернет.
            </Text>
          ) : null}
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${progressPercent(active.progress)}%` }]} />
          </View>
          <Text style={[styles.text, { color: colors.mutedText }]}>
            {active.progress.completed} из {active.progress.total} меток заполнено
          </Text>
          <View style={styles.metrics}>
            <StatusPill label={`Отложено: ${active.progress.deferred}`} tone={active.progress.deferred > 0 ? "warning" : "neutral"} />
            <StatusPill label={`Неисправно: ${active.progress.issues}`} tone={active.progress.issues > 0 ? "danger" : "neutral"} />
          </View>
          <PrimaryButton
            label={active.assignment.status === "completedLocal" ? "Открыть сохраненный отчет" : "Открыть активный обход"}
            onPress={() => router.push(`/patrol/assignment/${active.assignment.assignmentId}`)}
          />
        </Card>
      ) : (
        <Card>
          <View style={styles.row}>
            <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>Активный обход</Text>
            <StatusPill label="Нет заявки" />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Заявка не выбрана</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>
            Доступно заявок: {summary.total}. После выбора здесь появится маршрут, прогресс меток и отправка отчета.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.metricValue, { color: colors.text }, tone === "success" ? styles.success : null, tone === "warning" ? styles.warning : null]}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: colors.mutedText }]}>{label}</Text>
    </View>
  );
}

function progressPercent(progress: AssignmentProgress) {
  return progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
}

const styles = StyleSheet.create({
  actions: {
    gap: 10
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10
  },
  metric: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800"
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "700"
  },
  cardTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 25
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800"
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  notificationCard: {
    borderColor: "#fed7aa"
  },
  progressFill: {
    backgroundColor: "#1e5bff",
    height: 10
  },
  progressTrack: {
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  success: {
    color: "#22c55e"
  },
  warning: {
    color: "#f59e0b"
  }
});

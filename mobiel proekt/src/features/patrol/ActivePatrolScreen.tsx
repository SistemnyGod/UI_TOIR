import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ActiveAssignment,
  AssignmentProgress,
  getAssignmentById,
  getAssignmentProgress,
  handoffAssignmentLocally,
  pauseAssignmentLocally,
  resumeAssignmentLocally,
  startAssignmentLocally
} from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { reconcileAcceptedCompleteReports } from "@/sync/syncEngine";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { ActionSheet } from "@/ui/ActionSheet";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function ActivePatrolScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const [assignment, setAssignment] = useState<ActiveAssignment | null>(null);
  const [progress, setProgress] = useState<AssignmentProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const loadAssignment = useCallback(async () => {
    const [loadedAssignment, loadedProgress] = await Promise.all([
      getAssignmentById(assignmentId),
      getAssignmentProgress(assignmentId)
    ]);
    setAssignment(loadedAssignment);
    setProgress(loadedAssignment ? loadedProgress : null);
  }, [assignmentId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      void loadAssignment().catch(() => {
        if (isMounted) {
          setAssignment(null);
          setProgress(null);
        }
      });
      return () => {
        isMounted = false;
      };
    }, [loadAssignment])
  );

  useEffect(() => subscribeToSyncEvents((event) => {
    if (event.completedAssignmentIds.includes(assignmentId) || event.cancelledAssignmentIds?.includes(assignmentId)) {
      void loadAssignment();
    }
  }), [assignmentId, loadAssignment]);

  useEffect(() => {
    if (assignment?.status === "completedLocal") {
      void reconcileAcceptedCompleteReports(assignment.assignmentId)
        .then(() => loadAssignment())
        .finally(triggerForegroundSyncWithRetry);
    }
  }, [assignment?.assignmentId, assignment?.status, loadAssignment]);

  async function runAction(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      await loadAssignment();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось выполнить действие.");
    }
  }

  async function handleRetrySubmit() {
    await runAction(async () => {
      await reconcileAcceptedCompleteReports(assignmentId);
      await triggerForegroundSyncWithRetry({ forceRetry: true });
    });
  }

  if (!assignment || !progress) {
    return (
      <Screen title="Обход" subtitle="Маршрут, прогресс и безопасные действия.">
        <Card>
          <Text style={[styles.text, { color: colors.mutedText }]}>Обход не найден на телефоне.</Text>
        </Card>
        <PrimaryButton icon="arrow-back-outline" label="Назад к заявкам" onPress={() => router.replace("/patrol/request-board")} variant="secondary" />
      </Screen>
    );
  }

  const percent = progressPercent(progress);
  const isAccepted = assignment.status === "accepted";
  const isPaused = assignment.status === "paused";
  const isInProgress = assignment.status === "inProgress";
  const isCompletedLocal = assignment.status === "completedLocal";
  const isCompletedServer = assignment.status === "completedServer";
  const isBlocked = ["needsDispatcherDecision", "cancelledServer", "authRequired", "syncError", "conflict"].includes(assignment.status);
  const isReadyForReview = progress.total > 0 && progress.completed >= progress.total;

  return (
    <Screen title={assignment.routeName} subtitle="Следуйте следующему действию — прогресс сохраняется автоматически.">
      <Card>
        <View style={styles.routeHeader}>
          <View style={styles.routeTextBox}>
            <Text style={[styles.employeeLine, { color: colors.mutedText }]}>Текущий обход</Text>
            <Text style={[styles.routeTitle, { color: colors.text }]}>{assignment.routeName}</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>Начат: {formatDateTime(assignment.startedAtLocal)}</Text>
          </View>
          <StatusPill label={assignmentStatusLabel(assignment.status)} tone={assignmentStatusTone(assignment.status)} />
        </View>

        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: colors.text }]}>Прогресс</Text>
          <Text style={[styles.progressLabel, { color: colors.text }]}>{progress.completed} из {progress.total} точек</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { width: `${percent}%` }]} />
        </View>
        <Text style={[styles.percentText, { color: colors.mutedText }]}>{percent}%</Text>
        <View style={styles.nextStepBox}>
          <Text style={styles.nextStepLabel}>Следующий шаг</Text>
          <Text style={[styles.nextStepText, { color: colors.text }]}>{nextStepText(assignment.status, progress)}</Text>
        </View>
        {progress.deferred > 0 || progress.issues > 0 || progress.skipped > 0 ? (
          <Text style={[styles.percentText, { color: colors.mutedText }]}>Отложено: {progress.deferred}. Неисправно: {progress.issues}. Метка недоступна: {progress.skipped}.</Text>
        ) : null}
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isBlocked ? (
        <Card style={styles.stateCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Нужна проверка</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Локальные данные сохранены. Откройте очередь синхронизации или дождитесь решения диспетчера.</Text>
        </Card>
      ) : null}

      {isCompletedLocal ? (
        <Card style={styles.stateCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Отчет сохранен на телефоне</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Отправка продолжится автоматически при связи. Можно повторить вручную из очереди.</Text>
        </Card>
      ) : null}

      {isCompletedServer ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Отчет принят сервером</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Можно выбрать новую заявку.</Text>
        </Card>
      ) : null}

      {isAccepted || isPaused ? (
        <PrimaryButton
          icon="play-outline"
          label={isPaused ? "Продолжить обход" : "Начать обход"}
          onPress={() => runAction(async () => {
            if (isPaused) {
              await resumeAssignmentLocally(assignment.assignmentId);
            } else {
              await startAssignmentLocally(assignment.assignmentId);
            }
          })}
          size="large"
        />
      ) : null}
      {isInProgress ? (
        <PrimaryButton
          icon={isReadyForReview ? "document-text-outline" : "scan-outline"}
          label={isReadyForReview ? "Проверить отчёт" : "Сканировать NFC"}
          onPress={() => router.push(isReadyForReview
            ? `/patrol/assignment/${assignment.assignmentId}/submit`
            : `/patrol/assignment/${assignment.assignmentId}/scan-nfc`)}
          size="large"
        />
      ) : null}
      {isCompletedLocal ? <PrimaryButton icon="refresh-outline" label="Повторить отправку" onPress={handleRetrySubmit} size="large" /> : null}
      {isBlocked ? <PrimaryButton icon="cloud-upload-outline" label="Открыть очередь" onPress={() => router.push("/settings/sync-queue" as never)} size="large" /> : null}
      {isCompletedServer ? <PrimaryButton icon="checkmark-circle-outline" label="К новым заявкам" onPress={() => router.replace("/patrol/request-board")} size="large" /> : null}

      <View style={styles.secondaryBar}>
        {!isCompletedServer ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/patrol/assignment/${assignment.assignmentId}/all-points`)} style={styles.linkButton}>
            <Ionicons color={colors.primary} name="list-outline" size={19} />
            <Text style={[styles.linkLabel, { color: colors.primary }]}>Все метки</Text>
          </Pressable>
        ) : <View />}
        {isInProgress ? (
          <Pressable accessibilityLabel="Дополнительные действия" accessibilityRole="button" onPress={() => setIsMenuOpen(true)} style={styles.iconButton}>
            <Ionicons color={colors.primary} name="ellipsis-horizontal" size={22} />
          </Pressable>
        ) : null}
      </View>
      <ActionSheet
        actions={[
          { label: "QR-резерв", icon: "qr-code-outline", onPress: () => router.push(`/patrol/assignment/${assignment.assignmentId}/scan-qr`) },
          { label: "Приостановить", icon: "pause-outline", onPress: () => void runAction(async () => { await pauseAssignmentLocally(assignment.assignmentId); }) },
          { label: "Передать диспетчеру", icon: "alert-circle-outline", danger: true, onPress: () => void runAction(async () => { await handoffAssignmentLocally(assignment.assignmentId); }) }
        ]}
        onClose={() => setIsMenuOpen(false)}
        title="Действия с обходом"
        visible={isMenuOpen}
      />
    </Screen>
  );
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
      return "Ждет отправки";
    case "completedServer":
      return "Отправлено";
    case "needsDispatcherDecision":
      return "Решение";
    case "cancelledServer":
      return "Отменена";
    case "authRequired":
      return "Нужен вход";
    case "syncError":
    case "conflict":
      return "Ошибка";
    default:
      return "Обход";
  }
}

function assignmentStatusTone(status: ActiveAssignment["status"]) {
  if (status === "inProgress" || status === "completedServer") {
    return "success";
  }
  if (status === "syncError" || status === "authRequired" || status === "cancelledServer" || status === "conflict") {
    return "danger";
  }
  if (status === "accepted" || status === "paused" || status === "completedLocal" || status === "needsDispatcherDecision") {
    return "warning";
  }
  return "neutral";
}

function nextStepText(status: ActiveAssignment["status"], progress: AssignmentProgress) {
  if (status === "accepted") {
    return "Нажмите \"Начать обход\", когда готовы идти по маршруту.";
  }
  if (status === "paused") {
    return "Нажмите \"Продолжить обход\", чтобы вернуться к меткам.";
  }
  if (status === "completedLocal") {
    return "Отчет сохранен. Он отправится автоматически, статус виден в очереди.";
  }
  if (status === "completedServer") {
    return "Отчет принят сервером. Можно выбрать новую заявку.";
  }
  if (status === "needsDispatcherDecision") {
    return "Данные сохранены. Дождитесь решения диспетчера или откройте очередь.";
  }
  if (status === "authRequired") {
    return "Нужно войти снова. Локальные данные и отчет не удалены.";
  }
  if (status === "syncError" || status === "conflict") {
    return "Откройте очередь отправки и повторите синхронизацию.";
  }
  if (status === "cancelledServer") {
    return "Заявка отменена. Выполнять обход по ней не нужно.";
  }
  if (progress.completed >= progress.total && progress.total > 0) {
    return "Все метки заполнены. Проверьте отчет и нажмите \"Отправить отчет\".";
  }
  return "Сканируйте следующую метку через NFC или откройте список всех меток.";
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

const styles = StyleSheet.create({
  routeHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  routeTextBox: {
    flex: 1,
    gap: 4
  },
  employeeLine: {
    fontSize: 13,
    fontWeight: "800"
  },
  routeTitle: {
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 27
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900"
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: "800"
  },
  progressTrack: {
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: "#22c55e",
    borderRadius: 999,
    height: "100%"
  },
  percentText: {
    fontSize: 13,
    fontWeight: "700"
  },
  nextStepBox: {
    backgroundColor: "#eef4ff",
    borderRadius: 14,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  nextStepLabel: {
    color: "#1e5bff",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  nextStepText: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19
  },
  stateCard: {
    gap: 8
  },
  secondaryBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  linkButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 4
  },
  linkLabel: {
    fontSize: 14,
    fontWeight: "800"
  },
  iconButton: {
    alignItems: "center",
    borderColor: "#dbe5f2",
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    lineHeight: 20
  }
});

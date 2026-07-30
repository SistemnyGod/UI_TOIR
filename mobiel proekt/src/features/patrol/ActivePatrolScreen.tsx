import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import {
  ActiveAssignment,
  AssignmentProgress,
  completeAssignmentLocally,
  getAssignmentById,
  getAssignmentProgress,
  getAssignmentScanPolicy,
  handoffAssignmentLocally,
  pauseAssignmentLocally,
  resumeAssignmentLocally,
  startAssignmentLocally
} from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { logMobileError } from "@/services/mobileErrorReporter";
import { reconcileAcceptedCompleteReports } from "@/sync/syncEngine";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { requestMobileDataRefresh } from "@/sync/syncTriggers";
import { requestPatrolSync } from "@/sync/PatrolSyncCoordinator";
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
  const [scanPolicy, setScanPolicy] = useState({ nfcEnabled: false, qrFallbackEnabled: false });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [submissionNotice, setSubmissionNotice] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const actionInProgressRef = useRef(false);

  const loadAssignment = useCallback(async (options: { showLoader?: boolean } = {}) => {
    if (options.showLoader) {
      setIsLoading(true);
    }
    try {
      const [loadedAssignment, loadedProgress, loadedScanPolicy] = await Promise.all([
        getAssignmentById(assignmentId),
        getAssignmentProgress(assignmentId),
        getAssignmentScanPolicy(assignmentId)
      ]);
      setAssignment(loadedAssignment);
      setScanPolicy(loadedScanPolicy);
      setProgress(loadedAssignment ? loadedProgress : null);
      setLoadError(null);
    } finally {
      setIsLoading(false);
    }
  }, [assignmentId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      void loadAssignment({ showLoader: true }).catch((caught) => {
        void logMobileError("patrol.active-load.failed", caught);
        if (isMounted) {
          setLoadError(caught instanceof Error ? caught.message : "Не удалось прочитать текущий обход.");
          setIsLoading(false);
        }
      });
      requestMobileDataRefresh("appActive");
      return () => {
        isMounted = false;
      };
    }, [loadAssignment])
  );

  useEffect(() => subscribeToSyncEvents((event) => {
    if (event.snapshotRefreshed === true || event.completedAssignmentIds.includes(assignmentId) || event.cancelledAssignmentIds?.includes(assignmentId)) {
      void loadAssignment().catch((caught) => {
        void logMobileError("patrol.active-sync-load.failed", caught);
        setLoadError(caught instanceof Error ? caught.message : "Не удалось обновить текущий обход.");
      });
    }
  }), [assignmentId, loadAssignment]);

  useEffect(() => {
    if (assignment?.status === "completedLocal") {
      void reconcileAcceptedCompleteReports(assignment.assignmentId)
        .then(() => loadAssignment())
        .catch((caught) => {
          void logMobileError("patrol.active-reconcile.failed", caught);
          setLoadError(caught instanceof Error ? caught.message : "Не удалось проверить доставку отчёта.");
        })
        .finally(() => { void requestPatrolSync({ mode: "normal" }); });
    }
  }, [assignment?.assignmentId, assignment?.status, loadAssignment]);

  async function runAction(action: () => Promise<void>) {
    if (actionInProgressRef.current) {
      return;
    }
    actionInProgressRef.current = true;
    setIsActing(true);
    setError(null);
    try {
      await action();
      await loadAssignment();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось выполнить действие.");
    } finally {
      actionInProgressRef.current = false;
      setIsActing(false);
    }
  }

  async function handleRetrySubmit() {
    await runAction(async () => {
      await reconcileAcceptedCompleteReports(assignmentId);
      await requestPatrolSync({ mode: "manualReport", assignmentId });
    });
  }

  function confirmReportSubmission() {
    if (!assignment || !progress || progress.total === 0 || progress.completed < progress.total || actionInProgressRef.current) {
      return;
    }

    Alert.alert(
      "Отправить отчёт?",
      "Все " + progress.total + " отметок заполнены. Отчёт будет сохранён на телефоне и отправлен автоматически при наличии сети.",
      [
        { text: "Нет", style: "cancel" },
        {
          text: "Да, отправить",
          onPress: () => {
            void runReportSubmission();
          }
        }
      ]
    );
  }

  async function runReportSubmission() {
    if (actionInProgressRef.current) {
      return;
    }

    actionInProgressRef.current = true;
    setIsActing(true);
    setError(null);
    setSubmissionNotice(null);
    try {
      await completeAssignmentLocally(assignmentId);
      const syncResult = await requestPatrolSync({ mode: "manualReport", assignmentId });
      await loadAssignment();
      setSubmissionNotice(getSubmissionNotice(syncResult.skipped));
    } catch (caughtError) {
      void logMobileError("patrol.report.submit.failed", caughtError);
      setSubmissionNotice("Отчёт сохранён на телефоне. Приложение повторит отправку автоматически.");
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось сохранить отчёт на телефоне.");
    } finally {
      actionInProgressRef.current = false;
      setIsActing(false);
    }
  }

  if (isLoading && !assignment) {
    return (
      <Screen title="Обход" subtitle="Маршрут, прогресс и безопасные действия.">
        <Card><Text style={[styles.text, { color: colors.mutedText }]}>Загрузка...</Text></Card>
      </Screen>
    );
  }

  if (loadError && !assignment) {
    return (
      <Screen title="Обход" subtitle="Маршрут, прогресс и безопасные действия.">
        <Card>
          <Text style={[styles.text, { color: "#b91c1c" }]}>{loadError}</Text>
          <PrimaryButton icon="refresh-outline" label="Повторить загрузку" onPress={() => void loadAssignment()} variant="secondary" />
        </Card>
      </Screen>
    );
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
  const isBlocked = ["needsDispatcherDecision", "cancelledServer", "authRequired", "syncError", "conflict", "releasePending"].includes(assignment.status);
  const isReadyForReview = progress.total > 0 && progress.completed >= progress.total;

  return (
    <Screen
      title={assignment.routeName}
      subtitle="Следуйте следующему действию — прогресс сохраняется автоматически."
      bottomAction={isInProgress ? (
        <PrimaryButton
          disabled={isActing || progress.total === 0}
          icon={isReadyForReview ? "document-text-outline" : scanPolicy.nfcEnabled ? "scan-outline" : "list-outline"}
          label={progress.total === 0
            ? "Загружаем метки маршрута"
            : isReadyForReview
              ? "Отправить отчёт"
              : scanPolicy.nfcEnabled
                ? "Сканировать NFC"
                : "Открыть все метки"}
          onPress={() => {
            if (isReadyForReview) {
              confirmReportSubmission();
            } else if (scanPolicy.nfcEnabled) {
              router.push(`/patrol/assignment/${assignment.assignmentId}/scan-nfc`);
            } else {
              router.push(`/patrol/assignment/${assignment.assignmentId}/all-points`);
            }
          }}
          size="large"
        />
      ) : null}
    >
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
          <Text style={[styles.progressLabel, { color: colors.text }]}>{progress.total === 0 ? "Загружаем точки маршрута" : `${progress.completed} из ${progress.total} точек`}</Text>
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
          <Text style={[styles.text, { color: colors.mutedText }]}>Отчёт отправляется только после ручного подтверждения. Если он сохранён офлайн, очередь доставит его после подключения.</Text>
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
          disabled={isActing || progress.total === 0}
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
      {isCompletedLocal ? <PrimaryButton disabled={isActing} icon="refresh-outline" label="Повторить отправку" onPress={handleRetrySubmit} size="large" /> : null}
      {submissionNotice ? <Text accessibilityLiveRegion="polite" style={[styles.text, { color: colors.primary }]}>{submissionNotice}</Text> : null}
      {isBlocked ? <PrimaryButton icon="cloud-upload-outline" label="Открыть очередь" onPress={() => router.push("/settings/sync-queue" as never)} size="large" /> : null}
      {isCompletedServer ? <PrimaryButton icon="checkmark-circle-outline" label="К новым заявкам" onPress={() => router.replace("/patrol/request-board")} size="large" /> : null}

      <View style={styles.secondaryBar}>
        {!isCompletedServer && !isBlocked ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/patrol/assignment/${assignment.assignmentId}/all-points`)} style={styles.linkButton}>
            <Ionicons color={colors.primary} name="list-outline" size={19} />
            <Text style={[styles.linkLabel, { color: colors.primary }]}>Все метки</Text>
          </Pressable>
        ) : <View />}
        {isReadyForReview && !isCompletedLocal && !isCompletedServer ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/patrol/assignment/${assignment.assignmentId}/submit`)} style={styles.linkButton}>
            <Ionicons color={colors.primary} name="document-text-outline" size={19} />
            <Text style={[styles.linkLabel, { color: colors.primary }]}>Проверить отчёт</Text>
          </Pressable>
        ) : null}
        {isInProgress ? (
          <Pressable accessibilityLabel="Дополнительные действия" accessibilityRole="button" onPress={() => setIsMenuOpen(true)} style={styles.iconButton}>
            <Ionicons color={colors.primary} name="ellipsis-horizontal" size={22} />
          </Pressable>
        ) : null}
      </View>
      <ActionSheet
        actions={[
          ...(scanPolicy.qrFallbackEnabled ? [{ label: "QR", icon: "qr-code-outline" as const, onPress: () => router.push(`/patrol/assignment/${assignment.assignmentId}/scan-qr`) }] : []),
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
    return "Отчёт сохранён после ручного подтверждения. Если сети нет, он будет доставлен после подключения.";
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


function getSubmissionNotice(skipped: "offline" | "serverUnavailable" | "unauthenticated" | "wrongContour" | "failed" | null) {
  if (skipped === "offline") return "Нет сети. Отчёт сохранён на телефоне и будет отправлен автоматически.";
  if (skipped === "serverUnavailable") return "Сервер временно недоступен. Отчёт сохранён, повторная отправка запланирована.";
  if (skipped === "unauthenticated") return "Отчёт сохранён на телефоне. Синхронизация продолжится после восстановления сессии.";
  if (skipped === "wrongContour") return "Проверьте настройки сервера. Отчёт сохранён на телефоне.";
  if (skipped === "failed") return "Сервер временно недоступен. Отчёт сохранён, повторная отправка запланирована.";
  return "Отчёт отправлен или уже был принят сервером.";
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

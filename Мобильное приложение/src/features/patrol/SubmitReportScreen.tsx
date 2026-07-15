import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { getCompleteReportDeliveryState } from "@/db/repositories/outboxRepository";
import { completeAssignmentLocally, getReportReadiness, ReportReadiness } from "@/db/repositories/patrolRepository";
import { getReportDeliveryPresentation } from "@/features/patrol/reportDeliveryPresentation";
import { groupReportProblems, ReportProblemGroup } from "@/features/patrol/reportReadinessPresentation";
import { useAppTheme } from "@/features/settings/themePreference";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type DeliveryState = Awaited<ReturnType<typeof getCompleteReportDeliveryState>>;

export function SubmitReportScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const [readiness, setReadiness] = useState<ReportReadiness | null>(null);
  const [delivery, setDelivery] = useState<DeliveryState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    let isMounted = true;

    void Promise.all([getReportReadiness(assignmentId), loadDelivery(assignmentId)]).then(([loadedReadiness, loadedDelivery]) => {
      if (isMounted) {
        setReadiness(loadedReadiness);
        setDelivery(loadedDelivery);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [assignmentId]);

  useFocusEffect(load);

  const presentation = useMemo(
    () => getReportDeliveryPresentation(delivery?.status ?? null, delivery?.lastError ?? null),
    [delivery]
  );
  const problemGroups = useMemo(
    () => groupReportProblems(readiness?.problems ?? []),
    [readiness]
  );

  async function handlePrimaryAction() {
    if (isSubmitting) {
      return;
    }

    if (presentation.action === "repair") {
      router.push(`/patrol/assignment/${assignmentId}/all-points`);
      return;
    }

    if (presentation.action === "signIn") {
      router.push("/(auth)/login");
      return;
    }

    if (presentation.action === "done") {
      router.replace("/(tabs)/patrol");
      return;
    }

    if (!readiness?.ready && (presentation.action === "submit" || presentation.action === "resubmit")) {
      return;
    }

    setIsSubmitting(true);
    setSyncNotice(null);

    try {
      if (presentation.action === "submit" || presentation.action === "resubmit") {
        await completeAssignmentLocally(assignmentId);
        setDelivery(await loadDelivery(assignmentId));
      }

      const syncResult = await triggerForegroundSyncWithRetry({ forceRetry: true });
      setDelivery(await loadDelivery(assignmentId));

      if (syncResult.skipped === "offline") {
        setSyncNotice("Нет подключения. Отчет сохранен и автоматически повторится после появления сети.");
      } else if (syncResult.skipped === "serverUnavailable") {
        setSyncNotice("Сервер временно недоступен. Отчет остается на телефоне; следующий повтор уже запланирован.");
      } else if (syncResult.skipped === "unauthenticated") {
        setSyncNotice("Сессия действительно истекла. Отчет сохранен на телефоне и отправится после входа.");
      } else if (syncResult.skipped === "failed") {
        setSyncNotice("Отправка прервалась. Данные сохранены — можно повторить сейчас или дождаться автоматической отправки.");
      }
    } catch (error) {
      setDelivery(await loadDelivery(assignmentId));
      setSyncNotice(error instanceof Error ? error.message : "Не удалось запустить отправку. Отчет сохранен на телефоне.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openProblem(problem: ReportProblemGroup) {
    if (problem.pointId === "route-empty") {
      router.push(`/patrol/assignment/${assignmentId}/all-points`);
      return;
    }

    router.push(`/patrol/assignment/${assignmentId}/point/${problem.pointId}/fill`);
  }

  if (!readiness) {
    return (
      <Screen title="Отправка отчета" subtitle="Проверяем точки и локально сохраненные данные.">
        <ActivityIndicator />
      </Screen>
    );
  }

  const actionDisabled = isSubmitting
    || ((presentation.action === "submit" || presentation.action === "resubmit") && !readiness.ready);

  return (
    <Screen title="Отправка отчета" subtitle="Одно действие — один понятный результат. Данные не удаляются до подтверждения сервера.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]}>{readiness.assignment?.routeName ?? "Обход"}</Text>
          <StatusPill
            label={readiness.ready ? "Все точки заполнены" : `Осталось: ${problemGroups.length}`}
            tone={readiness.ready ? "success" : "warning"}
          />
        </View>
        <View style={styles.progressRow}>
          <ProgressValue label="Пройдено" value={`${readiness.progress.completed}/${readiness.progress.total}`} />
          <ProgressValue label="Замечания" value={String(readiness.progress.issues)} />
          <ProgressValue label="Отложено" value={String(readiness.progress.deferred)} />
        </View>
      </Card>

      <DeliveryCard
        detail={presentation.detail}
        lastUpdate={delivery?.updatedAtLocal ?? null}
        title={isSubmitting ? "Проверяем доставку…" : presentation.title}
        tone={presentation.tone}
      />

      {readiness.problems.length > 0 && presentation.action === "submit" ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Нужно заполнить перед отправкой</Text>
          {problemGroups.map((problem) => (
            <ProblemGroupButton
              key={problem.pointId}
              onPress={() => openProblem(problem)}
              problem={problem}
            />
          ))}
        </Card>
      ) : null}

      {syncNotice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{syncNotice}</Text> : null}

      <View style={styles.primaryAction}>
        <PrimaryButton
          disabled={actionDisabled}
          icon={actionIcon(presentation.action)}
          label={isSubmitting ? "Проверяем доставку…" : presentation.buttonLabel}
          onPress={() => void handlePrimaryAction()}
          size="large"
        />
      </View>

      {presentation.action === "submit" || presentation.action === "resubmit" ? (
        <PrimaryButton
          disabled={isSubmitting}
          icon="list-outline"
          label="Проверить все точки"
          onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)}
          variant="ghost"
        />
      ) : presentation.action !== "done" ? (
        <PrimaryButton
          disabled={isSubmitting}
          icon="cloud-upload-outline"
          label="Подробнее об отправке"
          onPress={() => router.push("/settings/sync-queue" as never)}
          variant="ghost"
        />
      ) : null}
    </Screen>
  );
}

async function loadDelivery(assignmentId: string) {
  const ownerUserId = await getStoredOwnerUserId();
  return ownerUserId ? getCompleteReportDeliveryState(ownerUserId, assignmentId) : null;
}

function actionIcon(action: ReturnType<typeof getReportDeliveryPresentation>["action"]): keyof typeof Ionicons.glyphMap {
  switch (action) {
    case "retry":
      return "refresh-outline";
    case "repair":
      return "build-outline";
    case "resubmit":
      return "send-outline";
    case "signIn":
      return "log-in-outline";
    case "done":
      return "checkmark-circle-outline";
    default:
      return "send-outline";
  }
}

function DeliveryCard({
  detail,
  lastUpdate,
  title,
  tone
}: {
  detail: string;
  lastUpdate: string | null;
  title: string;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const palette = deliveryPalette[tone];
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.deliveryCard, { backgroundColor: palette.background, borderColor: palette.border }]}
    >
      <View style={[styles.deliveryIcon, { backgroundColor: palette.iconBackground }]}>
        <Ionicons color={palette.color} name={palette.icon} size={24} />
      </View>
      <View style={styles.deliveryText}>
        <Text style={[styles.deliveryTitle, { color: palette.color }]}>{title}</Text>
        <Text style={styles.deliveryDetail}>{detail}</Text>
        {lastUpdate ? <Text style={styles.deliveryTime}>Обновлено {formatTime(lastUpdate)}</Text> : null}
      </View>
    </View>
  );
}

function ProblemGroupButton({
  onPress,
  problem
}: {
  onPress: () => void;
  problem: ReportProblemGroup;
}) {
  const { colors } = useAppTheme();
  const title = `${problem.orderIndex}. ${problem.pointName}`;

  return (
    <Pressable
      accessibilityLabel={`${title}. ${problem.reasons.join(". ")}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.problemButton,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed ? styles.problemButtonPressed : null
      ]}
    >
      <View style={styles.problemHeader}>
        <View style={styles.problemTitleRow}>
          <Ionicons color="#b45309" name="alert-circle-outline" size={20} />
          <Text style={[styles.problemTitle, { color: colors.text }]}>{title}</Text>
        </View>
        <Ionicons color={colors.primary} name="chevron-forward" size={20} />
      </View>
      <View style={styles.problemReasons}>
        {problem.reasons.map((reason) => (
          <View key={reason} style={styles.problemReasonRow}>
            <View style={styles.problemReasonDot} />
            <Text style={[styles.problemReason, { color: colors.mutedText }]}>{reason}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function ProgressValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.progressValue}>
      <Text style={styles.progressLabel}>{label}</Text>
      <Text style={styles.progressNumber}>{value}</Text>
    </View>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const deliveryPalette = {
  neutral: { background: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8", iconBackground: "#dbeafe", icon: "cloud-upload-outline" as const },
  success: { background: "#ecfdf5", border: "#bbf7d0", color: "#15803d", iconBackground: "#dcfce7", icon: "checkmark-circle-outline" as const },
  warning: { background: "#fffbeb", border: "#fde68a", color: "#b45309", iconBackground: "#fef3c7", icon: "time-outline" as const },
  danger: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c", iconBackground: "#fee2e2", icon: "alert-circle-outline" as const }
};

const styles = StyleSheet.create({
  deliveryCard: {
    alignItems: "flex-start",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 15
  },
  deliveryDetail: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20
  },
  deliveryIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  deliveryText: {
    flex: 1,
    gap: 4
  },
  deliveryTime: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  deliveryTitle: {
    fontSize: 17,
    fontWeight: "900"
  },
  notice: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
    padding: 12
  },
  primaryAction: {
    marginTop: 2
  },
  problemButton: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 9,
    minHeight: 56,
    paddingHorizontal: 13,
    paddingVertical: 12
  },
  problemButtonPressed: {
    opacity: 0.72
  },
  problemHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  problemReason: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19
  },
  problemReasonDot: {
    backgroundColor: "#f59e0b",
    borderRadius: 3,
    height: 6,
    marginTop: 7,
    width: 6
  },
  problemReasonRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 9
  },
  problemReasons: {
    gap: 5,
    paddingLeft: 29,
    paddingRight: 20
  },
  problemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  problemTitleRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 9,
    minWidth: 0
  },
  progressLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  progressNumber: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  progressRow: {
    flexDirection: "row",
    gap: 8
  },
  progressValue: {
    backgroundColor: "#f6f9fe",
    borderRadius: 10,
    flex: 1,
    gap: 2,
    minWidth: 0,
    padding: 10
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800"
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800"
  }
});

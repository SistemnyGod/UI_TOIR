import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { listSyncQueueFiles } from "@/db/repositories/filesRepository";
import { listSyncQueueCommands } from "@/db/repositories/outboxRepository";
import { completeAssignmentLocally, getReportReadiness, ReportReadiness } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { triggerForegroundSyncWithRetry } from "@/sync/syncTriggers";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function SubmitReportScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const [readiness, setReadiness] = useState<ReportReadiness | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    let isMounted = true;

    void getReportReadiness(assignmentId).then((loaded) => {
      if (isMounted) {
        setReadiness(loaded);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [assignmentId]);

  useFocusEffect(load);

  async function handleSubmit() {
    if (!readiness?.ready || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const result = await completeAssignmentLocally(assignmentId);
      const [commands, files] = await Promise.all([listSyncQueueCommands(200), listSyncQueueFiles(200)]);
      const reportCount = commands.filter((command) => command.commandType === "completePatrolAssignment").length;
      const fileCount = files.length;

      if (result.alreadyQueued) {
        setMessage("Отчет уже есть в очереди отправки. Повторная копия не создана.");
      } else if (reportCount > 1 || fileCount > 0) {
        setMessage(
          `Отчет сохранен на устройстве. Сейчас будет отправлена очередь: ${reportCount} отчет(ов), ${fileCount} файл(ов).`
        );
      } else {
        setMessage("Отчет сохранен на устройстве и будет отправлен автоматически. Если сеть пропадет, данные не потеряются.");
      }

      triggerForegroundSyncWithRetry();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Не удалось подготовить отчет к отправке.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openProblem(problem: ReportReadiness["problems"][number]) {
    if (problem.pointId === "route-empty") {
      router.push(`/patrol/assignment/${assignmentId}/all-points`);
      return;
    }

    router.push(`/patrol/assignment/${assignmentId}/point/${problem.pointId}/fill`);
  }

  if (!readiness) {
    return (
      <Screen title="Отправка отчета" subtitle="Проверяем обязательные метки перед завершением обхода.">
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen title="Отправка отчета" subtitle="Проверьте результат обхода. Отчет не потеряется при offline или сбое сети.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]}>{readiness.assignment?.routeName ?? "Обход"}</Text>
          <StatusPill label={readiness.ready ? "Готов к отправке" : "Нужно заполнить"} tone={readiness.ready ? "success" : "warning"} />
        </View>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Заполнено {readiness.progress.completed} из {readiness.progress.total}. Неисправно: {readiness.progress.issues}.
          Отложено: {readiness.progress.deferred}. Метка недоступна: {readiness.progress.skipped}.
        </Text>
      </Card>

      <Card style={readiness.ready ? styles.safeCard : styles.warningCard}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {readiness.ready ? "Безопасная отправка" : "Отчет пока нельзя отправить"}
        </Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          {readiness.ready
            ? "После нажатия отчет сначала сохранится локально. Если сервер или сеть недоступны, он останется в очереди восстановления и отправится позже."
            : "Закройте обязательные метки. Если физическую метку нельзя просканировать, откройте ее и выберите статус «Метка недоступна»."}
        </Text>
      </Card>

      {readiness.problems.length > 0 ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Что нужно заполнить</Text>
          {readiness.problems.map((problem) => (
            <Pressable
              key={`${problem.pointId}-${problem.reason}`}
              accessibilityRole="button"
              onPress={() => openProblem(problem)}
              style={styles.problem}
            >
              <Text style={styles.problemTitle}>
                {problem.orderIndex}. {problem.pointName}
              </Text>
              <Text style={styles.problemText}>{problem.reason}</Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {isSubmitting ? <ActivityIndicator /> : null}
      <PrimaryButton disabled={!readiness.ready || isSubmitting} icon="send-outline" label="Сохранить и отправить" onPress={handleSubmit} />
      <View style={styles.actions}>
        <PrimaryButton disabled={isSubmitting} icon="list-outline" label="Все метки" onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)} variant="secondary" />
        <PrimaryButton disabled={isSubmitting} icon="cloud-upload-outline" label="Очередь отправки" onPress={() => router.push("/settings/sync-queue" as never)} variant="secondary" />
        <PrimaryButton disabled={isSubmitting} icon="shield-checkmark-outline" label="К обходу" onPress={() => router.push(`/patrol/assignment/${assignmentId}`)} variant="secondary" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  message: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderRadius: 12,
    borderWidth: 1,
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    padding: 12
  },
  problem: {
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12
  },
  problemText: {
    color: "#ef4444",
    fontSize: 13,
    lineHeight: 18
  },
  problemTitle: {
    color: "#991b1b",
    fontSize: 15,
    fontWeight: "700"
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  safeCard: {
    borderColor: "#bbf7d0"
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700"
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700"
  },
  warningCard: {
    borderColor: "#fed7aa"
  }
});

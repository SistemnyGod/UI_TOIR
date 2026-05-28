import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

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
    if (!readiness?.ready) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      await completeAssignmentLocally(assignmentId);
      setMessage("Отчет сохранен на телефоне и будет отправлен при наличии интернета.");
      triggerForegroundSyncWithRetry();
      router.replace(`/patrol/assignment/${assignmentId}`);
    } catch {
      setMessage("Не удалось подготовить отчет к отправке.");
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
      <Screen title="Отправка отчета" subtitle="Проверка заполнения меток перед завершением обхода.">
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen title="Отправка отчета" subtitle="Проверьте метки перед завершением обхода.">
      <Card>
        <View style={styles.row}>
          <Text style={[styles.title, { color: colors.text }]}>{readiness.assignment?.routeName ?? "Обход"}</Text>
          <StatusPill label={readiness.ready ? "Готов" : "Нужно заполнить"} tone={readiness.ready ? "success" : "warning"} />
        </View>
        <Text style={[styles.text, { color: colors.mutedText }]}>
          Заполнено {readiness.progress.completed} из {readiness.progress.total}. Неисправно: {readiness.progress.issues}.
          Отложено: {readiness.progress.deferred}.
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
      <PrimaryButton disabled={!readiness.ready || isSubmitting} label="Отправить отчет" onPress={handleSubmit} />
      <PrimaryButton disabled={isSubmitting} label="Все метки" onPress={() => router.push(`/patrol/assignment/${assignmentId}/all-points`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600"
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600"
  },
  problem: {
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12
  },
  problemTitle: {
    color: "#991b1b",
    fontSize: 15,
    fontWeight: "600"
  },
  problemText: {
    color: "#ef4444",
    fontSize: 13,
    lineHeight: 18
  },
  message: {
    color: "#1e5bff",
    fontSize: 14,
    lineHeight: 20
  }
});

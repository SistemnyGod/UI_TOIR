import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ActiveAssignment,
  AssignmentProgress,
  getActiveAssignmentWithProgress,
  getAssignmentById,
  getAssignmentProgress
} from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
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

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void getActiveAssignmentWithProgress().then(async (active) => {
        if (!isMounted) {
          return;
        }

        if (active?.assignment.assignmentId === assignmentId) {
          setAssignment(active.assignment);
          setProgress(active.progress);
          return;
        }

        const [fallbackAssignment, fallbackProgress] = await Promise.all([
          getAssignmentById(assignmentId),
          getAssignmentProgress(assignmentId)
        ]);

        if (isMounted && fallbackAssignment && fallbackProgress.total > 0) {
          setAssignment(fallbackAssignment);
          setProgress(fallbackProgress);
        }
      });

      return () => {
        isMounted = false;
      };
    }, [assignmentId])
  );

  if (!assignment || !progress) {
    return (
      <Screen title="Активный обход" subtitle="Маршрут, прогресс и свободный порядок прохождения меток.">
        <Card>
          <Text style={[styles.text, { color: colors.mutedText }]}>Активный обход не найден на телефоне.</Text>
        </Card>
      </Screen>
    );
  }

  const isCompletedLocal = assignment.status === "completedLocal";
  const percent = progressPercent(progress);

  return (
    <Screen title={assignment.routeName} subtitle="Проходите метки в любом удобном порядке.">
      <Card>
        <View style={styles.routeHeader}>
          <View style={styles.routeTextBox}>
            <Text style={[styles.employeeLine, { color: colors.mutedText }]}>Активный обход</Text>
            <Text style={[styles.routeTitle, { color: colors.text }]}>{assignment.routeName}</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>Начат: {formatDateTime(assignment.startedAtLocal)}</Text>
          </View>
          <StatusPill label={isCompletedLocal ? "Ожидает отправки" : "В работе"} tone={isCompletedLocal ? "warning" : "success"} />
        </View>

        {isCompletedLocal ? (
          <Text style={[styles.text, { color: colors.mutedText }]}>
            Отчет сохранен на телефоне и будет отправлен автоматически, когда приложение открыто и есть интернет.
          </Text>
        ) : null}

        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: colors.text }]}>Прогресс</Text>
          <Text style={[styles.progressLabel, { color: colors.text }]}>
            {progress.completed} из {progress.total} точек
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { width: `${percent}%` }]} />
        </View>
        <Text style={[styles.percentText, { color: colors.mutedText }]}>{percent}%</Text>
      </Card>

      <View style={styles.grid}>
        <Metric label="Всего" value={progress.total} />
        <Metric label="Выполнено" value={progress.completed} tone="success" />
        <Metric label="Отложено" value={progress.deferred} tone={progress.deferred > 0 ? "warning" : "neutral"} />
        <Metric label="Проблемы" value={progress.issues} tone={progress.issues > 0 ? "danger" : "neutral"} />
      </View>

      {!isCompletedLocal ? (
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Следующее действие</Text>
          <PrimaryButton label="Сканировать NFC" onPress={() => router.push(`/patrol/assignment/${assignment.assignmentId}/scan-nfc`)} />
          <PrimaryButton label="Сканировать QR" onPress={() => router.push(`/patrol/assignment/${assignment.assignmentId}/scan-qr`)} variant="secondary" />
        </Card>
      ) : null}

      <PrimaryButton label="Все метки" onPress={() => router.push(`/patrol/assignment/${assignment.assignmentId}/all-points`)} variant="secondary" />
      {!isCompletedLocal ? (
        <PrimaryButton label="Отправить отчет" onPress={() => router.push(`/patrol/assignment/${assignment.assignmentId}/submit`)} />
      ) : null}
    </Screen>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text
        style={[
          styles.metricValue,
          { color: colors.text },
          tone === "success" ? styles.success : null,
          tone === "danger" ? styles.danger : null,
          tone === "warning" ? styles.warning : null
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: colors.mutedText }]}>{label}</Text>
    </View>
  );
}

function progressPercent(progress: AssignmentProgress) {
  return progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
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
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: "800"
  },
  percentText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right"
  },
  progressTrack: {
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: "#1e5bff",
    height: 10
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  metric: {
    borderRadius: 12,
    borderWidth: 1,
    minWidth: "47%",
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  metricValue: {
    fontSize: 26,
    fontWeight: "800"
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: "700"
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800"
  },
  success: {
    color: "#22c55e"
  },
  warning: {
    color: "#f59e0b"
  },
  danger: {
    color: "#ef4444"
  }
});

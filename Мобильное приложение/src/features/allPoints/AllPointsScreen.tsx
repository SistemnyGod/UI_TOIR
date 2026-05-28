import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getActiveAssignment, listAssignmentPoints, PointListItem } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type Filter = "all" | "pending" | "completed" | "deferred" | "issue" | "scanned";

export function AllPointsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId: routeAssignmentId } = useLocalSearchParams<{ assignmentId?: string }>();
  const [assignmentId, setAssignmentId] = useState<string | null>(routeAssignmentId ?? null);
  const [points, setPoints] = useState<PointListItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function load() {
        const active = routeAssignmentId ? null : await getActiveAssignment();
        const targetAssignmentId = routeAssignmentId ?? active?.assignmentId ?? null;
        const rows = targetAssignmentId ? await listAssignmentPoints(targetAssignmentId) : [];

        if (isMounted) {
          setAssignmentId(targetAssignmentId);
          setPoints(rows);
        }
      }

      void load();

      return () => {
        isMounted = false;
      };
    }, [routeAssignmentId])
  );

  const summary = useMemo(() => buildSummary(points), [points]);
  const percent = progressPercent(summary);

  const visiblePoints = useMemo(() => {
    if (filter === "all") {
      return points;
    }

    if (filter === "completed") {
      return points.filter((point) => point.status === "ok" || point.status === "issue");
    }

    return points.filter((point) => point.status === filter);
  }, [filter, points]);

  return (
    <Screen title="Метки" subtitle="Обзор точек активного маршрута.">
      {!assignmentId ? (
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>Активный обход не выбран</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Возьмите заявку на вкладке Обход, чтобы увидеть метки маршрута.</Text>
        </Card>
      ) : null}

      {assignmentId ? (
        <>
          <Card>
            <View style={styles.progressHeader}>
              <Text style={[styles.title, { color: colors.text }]}>Прогресс маршрута</Text>
              <Text style={[styles.meta, { color: colors.mutedText }]}>
                {summary.completed} из {summary.total}
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>
            <Text style={[styles.meta, { color: colors.mutedText }]}>{percent}%</Text>
          </Card>

          <View style={styles.summaryGrid}>
            <Metric label="Всего" value={summary.total} />
            <Metric label="Выполнено" value={summary.completed} tone="success" />
            <Metric label="Отложено" value={summary.deferred} tone={summary.deferred > 0 ? "warning" : "neutral"} />
            <Metric label="Проблемы" value={summary.issue} tone={summary.issue > 0 ? "danger" : "neutral"} />
          </View>

          <View style={styles.filters}>
            <FilterChip count={summary.total} label="Все" selected={filter === "all"} onPress={() => setFilter("all")} />
            <FilterChip count={summary.pending} label="Не заполнено" selected={filter === "pending"} onPress={() => setFilter("pending")} />
            <FilterChip count={summary.completed} label="Заполнено" selected={filter === "completed"} onPress={() => setFilter("completed")} />
            <FilterChip count={summary.deferred} label="Отложено" selected={filter === "deferred"} onPress={() => setFilter("deferred")} />
            <FilterChip count={summary.issue} label="Неисправно" selected={filter === "issue"} onPress={() => setFilter("issue")} />
            <FilterChip count={summary.scanned} label="Сканировано" selected={filter === "scanned"} onPress={() => setFilter("scanned")} />
          </View>

          {visiblePoints.length === 0 ? (
            <Card>
              <Text style={[styles.text, { color: colors.mutedText }]}>По выбранному фильтру меток нет.</Text>
            </Card>
          ) : null}

          {visiblePoints.map((point) => (
            <PointRow
              assignmentId={assignmentId}
              key={point.pointId}
              onPress={() => router.push(`/patrol/assignment/${assignmentId}/point/${point.pointId}`)}
              point={point}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function PointRow({ assignmentId, point, onPress }: { assignmentId: string; point: PointListItem; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityHint={`Открыть точку ${point.name} в обходе ${assignmentId}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [pressed ? { opacity: 0.88 } : null]}
    >
      <Card style={styles.pointCard}>
        <View style={styles.pointRow}>
          <View style={styles.pointIndex}>
            <Text style={styles.pointIndexText}>{point.orderIndex}</Text>
          </View>
          <View style={styles.pointTitleBox}>
            <Text style={[styles.pointTitle, { color: colors.text }]} numberOfLines={2}>{point.name}</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>{point.required ? "Обязательная метка" : "Дополнительная метка"}</Text>
            {point.comment ? (
              <Text style={[styles.meta, { color: colors.mutedText }]} numberOfLines={2}>{point.comment}</Text>
            ) : null}
          </View>
          <View style={styles.pointStatusBox}>
            <StatusPill label={pointStatusLabel(point.status)} tone={pointStatusTone(point.status)} />
            <Text style={[styles.chevron, { color: colors.mutedText }]}>›</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.metricValue, { color: colors.text }, metricToneStyle(tone)]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.mutedText }]}>{label}</Text>
    </View>
  );
}

function FilterChip({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? "#ffffff" : colors.text }]}>{label}</Text>
      <Text style={[styles.chipCount, { color: selected ? "#dbeafe" : colors.mutedText }]}>{count}</Text>
    </Pressable>
  );
}

function buildSummary(points: PointListItem[]) {
  return {
    total: points.length,
    pending: points.filter((point) => point.status === "pending").length,
    scanned: points.filter((point) => point.status === "scanned").length,
    completed: points.filter((point) => point.status === "ok" || point.status === "issue").length,
    deferred: points.filter((point) => point.status === "deferred").length,
    issue: points.filter((point) => point.status === "issue").length
  };
}

function progressPercent(summary: ReturnType<typeof buildSummary>) {
  return summary.total === 0 ? 0 : Math.round((summary.completed / summary.total) * 100);
}

function pointStatusLabel(status: PointListItem["status"]) {
  switch (status) {
    case "ok":
      return "Исправно";
    case "issue":
      return "Неисправно";
    case "deferred":
      return "Отложена";
    case "scanned":
      return "Сканирована";
    case "skipped":
      return "Пропущена";
    default:
      return "Не заполнено";
  }
}

function pointStatusTone(status: PointListItem["status"]) {
  if (status === "ok") {
    return "success";
  }

  if (status === "issue") {
    return "danger";
  }

  if (status === "deferred") {
    return "warning";
  }

  return "neutral";
}

function metricToneStyle(tone: "neutral" | "success" | "warning" | "danger") {
  switch (tone) {
    case "success":
      return styles.success;
    case "warning":
      return styles.warning;
    case "danger":
      return styles.danger;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  progressTrack: {
    borderRadius: 999,
    height: 9,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: "#1e5bff",
    height: 9
  },
  summaryGrid: {
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
    fontSize: 24,
    fontWeight: "800"
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "700"
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700"
  },
  chipCount: {
    fontSize: 12,
    fontWeight: "700"
  },
  pointCard: {
    padding: 12
  },
  pointRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  pointIndex: {
    alignItems: "center",
    backgroundColor: "#eef4ff",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  pointIndexText: {
    color: "#1e5bff",
    fontSize: 14,
    fontWeight: "800"
  },
  pointTitleBox: {
    flex: 1,
    gap: 3
  },
  pointTitle: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  pointStatusBox: {
    alignItems: "flex-end",
    gap: 6
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800"
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  },
  meta: {
    fontSize: 13,
    lineHeight: 18
  },
  chevron: {
    fontSize: 24,
    fontWeight: "600"
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

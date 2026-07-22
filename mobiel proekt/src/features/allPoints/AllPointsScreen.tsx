import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ListRenderItem, Pressable, StyleSheet, Text, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getActiveAssignment, getAssignmentById, listAssignmentPoints, PointListItem } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { ScreenList } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type Filter = "all" | "pending" | "deferred" | "issue" | "skipped";

export function AllPointsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId: routeAssignmentId } = useLocalSearchParams<{ assignmentId?: string }>();
  const [assignmentId, setAssignmentId] = useState<string | null>(routeAssignmentId ?? null);
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);
  const [points, setPoints] = useState<PointListItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      async function load() {
        const active = routeAssignmentId ? null : await getActiveAssignment();
        const ownerUserId = await getStoredOwnerUserId();
        const targetAssignmentId = routeAssignmentId ?? active?.assignmentId ?? null;
        const targetAssignment = targetAssignmentId && routeAssignmentId
          ? await getAssignmentById(targetAssignmentId)
          : active;
        const rows = targetAssignmentId && ownerUserId ? await listAssignmentPoints(targetAssignmentId, ownerUserId, currentContourId) : [];

        if (isMounted) {
          setAssignmentId(targetAssignmentId);
          setAssignmentStatus(targetAssignment?.status ?? null);
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

    return points.filter((point) => point.status === filter);
  }, [filter, points]);

  const renderItem: ListRenderItem<PointListItem> = ({ item }) => (
    <PointRow
      assignmentId={assignmentId ?? ""}
      onPress={() => assignmentId && router.push(`/patrol/assignment/${assignmentId}/point/${item.pointId}`)}
      point={item}
    />
  );

  return (
    <ScreenList
      data={assignmentId ? visiblePoints : []}
      keyExtractor={(point) => point.pointId}
      ListEmptyComponent={
        !assignmentId ? (
          <Card>
            <Text style={[styles.title, { color: colors.text }]}>Активный обход не выбран</Text>
            <Text style={[styles.text, { color: colors.mutedText }]}>Возьмите заявку на вкладке Обход, чтобы увидеть метки маршрута.</Text>
          </Card>
        ) : (
          <Card>
            <Text style={[styles.text, { color: colors.mutedText }]}>По выбранному фильтру меток нет.</Text>
          </Card>
        )
      }
      renderItem={renderItem}
      title="Метки"
      subtitle="Обзор точек активного маршрута."
      headerContent={
        assignmentId ? (
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

            {assignmentStatus === "inProgress" ? (
              <PrimaryButton
                icon="scan-outline"
                label="Сканировать NFC"
                onPress={() => router.push(`/patrol/assignment/${assignmentId}/scan-nfc`)}
              />
            ) : (
              <Card>
                <Text style={[styles.text, { color: colors.mutedText }]}>{pointListHint(assignmentStatus)}</Text>
              </Card>
            )}

            <View style={styles.filters}>
              <FilterChip count={summary.total} label="Все" selected={filter === "all"} onPress={() => setFilter("all")} />
              <FilterChip count={summary.pending} label="Не заполнено" selected={filter === "pending"} onPress={() => setFilter("pending")} />
              <FilterChip count={summary.issue} label="Проблемы" selected={filter === "issue"} onPress={() => setFilter("issue")} />
              <FilterChip count={summary.skipped} label="Метка недоступна" selected={filter === "skipped"} onPress={() => setFilter("skipped")} />
              <FilterChip count={summary.deferred} label="Отложено" selected={filter === "deferred"} onPress={() => setFilter("deferred")} />
            </View>
          </>
        ) : null
      }
    />
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
    completed: points.filter((point) => point.status === "ok" || point.status === "issue" || point.status === "skipped").length,
    deferred: points.filter((point) => point.status === "deferred").length,
    skipped: points.filter((point) => point.status === "skipped").length,
    issue: points.filter((point) => point.status === "issue").length
  };
}

function progressPercent(summary: ReturnType<typeof buildSummary>) {
  return summary.total === 0 ? 0 : Math.round((summary.completed / summary.total) * 100);
}

function pointListHint(status: string | null) {
  if (status === "cancelledServer" || status === "cancelled") {
    return "Заявка отменена диспетчером. Метки доступны только для просмотра.";
  }

  if (status === "completed" || status === "completedServer" || status === "completedLocal" || status === "syncing") {
    return "Обход завершен или ожидает отправки. Новое сканирование заблокировано.";
  }

  if (status === "needsDispatcherDecision" || status === "conflict" || status === "syncError" || status === "authRequired") {
    return "Сканирование временно заблокировано до синхронизации или решения диспетчера.";
  }

  return "Сканирование NFC доступно после начала обхода.";
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
      return "Метка недоступна";
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

  if (status === "deferred" || status === "skipped") {
    return "warning";
  }

  return "neutral";
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
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  chip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700"
  },
  chipCount: {
    fontSize: 11,
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
    flexShrink: 1,
    gap: 6,
    maxWidth: 132
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
  }
});

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ListRenderItem, Pressable, StyleSheet, Text, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getActiveAssignment, getAssignmentById, listAssignmentPoints, PointListItem } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { logMobileError } from "@/services/mobileErrorReporter";
import { shouldReloadAssignmentAfterSync, subscribeToSyncEvents } from "@/sync/syncEvents";
import { requestMobileDataRefresh } from "@/sync/syncTriggers";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { ScreenList } from "@/ui/Screen";
import { SelectionTabs, SelectionTransition } from "@/ui/SelectionTabs";
import { StatusPill } from "@/ui/StatusPill";

type Filter = "all" | "attention" | "pending" | "deferred" | "issue" | "skipped";

export function AllPointsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId: routeAssignmentId, filter: routeFilter } = useLocalSearchParams<{ assignmentId?: string; filter?: string }>();
  const [assignmentId, setAssignmentId] = useState<string | null>(routeAssignmentId ?? null);
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);
  const [points, setPoints] = useState<PointListItem[]>([]);
  const [filter, setFilter] = useState<Filter>(routeFilter === "attention" ? "attention" : "all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadRevision, setReloadRevision] = useState(0);
  const [syncRevision, setSyncRevision] = useState(0);


  useEffect(() => subscribeToSyncEvents((event) => {
    if (assignmentId && shouldReloadAssignmentAfterSync(event, assignmentId)) {
      setSyncRevision((value) => value + 1);
    }
  }), [assignmentId]);

  useFocusEffect(
    useCallback(() => {
      void reloadRevision;
      void syncRevision;
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
          setLoadError(null);
          setAssignmentId(targetAssignmentId);
          setAssignmentStatus(targetAssignment?.status ?? null);
          setPoints(rows);
        }
      }

      requestMobileDataRefresh("appActive");
      void load().catch((error) => {
        void logMobileError("patrol.points.load.failed", error);
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : "Не удалось прочитать список меток.");
        }
      });

      return () => {
        isMounted = false;
      };
    }, [reloadRevision, routeAssignmentId, syncRevision])
  );

  const summary = useMemo(() => buildSummary(points), [points]);
  const percent = progressPercent(summary);
  const isReadyForReport = assignmentStatus === "inProgress" && summary.total > 0 && summary.completed >= summary.total;

  const visiblePoints = useMemo(() => {
    if (filter === "all") {
      return points;
    }

    const filtered = filter === "attention"
      ? points.filter(isAttentionPoint)
      : points.filter((point) => point.status === filter);

    return filter === "attention"
      ? [...filtered].sort((left, right) => attentionRank(left) - attentionRank(right) || left.orderIndex - right.orderIndex)
      : filtered;
  }, [filter, points]);

  const renderItem: ListRenderItem<PointListItem> = ({ item }) => (
    <SelectionTransition selectionKey={filter}>
      <PointRow
        onPress={() => assignmentId && router.push(`/patrol/assignment/${assignmentId}/point/${item.pointId}`)}
        point={item}
      />
    </SelectionTransition>
  );

  return (
    <ScreenList
      bottomAction={assignmentId && assignmentStatus === "inProgress" ? (
        <PrimaryButton
          disabled={summary.total === 0}
          icon={isReadyForReport ? "document-text-outline" : "scan-outline"}
          label={summary.total === 0 ? "Загружаем метки маршрута" : isReadyForReport ? "Проверить и отправить отчёт" : "Сканировать NFC"}
          onPress={() => router.push(isReadyForReport
            ? `/patrol/assignment/${assignmentId}/submit`
            : `/patrol/assignment/${assignmentId}/scan-nfc`)}
          size="large"
        />
      ) : null}
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
        <>
          {loadError ? (
            <Card>
              <Text style={[styles.text, { color: "#b91c1c" }]}>{loadError}</Text>
              <PrimaryButton
                icon="refresh-outline"
                label="Повторить загрузку"
                onPress={() => setReloadRevision((value) => value + 1)}
                variant="secondary"
              />
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

            {assignmentStatus !== "inProgress" ? (
              <Card>
                <Text style={[styles.text, { color: colors.mutedText }]}>{pointListHint(assignmentStatus)}</Text>
              </Card>
            ) : null}

            <SelectionTabs<Filter>
              accessibilityLabel="Фильтр меток"
              compact
              items={[
                { count: summary.total, icon: "list-outline", label: "Все", value: "all" },
                { count: summary.attention, icon: "alert-circle-outline", label: "Внимание", value: "attention" },
                { count: summary.pending, icon: "ellipse-outline", label: "Не заполнено", value: "pending" },
                { count: summary.issue, icon: "warning-outline", label: "Проблемы", value: "issue" },
                { count: summary.skipped, icon: "close-circle-outline", label: "Недоступны", value: "skipped" },
                { count: summary.deferred, icon: "time-outline", label: "Отложено", value: "deferred" }
              ]}
              onChange={setFilter}
              scrollable
              value={filter}
            />
            </>
          ) : null}
        </>
      }
    />
  );
}

function PointRow({ point, onPress }: { point: PointListItem; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityHint={`Открыть точку ${point.name}`}
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

function isAttentionPoint(point: PointListItem) {
  if (point.status === "pending" || point.status === "scanned" || point.status === "deferred" || point.status === "skipped") {
    return true;
  }

  if (point.status === "issue" && (!point.comment?.trim() || !point.issueTypeId)) {
    return true;
  }

  return point.requiresPhoto && point.photoClientFileIds.length === 0;
}

function attentionRank(point: PointListItem) {
  if (point.status === "deferred") return 0;
  if (point.status === "pending" || point.status === "scanned") return 1;
  if (point.status === "skipped") return 2;
  return 3;
}

function buildSummary(points: PointListItem[]) {
  return {
    total: points.length,
    attention: points.filter(isAttentionPoint).length,
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

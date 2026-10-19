import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { ListRenderItem, Pressable, StyleSheet, Text, View } from "react-native";

import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import { getPatrolDeviceContext } from "@/db/repositories/patrolContextRepository";
import { getActiveAssignment, getAssignmentById, getAssignmentScanPolicy, listAssignmentPoints, getReportReadiness, type ReportReadiness, PointListItem } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { logMobileError } from "@/services/mobileErrorReporter";
import { shouldReloadAssignmentAfterSync, subscribeToSyncEvents } from "@/sync/syncEvents";
import { requestMobileDataRefresh } from "@/sync/syncTriggers";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { ScreenList } from "@/ui/Screen";
import { SelectionTabs } from "@/ui/SelectionTabs";
import { retainEqualItems } from "@/sync/retainEqualItems";
import { StatusPill } from "@/ui/StatusPill";
import { font } from "@/ui/typography";
import { Rise } from "@/ui/motion";

type Filter = "all" | "attention" | "pending" | "deferred" | "issue" | "skipped";

export function AllPointsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { assignmentId: routeAssignmentId, filter: routeFilter } = useLocalSearchParams<{ assignmentId?: string; filter?: string }>();
  const [assignmentId, setAssignmentId] = useState<string | null>(routeAssignmentId ?? null);
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);
  const [nfcEnabled, setNfcEnabled] = useState(false);
  const [points, setPoints] = useState<PointListItem[]>([]);
  const [readiness, setReadiness] = useState<ReportReadiness | null>(null);
  const [filter, setFilter] = useState<Filter>(routeFilter === "attention" ? "attention" : "all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadRevision, setReloadRevision] = useState(0);
  const [syncRevision, setSyncRevision] = useState(0);

  useFocusEffect(useCallback(() => { requestMobileDataRefresh("appActive"); }, []));

  useFocusEffect(useCallback(() => subscribeToSyncEvents((event) => {
    if (assignmentId && shouldReloadAssignmentAfterSync(event, assignmentId)) {
      setSyncRevision((value) => value + 1);
    }
  }), [assignmentId]));

  useFocusEffect(
    useCallback(() => {
      void reloadRevision;
      void syncRevision;
      let isMounted = true;

      async function load() {
        const context = routeAssignmentId ? null : await getPatrolDeviceContext();
        const active = context?.assignmentId ? await getActiveAssignment({ assignmentId: context.assignmentId }) : null;
        const ownerUserId = await getStoredOwnerUserId();
        const targetAssignmentId = routeAssignmentId ?? active?.assignmentId ?? null;
        const targetAssignment = targetAssignmentId && routeAssignmentId
          ? await getAssignmentById(targetAssignmentId)
          : active;
        const [rows, scanPolicy, loadedReadiness] = targetAssignmentId && ownerUserId
          ? await Promise.all([
              listAssignmentPoints(targetAssignmentId, ownerUserId, currentContourId),
              getAssignmentScanPolicy(targetAssignmentId),
              getReportReadiness(targetAssignmentId)
            ])
          : [[], { nfcEnabled: false, qrFallbackEnabled: false, allowFreeOrder: true }, null];

        if (isMounted) {
          setLoadError(null);
          setAssignmentId(targetAssignmentId);
          setAssignmentStatus(targetAssignment?.status ?? null);
          setNfcEnabled(scanPolicy.nfcEnabled);
          setPoints(previous => retainEqualItems(previous, rows, point => point.pointId));
          setReadiness(loadedReadiness);
        }
      }

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
  const reasonsByPoint = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const problem of readiness?.problems ?? []) map.set(problem.pointId, [...(map.get(problem.pointId) ?? []), problem.reason]);
    return map;
  }, [readiness]);
  const attentionCount = points.filter(point => reasonsByPoint.has(point.pointId)).length;
  const percent = progressPercent(summary);
  const isReadyForReport = assignmentStatus === "inProgress" && readiness?.ready === true;

  const visiblePoints = useMemo(() => {
    if (filter === "all") {
      return points;
    }

    const filtered = filter === "attention"
      ? points.filter(point => reasonsByPoint.has(point.pointId))
      : points.filter((point) => point.status === filter);

    return filter === "attention"
      ? [...filtered].sort((left, right) => attentionRank(left) - attentionRank(right) || left.orderIndex - right.orderIndex)
      : filtered;
  }, [filter, points, reasonsByPoint]);

  const openPoint = useCallback((pointId: string) => {
    if (assignmentId) router.push(`/patrol/assignment/${assignmentId}/point/${pointId}${filter === 'attention' && assignmentStatus === 'inProgress' ? '/fill' : ''}` as never);
  }, [assignmentId, assignmentStatus, filter, router]);

  const renderItem = useCallback<ListRenderItem<PointListItem>>(({ item, index }) => (
    <PointRow index={index} onOpen={openPoint} point={item} reasons={reasonsByPoint.get(item.pointId)} />
  ), [openPoint, reasonsByPoint]);

  return (
    <ScreenList
      bottomAction={assignmentId && assignmentStatus === "inProgress" && (isReadyForReport || nfcEnabled) ? (
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
            <Text style={[styles.text, { color: colors.mutedText }]}>
              {points.length === 0 ? "Метки маршрута ещё не загружены." : "По выбранному фильтру меток нет."}
            </Text>
          </Card>
        )
      }
      renderItem={renderItem}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      title="Метки"
      compactHeader
      headerContent={
        <>
          {loadError ? (
            <Card>
              <Text style={[styles.text, { color: colors.danger }]}>{loadError}</Text>
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
            {(readiness?.problems ?? []).filter(problem => !points.some(point => point.pointId === problem.pointId)).map(problem => (
              <Card key={problem.pointId}><Text style={{ color: colors.text }}>{problem.reason}</Text></Card>
            ))}
            <Card>
              <View style={styles.progressHeader}>
                <Text style={[styles.title, { color: colors.text }]}>Прогресс маршрута</Text>
                <Text style={[styles.meta, { color: colors.mutedText }]}>
                  {summary.total === 0 ? "Загружаем метки" : `${summary.completed} из ${summary.total}`}
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: colors.primary }]} />
              </View>
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
                { count: attentionCount, icon: "alert-circle-outline", label: "Требуют внимания", value: "attention" },
                { count: summary.pending, icon: "ellipse-outline", label: "Не заполнено", value: "pending" },
                { count: summary.issue, icon: "warning-outline", label: "Проблемы", value: "issue" },
                { count: summary.skipped, icon: "close-circle-outline", label: "Не осмотрено", value: "skipped" },
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

type PointRowProps = { point: PointListItem; index: number; onOpen: (pointId: string) => void; reasons?: string[] };

// A sync pass reloads every point; retainEqualItems keeps unchanged ones, so
// only rows whose point or readiness reasons changed render again.
const PointRow = memo(function PointRow({ point, index, onOpen, reasons }: PointRowProps) {
  const { colors } = useAppTheme();
  const tone = pointStatusTone(point.status);
  const badge = tone === "success" ? { bg: colors.successSurface, fg: colors.success, icon: "checkmark" as const }
    : tone === "danger" ? { bg: colors.dangerSurface, fg: colors.danger, icon: "alert" as const }
    : tone === "warning" ? { bg: colors.warningSurface, fg: colors.warning, icon: null }
    : { bg: colors.backgroundAccent, fg: colors.mutedText, icon: null };

  return (
    <Rise index={index}><Pressable
      accessibilityHint={`Открыть точку ${point.name}`}
      accessibilityRole="button"
      onPress={() => onOpen(point.pointId)}
      style={({ pressed }) => [pressed ? { opacity: 0.9, transform: [{ scale: 0.985 }] } : null]}
    >
      <Card style={styles.pointCard}>
        <View style={styles.pointRow}>
          <View style={[styles.pointIndex, { backgroundColor: badge.bg }]}>
            {badge.icon ? <Ionicons name={badge.icon} size={16} color={badge.fg} /> : <Text style={[styles.pointIndexText, font(800), { color: badge.fg }]}>{point.orderIndex}</Text>}
          </View>
          <View style={styles.pointTitleBox}>
            <Text style={[styles.pointTitle, font(800), { color: colors.text }]}>{point.orderIndex}. {point.name}</Text>
            <StatusPill label={pointStatusLabel(point.status)} tone={tone} />
            {reasons?.filter(reason => reason !== "Обязательная метка не заполнена.").map(reason => <Text key={reason} style={[styles.text, font(600), { color: colors.mutedText }]}>{reason}</Text>)}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faintText} />
        </View>
      </Card>
    </Pressable></Rise>
  );
}, (previous, next) => previous.point === next.point && previous.index === next.index && previous.onOpen === next.onOpen
  && sameReasons(previous.reasons, next.reasons));

function sameReasons(left: string[] | undefined, right: string[] | undefined) {
  return left === right || (left?.length === right?.length && (left ?? []).every((reason, index) => reason === right?.[index]));
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
    pending: points.filter((point) => point.status === "pending").length,
    inspected: points.filter((point) => point.status === "ok" || point.status === "issue").length,
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
      return "Не осмотрено";
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
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between"
  },
  progressTrack: {
    borderRadius: 999,
    height: 9,
    overflow: "hidden"
  },
  progressFill: {
    height: 9
  },

  pointCard: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  pointRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  pointIndex: {
    alignItems: "center",
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  pointIndexText: {
    fontSize: 14,
    fontFamily: "Manrope_800ExtraBold"
  },
  pointTitleBox: {
    flex: 1,
    alignItems: "flex-start",
    gap: 5,
    minWidth: 0
  },
  pointTitle: {
    fontSize: 15,
    lineHeight: 20
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Manrope_800ExtraBold"
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  },
  meta: {
    fontSize: 14,
    lineHeight: 18
  },
  chevron: {
    fontSize: 24,
    fontFamily: "Manrope_600SemiBold"
  }
});

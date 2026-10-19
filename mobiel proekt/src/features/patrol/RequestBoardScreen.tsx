import { TextField as TextInput } from "@/ui/TextField";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, ListRenderItem, StyleSheet, Text, View } from "react-native";

import { listRequestBoard, getAssignmentById, getAssignmentProgress, RequestBoardItem } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { requestMobileDataRefresh } from "@/sync/syncTriggers";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { useSmoothRefreshIndicator } from "@/sync/useSmoothRefreshIndicator";
import { enterPatrolRequest } from "@/services/patrolEntryService";
import { TransientNotice } from "@/ui/TransientNotice";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { ScreenList } from "@/ui/Screen";
import { SelectionTabs } from "@/ui/SelectionTabs";
import { StatusPill } from "@/ui/StatusPill";
import { captureDataOwnerContext, assertDataOwnerContext } from '@/auth/dataOwnerContext';
import { getPatrolDeviceContext } from '@/db/repositories/patrolContextRepository';

import { compareRequestDatesNewestFirst } from "./requestDateOrder";
import { retainEqualItems } from "@/sync/retainEqualItems";

type RequestTab = "all" | "inProgress" | "history";

const boardViews = new Map<string, { query: string; tab: RequestTab; offset: number }>();

const historyStatuses = new Set(["completed", "completedServer", "cancelled", "cancelledServer"]);

export function RequestBoardScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList<RequestBoardItem>>(null);
  const viewKey = useRef<string | null>(null);
  const restoreOffset = useRef<number | null>(null);
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const { colors } = useAppTheme();
  const focused = useRef(false);
  const focusVersion = useRef(0);
  const loadVersion = useRef(0);
  const manualRefresh = useRef(false);
  const starting = useRef(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<RequestBoardItem[]>([]);
  const [activeTab, setActiveTab] = useState<RequestTab>("all");
  const { beginRefresh, endRefresh, isRefreshing } = useSmoothRefreshIndicator();
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    const version = focusVersion.current;
    const readVersion = ++loadVersion.current;
    const scope = await captureDataOwnerContext();
    const [rows, context] = await Promise.all([listRequestBoard(), getPatrolDeviceContext()]);
    const assignment = context.assignmentId ? await getAssignmentById(context.assignmentId) : null;
    const progress = assignment ? await getAssignmentProgress(assignment.assignmentId) : null;
    await assertDataOwnerContext(scope);
    if (!focused.current || version !== focusVersion.current || readVersion !== loadVersion.current) return;
    const key = `${scope.ownerUserId}:${scope.contourId}:${scope.generation}`;
    if (viewKey.current !== key) {
      viewKey.current = key;
      const saved = boardViews.get(key) ?? { query: "", tab: "all" as const, offset: 0 };
      setQuery(saved.query); setActiveTab(saved.tab); restoreOffset.current = saved.offset;
      boardViews.set(key, saved);
    }
    setItems(previous => retainEqualItems(previous, rows, item => item.requestId));
    setSelectedRequestId(assignment?.requestId ?? null);
    setProgressLabel(progress ? `${progress.completed} из ${progress.total}` : "");
    setLoadError(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      focused.current = true;
      focusVersion.current++;
      void loadLocal().catch((caught) => {
        void logMobileError("patrol.request-board.load.failed", caught);
        if (isMounted) {
          setLoadError(caught instanceof Error ? caught.message : "Не удалось прочитать заявки.");
        }
      });
      requestMobileDataRefresh("appActive");
      return () => {
        isMounted = false;
        focused.current = false;
        focusVersion.current++;
      };
    }, [loadLocal])
  );

  useFocusEffect(useCallback(() => subscribeToSyncEvents((event) => {
    const touchesRequests = event.refreshedZones?.includes("requests") === true
      || event.acceptedOperationIds.length > 0
      || (event.changedAssignmentIds?.length ?? 0) > 0
      || event.completedAssignmentIds.length > 0
      || (event.cancelledAssignmentIds?.length ?? 0) > 0;
    if (!touchesRequests) {
      return;
    }

    const version = focusVersion.current;
    void loadLocal()
      .catch((caught) => {
        void logMobileError("patrol.request-board.refresh-load.failed", caught);
        if (focused.current && version === focusVersion.current) setLoadError(caught instanceof Error ? caught.message : "Не удалось обновить заявки.");
      });
  }), [loadLocal]));

  async function handleRefresh() {
    if (manualRefresh.current) return;
    manualRefresh.current = true;
    const version = focusVersion.current;
    const isCurrent = () => focused.current && version === focusVersion.current;
    beginRefresh();
    setMessage(null);
    try {
      const updated = await refreshMobileData();
      if (!isCurrent()) return;
      await loadLocal();
      if (isCurrent()) setMessage(updated ? "Заявки обновлены." : "Нет связи. Показаны заявки, сохраненные на телефоне.");
    } catch (error) {
      void logMobileError("patrol.request-board.refresh.failed", error);
      if (!isCurrent()) return;
      setMessage(error instanceof Error ? error.message : "Не удалось обновить заявки. Показаны локальные данные.");
    } finally {
      manualRefresh.current = false;
      endRefresh();
    }
  }

  async function openRequest(item: RequestBoardItem) {
    if (starting.current) return;
    if (!['available', 'assigned', 'accepted', 'inProgress', 'paused'].includes(item.status)
      || ((item.status === 'available' || item.status === 'assigned') && (!item.assignedEmployeeId || item.performerSelectionAvailable))) {
      router.push(`/patrol/request/${item.requestId}`);
      return;
    }
    starting.current = true;
    setStartingId(item.requestId);
    setLoadError(null);
    const version = focusVersion.current;
    const isCurrent = () => focused.current && version === focusVersion.current;
    try {
      const scope = await captureDataOwnerContext();
      const path = await enterPatrolRequest(item.requestId, item.assignedEmployeeId ?? undefined, isCurrent);
      await assertDataOwnerContext(scope);
      if (isCurrent()) router.push(path as never);
    } catch (error) {
      if (isCurrent()) setLoadError(error instanceof Error ? error.message : 'Не удалось начать обход. Повторите попытку.');
    } finally {
      starting.current = false;
      setStartingId(null);
    }
  }

  const summary = useMemo(
    () => ({
      all: items.filter((item) => !historyStatuses.has(item.status)).length,
      assigned: items.filter((item) => item.status === "assigned" || item.status === "accepted").length,
      inProgress: items.filter((item) => item.status === "inProgress" || item.status === "paused").length,
      history: items.filter((item) => historyStatuses.has(item.status)).length
    }),
    [items]
  );

  const filteredItems = useMemo(() => {
    const source = activeTab === "history" ? items.filter((item) => historyStatuses.has(item.status))
      : activeTab === "inProgress" ? items.filter((item) => item.status === "inProgress" || item.status === "paused")
      : items.filter((item) => !historyStatuses.has(item.status));
    return source.filter(item => item.requestId !== selectedRequestId).filter((item) => `${item.routeName} ${item.assignedFullName ?? ""}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU"))).sort(compareRequestDatesNewestFirst);
  }, [activeTab, items, query, selectedRequestId]);

  const renderItem: ListRenderItem<RequestBoardItem> = ({ item }) => (
    <RequestCard item={item} busy={startingId === item.requestId} disabled={startingId !== null} onPress={() => void openRequest(item)} />
  );

  return (
    <ScreenList
      compactHeader
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      listRef={listRef}
      data={filteredItems}
      onScroll={event => { const key = viewKey.current; const saved = key ? boardViews.get(key) : undefined; if (key && saved && restoreOffset.current === null) boardViews.set(key, { ...saved, offset: event.nativeEvent.contentOffset.y }); }}
      scrollEventThrottle={100}
      onContentSizeChange={() => { if (restoreOffset.current !== null && listRef.current) { const offset = restoreOffset.current; restoreOffset.current = null; listRef.current.scrollToOffset({ offset, animated: false }); } }}
      keyExtractor={(item) => item.requestId}
      onRefresh={() => void handleRefresh()}
      refreshing={isRefreshing}
      floatingNotice={<TransientNotice message={message ?? loadError ?? notice ?? null} />}
      ListEmptyComponent={loadError ? (
        <Card>
          <Text style={[styles.text, { color: colors.danger }]}>Не удалось загрузить заявки.</Text>
          <PrimaryButton icon="refresh-outline" label="Повторить загрузку" onPress={() => void handleRefresh()} variant="secondary" />
        </Card>
      ) : (
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>В этой вкладке пока пусто</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Потяните экран вниз для обновления или выберите другую вкладку.</Text>
        </Card>
      )}
      renderItem={renderItem}
      title={selectedRequestId ? "" : "Обход"}
      headerContent={
        <>
          {items.find(item => item.requestId === selectedRequestId) ? <View style={{ gap: 8 }}>
            <RequestCard progressLabel={progressLabel} item={items.find(item => item.requestId === selectedRequestId)!} busy={startingId === selectedRequestId} disabled={startingId !== null} onPress={() => void openRequest(items.find(item => item.requestId === selectedRequestId)!)} />
          </View> : null}

          <SelectionTabs<RequestTab>
            compact
            accessibilityLabel="Разделы заявок"
            items={[
              { count: summary.all, label: "Активные", value: "all" },
              { count: summary.inProgress, label: "В работе", value: "inProgress" },
              { count: summary.history, label: "История", value: "history" }
            ]}
            onChange={value => { setActiveTab(value); const key = viewKey.current; const saved = key ? boardViews.get(key) : undefined; if (key && saved) { boardViews.set(key, { ...saved, tab: value, offset: 0 }); } listRef.current?.scrollToOffset({ offset: 0, animated: false }); }}
            value={activeTab}
          />
          <TextInput accessibilityLabel="Найти маршрут или сотрудника" placeholder="Найти маршрут или сотрудника" value={query} onChangeText={value => { setQuery(value); const key = viewKey.current; const saved = key ? boardViews.get(key) : undefined; if (key && saved) { boardViews.set(key, { ...saved, query: value, offset: 0 }); } }} style={{ color: colors.text, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 48 }} />
          <Text style={[styles.title, { color: colors.text }]}>{activeTab === "history" ? "История заявок" : activeTab === "inProgress" ? "Незавершённые обходы" : "Заявки на обход"}</Text>

        </>
      }
    />
  );
}

function RequestCard({ item, onPress, busy, disabled, progressLabel }: { item: RequestBoardItem; onPress: () => void; busy: boolean; disabled: boolean; progressLabel?: string }) {
  const { colors } = useAppTheme();

  return (
    <View>
      <Card style={styles.requestCard}>

        <View style={[styles.requestContent, progressLabel ? { padding: 8 } : null]}>
          <View style={styles.row}>
            <View style={styles.titleBox}>
              {item.displayNumber && !progressLabel ? <Text style={[styles.displayNumber, { color: colors.mutedText }]}>{item.displayNumber}</Text> : null}
              <Text style={[styles.title, { color: colors.text }]}>{item.routeName}</Text>
            </View>
            <StatusPill label={statusLabel(item.status)} tone={statusTone(item.status)} />
          </View>
          <Text style={[styles.text, { color: colors.mutedText }]}>{item.assignedFullName ?? "сотрудник не выбран"}</Text>
          <View style={styles.actionRow}>
          <View style={{ flex: 1, minWidth: 100, gap: 6 }}>
            {progressLabel ? <Text style={[styles.meta, { color: colors.primary }]}>{progressLabel}</Text> : null}
            <Text style={[styles.meta, { color: colors.mutedText }]}>План: {formatDateTime(item.plannedStartAt)}</Text>
          </View>
          <View style={{ flexShrink: 1, maxWidth: "60%" }}>
          <PrimaryButton variant={progressLabel ? "primary" : "ghost"} loading={busy} disabled={disabled} icon={['inProgress', 'paused'].includes(item.status) ? 'play-outline' : 'arrow-forward-outline'}
            label={['inProgress', 'paused'].includes(item.status) ? 'Продолжить' : ['assigned', 'accepted', 'available'].includes(item.status) ? 'Начать обход' : 'Открыть результаты'}
            onPress={onPress} />
          </View>
          </View>
        </View>
      </Card>
    </View>
  );
}


function statusLabel(status: string) {
  switch (status) {
    case "available":
      return "Доступна";
    case "assigned":
      return "Назначена";
    case "accepted":
      return "Принята";
    case "inProgress":
      return "В работе";
    case "paused":
      return "Пауза";
    case "completedLocal":
    case "syncing":
    case "retryLater":
      return "Ждет отправки";
    case "syncError":
      return "Ошибка";
    case "authRequired":
      return "Нужен вход";
    case "needsDispatcherDecision":
      return "Решение";
    case "cancelledServer":
    case "cancelled":
      return "Отменена";
    default:
      return "История";
  }
}

function statusTone(status: string) {
  if (status === "available" || status === "assigned") {
    return "success";
  }
  if (status === "syncError" || status === "authRequired" || status === "cancelledServer" || status === "cancelled") {
    return "danger";
  }
  if (status === "completedLocal" || status === "syncing" || status === "retryLater" || status === "paused" || status === "needsDispatcherDecision") {
    return "warning";
  }
  return "neutral";
}


function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

const styles = StyleSheet.create({

  actionRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  requestCard: {
    overflow: "hidden",
    padding: 0
  },
  requestContent: {
    gap: 8,
    padding: 14,
    paddingLeft: 14
  },
  statusLine: {
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
    width: 5
  },
  statusLineSuccess: {
    backgroundColor: "#16a34a"
  },
  statusLineWarning: {
    backgroundColor: "#f59e0b"
  },
  statusLineDanger: {
    backgroundColor: "#ef4444"
  },
  statusLineNeutral: {
    backgroundColor: "#64748b"
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between"
  },
  titleBox: {
    flexGrow: 1,
    flexBasis: "55%",
    gap: 3
  },
  displayNumber: {
    fontSize: 14,
    fontWeight: "900"
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23
  },
  text: {
    fontSize: 14,
    lineHeight: 20
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  meta: {
    fontSize: 14,
    fontWeight: "800"
  },
  message: {
    fontSize: 14,
    lineHeight: 20
  }
});

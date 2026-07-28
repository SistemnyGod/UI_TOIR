import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ListRenderItem, Pressable, StyleSheet, Text, View } from "react-native";

import { listRequestBoard, RequestBoardItem } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { logMobileError } from "@/services/mobileErrorReporter";
import { requestMobileDataRefresh } from "@/sync/syncTriggers";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { ScreenList } from "@/ui/Screen";
import { SelectionTabs, SelectionTransition } from "@/ui/SelectionTabs";
import { StatusPill } from "@/ui/StatusPill";

type RequestTab = "all" | "history";

const historyStatuses = new Set(["completed", "completedServer", "cancelled", "cancelledServer"]);

function requestStatusRank(status: string) {
  if (status === "inProgress") return 0;
  if (status === "accepted" || status === "paused") return 1;
  if (status === "assigned") return 2;
  if (status === "available") return 3;
  if (status === "completedLocal" || status === "syncing" || status === "retryLater") return 4;
  return 5;
}

export function RequestBoardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [items, setItems] = useState<RequestBoardItem[]>([]);
  const [activeTab, setActiveTab] = useState<RequestTab>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    const rows = await listRequestBoard();
    setItems(rows);
    setLoadError(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      void loadLocal().catch((caught) => {
        void logMobileError("patrol.request-board.load.failed", caught);
        if (isMounted) {
          setLoadError(caught instanceof Error ? caught.message : "Не удалось прочитать заявки.");
        }
      });
      requestMobileDataRefresh("appActive");
      return () => {
        isMounted = false;
      };
    }, [loadLocal])
  );

  useEffect(() => subscribeToSyncEvents(() => {
    void loadLocal().catch((caught) => {
      void logMobileError("patrol.request-board.refresh-load.failed", caught);
      setLoadError(caught instanceof Error ? caught.message : "Не удалось обновить заявки.");
    });
  }), [loadLocal]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setMessage(null);
    try {
      const updated = await refreshMobileData();
      await loadLocal();
      setMessage(updated ? "Заявки обновлены." : "Нет связи. Показаны заявки, сохраненные на телефоне.");
    } catch (error) {
      void logMobileError("patrol.request-board.refresh.failed", error);
      setLoadError(error instanceof Error ? error.message : "Не удалось обновить заявки.");
      setMessage(error instanceof Error ? error.message : "Не удалось обновить заявки. Показаны локальные данные.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const summary = useMemo(
    () => ({
      all: items.filter((item) => !historyStatuses.has(item.status)).length,
      history: items.filter((item) => historyStatuses.has(item.status)).length
    }),
    [items]
  );

  const filteredItems = useMemo(() => {
    const source = activeTab === "history"
      ? items.filter((item) => historyStatuses.has(item.status))
      : items.filter((item) => !historyStatuses.has(item.status));
    return [...source].sort((left, right) => requestStatusRank(left.status) - requestStatusRank(right.status)
      || left.plannedStartAt.localeCompare(right.plannedStartAt)
      || left.requestId.localeCompare(right.requestId));
  }, [activeTab, items]);

  const renderItem: ListRenderItem<RequestBoardItem> = ({ item }) => (
    <SelectionTransition selectionKey={activeTab}>
      <RequestCard item={item} onPress={() => router.push(`/patrol/request/${item.requestId}`)} />
    </SelectionTransition>
  );

  return (
    <ScreenList
      data={filteredItems}
      keyExtractor={(item) => item.requestId}
      onRefresh={() => void handleRefresh()}
      refreshing={isRefreshing}
      ListEmptyComponent={loadError ? (
        <Card>
          <Text style={[styles.text, { color: "#b91c1c" }]}>{loadError}</Text>
          <PrimaryButton icon="refresh-outline" label="Повторить загрузку" onPress={() => void loadLocal()} variant="secondary" />
        </Card>
      ) : (
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>В этой вкладке пока пусто</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Потяните экран вниз для обновления или выберите другую вкладку.</Text>
        </Card>
      )}
      renderItem={renderItem}
      title="Заявки на обход"
      subtitle="Откройте заявку, чтобы проверить маршрут."
      headerContent={
        <>
          <SelectionTabs<RequestTab>
            accessibilityLabel="Разделы заявок"
            items={[
              { count: summary.all, icon: "file-tray-full-outline", label: "Все заявки", value: "all" },
              { count: summary.history, icon: "time-outline", label: "История", value: "history" }
            ]}
            onChange={setActiveTab}
            value={activeTab}
          />

          {message ? <Text style={[styles.message, { color: colors.mutedText }]}>{message}</Text> : null}
        </>
      }
    />
  );
}

function RequestCard({ item, onPress }: { item: RequestBoardItem; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable accessibilityHint={`Открыть заявку ${item.routeName}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed ? { opacity: 0.88 } : null]}>
      <Card style={styles.requestCard}>
        <View style={[styles.statusLine, statusLineStyle(item.status)]} />
        <View style={styles.requestContent}>
          <View style={styles.row}>
            <View style={styles.titleBox}>
              {item.displayNumber ? <Text style={[styles.displayNumber, { color: colors.mutedText }]}>{item.displayNumber}</Text> : null}
              <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>{item.routeName}</Text>
            </View>
            <StatusPill label={statusLabel(item.status)} tone={statusTone(item.status)} />
          </View>
          <Text style={[styles.text, { color: colors.mutedText }]}>{item.assignedFullName ?? "Свободная заявка"}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.meta, { color: colors.mutedText }]}>План: {formatDateTime(item.plannedStartAt)}</Text>
            <Ionicons color={colors.primary} name="chevron-forward" size={20} />
          </View>
        </View>
      </Card>
    </Pressable>
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

function statusLineStyle(status: string) {
  if (status === "available" || status === "assigned") {
    return styles.statusLineSuccess;
  }
  if (status === "syncError" || status === "authRequired" || status === "cancelledServer" || status === "cancelled") {
    return styles.statusLineDanger;
  }
  if (status === "completedLocal" || status === "syncing" || status === "retryLater" || status === "paused" || status === "needsDispatcherDecision") {
    return styles.statusLineWarning;
  }
  return styles.statusLineNeutral;
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

  requestCard: {
    overflow: "hidden",
    padding: 0
  },
  requestContent: {
    gap: 8,
    padding: 14,
    paddingLeft: 18
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
    gap: 10,
    justifyContent: "space-between"
  },
  titleBox: {
    flex: 1,
    gap: 3
  },
  displayNumber: {
    fontSize: 12,
    fontWeight: "900"
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23
  },
  text: {
    fontSize: 14,
    lineHeight: 19
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  meta: {
    fontSize: 12,
    fontWeight: "800"
  },
  message: {
    fontSize: 13,
    lineHeight: 18
  }
});

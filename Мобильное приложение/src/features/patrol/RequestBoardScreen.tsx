import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ListRenderItem, Pressable, StyleSheet, Text, View } from "react-native";

import { listRequestBoard, RequestBoardItem } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { subscribeToSyncEvents } from "@/sync/syncEvents";
import { Card } from "@/ui/Card";
import { ScreenList } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

type RequestTab = "available" | "mine" | "unsent" | "history";

const activeStatuses = new Set(["accepted", "inProgress", "paused"]);
const unsentStatuses = new Set(["completedLocal", "syncing", "retryLater", "syncError", "authRequired", "needsDispatcherDecision"]);
const historyStatuses = new Set(["completed", "completedServer", "cancelled", "cancelledServer"]);

export function RequestBoardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [items, setItems] = useState<RequestBoardItem[]>([]);
  const [activeTab, setActiveTab] = useState<RequestTab>("available");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    setItems(await listRequestBoard());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      void listRequestBoard().then((rows) => {
        if (isMounted) {
          setItems(rows);
        }
      });
      return () => {
        isMounted = false;
      };
    }, [])
  );

  useEffect(() => subscribeToSyncEvents(() => {
    void loadLocal();
  }), [loadLocal]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setMessage(null);
    try {
      const updated = await refreshMobileData();
      await loadLocal();
      setMessage(updated ? "Заявки обновлены." : "Нет связи. Показаны заявки, сохраненные на телефоне.");
    } catch (error) {
      await loadLocal();
      setMessage(error instanceof Error ? error.message : "Не удалось обновить заявки. Показаны локальные данные.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const summary = useMemo(
    () => ({
      available: items.filter((item) => item.status === "available" || item.status === "assigned").length,
      mine: items.filter((item) => activeStatuses.has(item.status)).length,
      unsent: items.filter((item) => unsentStatuses.has(item.status)).length,
      history: items.filter((item) => historyStatuses.has(item.status)).length
    }),
    [items]
  );

  const filteredItems = useMemo(() => {
    switch (activeTab) {
      case "mine":
        return items.filter((item) => activeStatuses.has(item.status));
      case "unsent":
        return items.filter((item) => unsentStatuses.has(item.status));
      case "history":
        return items.filter((item) => historyStatuses.has(item.status));
      default:
        return items.filter((item) => item.status === "available" || item.status === "assigned");
    }
  }, [activeTab, items]);

  const renderItem: ListRenderItem<RequestBoardItem> = ({ item }) => (
    <RequestCard item={item} onPress={() => router.push(`/patrol/request/${item.requestId}`)} />
  );

  return (
    <ScreenList
      data={filteredItems}
      keyExtractor={(item) => item.requestId}
      onRefresh={() => void handleRefresh()}
      refreshing={isRefreshing}
      ListEmptyComponent={
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>В этой вкладке пока пусто</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>Потяните экран вниз для обновления или выберите другую вкладку.</Text>
        </Card>
      }
      renderItem={renderItem}
      title="Заявки на обход"
      subtitle="Откройте заявку, чтобы проверить маршрут."
      headerContent={
        <>
          <View style={styles.tabBar}>
            <RequestTabButton active={activeTab === "available"} count={summary.available} label="Доступные" onPress={() => setActiveTab("available")} />
            <RequestTabButton active={activeTab === "mine"} count={summary.mine} label="Мои" onPress={() => setActiveTab("mine")} />
            <RequestTabButton active={activeTab === "unsent"} count={summary.unsent} label="Не отправлено" onPress={() => setActiveTab("unsent")} />
            <RequestTabButton active={activeTab === "history"} count={summary.history} label="История" onPress={() => setActiveTab("history")} />
          </View>

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
              <Text style={[styles.displayNumber, { color: colors.mutedText }]}>{item.displayNumber ?? shortRequestId(item.requestId)}</Text>
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

function RequestTabButton({ active, count, label, onPress }: { active: boolean; count: number; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.tabButton, active ? styles.tabButtonActive : null]}>
      <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]}>{label}</Text>
      <Text style={[styles.tabCount, active ? styles.tabCountActive : null]}>{count}</Text>
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

function shortRequestId(requestId: string) {
  return `#${requestId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
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
  tabBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  tabButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dbe5f2",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  tabButtonActive: {
    backgroundColor: "#1e5bff",
    borderColor: "#1e5bff"
  },
  tabLabel: {
    color: "#344563",
    fontSize: 12,
    fontWeight: "800"
  },
  tabLabelActive: {
    color: "#ffffff"
  },
  tabCount: {
    color: "#1e5bff",
    fontSize: 12,
    fontWeight: "900"
  },
  tabCountActive: {
    color: "#ffffff"
  },
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

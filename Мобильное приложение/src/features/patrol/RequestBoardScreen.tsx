import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { listRequestBoard, RequestBoardItem } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { refreshMobileData } from "@/services/mobileDataRefreshService";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function RequestBoardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [items, setItems] = useState<RequestBoardItem[]>([]);
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

  async function handleRefresh() {
    setIsRefreshing(true);
    setMessage(null);

    try {
      const updated = await refreshMobileData();
      await loadLocal();
      setMessage(updated ? "Заявки обновлены." : "Нет сети. Показаны заявки, сохраненные на телефоне.");
    } catch (error) {
      await loadLocal();
      setMessage(error instanceof Error ? error.message : "Не удалось обновить заявки. Показаны локальные данные.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const summary = useMemo(
    () => ({
      available: items.filter((item) => item.status === "available").length,
      inProgress: items.filter((item) => item.status === "inProgress").length,
      assigned: items.filter((item) => item.status !== "available" && item.status !== "inProgress").length,
      total: items.length
    }),
    [items]
  );

  return (
    <Screen title="Выбор заявки" subtitle="Выберите обход, который нужно взять в работу.">
      <View style={styles.summaryGrid}>
        <Metric label="Доступно" value={summary.available} tone="success" />
        <Metric label="В работе" value={summary.inProgress} tone={summary.inProgress > 0 ? "warning" : "neutral"} />
        <Metric label="Назначено" value={summary.assigned} />
        <Metric label="Всего" value={summary.total} />
      </View>

      <PrimaryButton disabled={isRefreshing} label={isRefreshing ? "Обновляем..." : "Обновить заявки"} onPress={handleRefresh} variant="secondary" />
      {message ? <Text style={[styles.message, { color: colors.mutedText }]}>{message}</Text> : null}

      {items.length === 0 ? (
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>Нет доступных заявок</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>
            Когда оператор назначит обход, заявка появится здесь после автоматического обновления. Уже загруженные заявки можно открыть без интернета.
          </Text>
        </Card>
      ) : null}

      {items.map((item) => (
        <Pressable
          accessibilityHint={`Открыть заявку ${item.routeName}`}
          accessibilityRole="button"
          key={item.requestId}
          onPress={() => router.push(`/patrol/request/${item.requestId}`)}
          style={({ pressed }) => [pressed ? { opacity: 0.88 } : null]}
        >
          <Card style={[styles.requestCard, item.status === "inProgress" ? styles.activeCard : null]}>
            <View style={[styles.statusLine, statusLineStyle(item.status)]} />
            <View style={styles.requestContent}>
              <View style={styles.row}>
                <View style={styles.titleBox}>
                  <Text style={[styles.title, { color: colors.text }]}>{item.routeName}</Text>
                  <Text style={[styles.text, { color: colors.mutedText }]}>
                    Для: {item.assignedFullName ?? "можно взять свободную заявку"}
                  </Text>
                </View>
                <StatusPill label={statusLabel(item.status)} tone={statusTone(item.status)} />
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.meta, { color: colors.mutedText }]}>Начало: {formatDateTime(item.plannedStartAt)}</Text>
                <Text style={[styles.meta, { color: colors.mutedText }]}>Версия: {item.revision}</Text>
              </View>
              <Text style={[styles.openHint, { color: colors.mutedText }]}>Открыть ›</Text>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.metricValue, { color: colors.text }, tone === "success" ? styles.success : null, tone === "warning" ? styles.warning : null]}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: colors.mutedText }]}>{label}</Text>
    </View>
  );
}

function statusLabel(status: string) {
  if (status === "inProgress") {
    return "В работе";
  }

  if (status === "available") {
    return "Доступно";
  }

  return "Назначено";
}

function statusTone(status: string) {
  if (status === "inProgress") {
    return "warning";
  }

  return status === "available" ? "success" : "neutral";
}

function statusLineStyle(status: string) {
  if (status === "inProgress") {
    return styles.statusLineWarning;
  }

  return status === "available" ? styles.statusLineSuccess : styles.statusLineNeutral;
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
  requestCard: {
    overflow: "hidden",
    padding: 0
  },
  activeCard: {
    backgroundColor: "#fffaf2",
    borderColor: "#f59e0b"
  },
  statusLine: {
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
    width: 3
  },
  statusLineSuccess: {
    backgroundColor: "#22c55e"
  },
  statusLineWarning: {
    backgroundColor: "#f59e0b"
  },
  statusLineNeutral: {
    backgroundColor: "#94a3b8"
  },
  requestContent: {
    gap: 10,
    padding: 14,
    paddingLeft: 17
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  titleBox: {
    flex: 1,
    gap: 4
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between"
  },
  meta: {
    fontSize: 13,
    fontWeight: "700"
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  },
  openHint: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right"
  },
  success: {
    color: "#22c55e"
  },
  warning: {
    color: "#f59e0b"
  }
});

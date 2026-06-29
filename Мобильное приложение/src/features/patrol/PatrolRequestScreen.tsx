import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import {
  acceptRequestLocally,
  ActiveAssignment,
  getAssignmentByRequestId,
  getRequestBoardItem,
  releaseAcceptedRequestLocally,
  RequestBoardItem,
  startAssignmentLocally
} from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";

export function PatrolRequestScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const [request, setRequest] = useState<RequestBoardItem | null>(null);
  const [assignment, setAssignment] = useState<ActiveAssignment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [item, existing] = await Promise.all([getRequestBoardItem(requestId), getAssignmentByRequestId(requestId)]);
    setRequest(item);
    setAssignment(existing);
  }, [requestId]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      void load().catch(() => {
        if (isMounted) {
          setRequest(null);
          setAssignment(null);
        }
      });
      return () => {
        isMounted = false;
      };
    }, [load])
  );

  async function runAction(action: () => Promise<void>) {
    setIsSubmitting(true);
    setError(null);
    try {
      await action();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось выполнить действие.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAccept() {
    Alert.alert(
      "Принять эту заявку?",
      "Проверьте маршрут и время. После принятия заявка появится в разделе \"Мои\", но до старта ее еще можно вернуть.",
      [
        { text: "Назад", style: "cancel" },
        {
          text: "Принять",
          onPress: () => {
            void runAction(async () => {
              const result = await acceptRequestLocally(requestId);
              setAssignment(result.assignment);
              setRequest((current) => current ? { ...current, status: "accepted" } : current);
            });
          }
        }
      ]
    );
  }

  async function handleStart() {
    if (!assignment) {
      return;
    }
    await runAction(async () => {
      const updated = await startAssignmentLocally(assignment.assignmentId);
      if (updated) {
        router.replace(`/patrol/assignment/${updated.assignmentId}`);
      }
    });
  }

  function handleRelease() {
    if (!assignment) {
      return;
    }

    Alert.alert(
      "Вернуть заявку?",
      "Заявка снова появится в списке доступных. Это можно сделать только до начала обхода.",
      [
        { text: "Оставить", style: "cancel" },
        {
          text: "Вернуть",
          style: "destructive",
          onPress: () => {
            void runAction(async () => {
              await releaseAcceptedRequestLocally(assignment.assignmentId);
              setAssignment(null);
              setRequest((current) => current ? { ...current, status: current.assignedFullName ? "assigned" : "available" } : current);
              router.replace("/patrol/request-board");
            });
          }
        }
      ]
    );
  }

  if (!request) {
    return (
      <Screen title="Заявка" subtitle="Карточка заявки на обход.">
        <Card>
          <Text style={[styles.text, { color: colors.mutedText }]}>Заявка не найдена на телефоне.</Text>
        </Card>
        <PrimaryButton icon="arrow-back-outline" label="Назад к списку" onPress={() => router.replace("/patrol/request-board")} variant="secondary" />
      </Screen>
    );
  }

  const canAccept = !assignment && (request.status === "available" || request.status === "assigned");
  const canStart = assignment?.status === "accepted" || assignment?.status === "paused";
  const canRelease = assignment?.status === "accepted" && !assignment.startedAtLocal;
  const canOpen = assignment && !canStart;

  return (
    <Screen title="Проверка заявки" subtitle="Сначала проверьте маршрут. Заявка принимается только после подтверждения.">
      <Card style={styles.guideCard}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Что делать дальше</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>{actionHint(assignment?.status ?? request.status)}</Text>
      </Card>

      <Card>
        <View style={styles.headerRow}>
          <StatusPill label={statusLabel(assignment?.status ?? request.status)} tone={statusTone(assignment?.status ?? request.status)} />
          <Text style={[styles.displayNumber, { color: colors.mutedText }]}>{request.displayNumber ?? shortRequestId(request.requestId)}</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{request.routeName}</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>{request.assignedFullName ?? "Свободная заявка"}</Text>
        <View style={styles.infoGrid}>
          <Info label="Начало" value={formatDateTime(request.plannedStartAt)} />
          <Info label="Версия" value={String(request.revision)} />
          <Info label="Состояние" value={statusLabel(assignment?.status ?? request.status)} />
        </View>
      </Card>

      {assignment ? (
        <Card style={styles.existingCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Заявка уже у вас</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>
            {assignment.status === "accepted"
              ? "Обход еще не начат. Можно начать обход или вернуть заявку в список."
              : assignment.status === "paused"
                ? "Обход приостановлен. Можно продолжить с того же места."
                : "Откройте обход, чтобы продолжить работу или проверить отправку."}
          </Text>
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isSubmitting ? <ActivityIndicator /> : null}

      {canAccept ? <PrimaryButton disabled={isSubmitting} icon="checkmark-circle-outline" label="Принять эту заявку" onPress={handleAccept} /> : null}
      {canStart ? <PrimaryButton disabled={isSubmitting} icon="play-outline" label={assignment?.status === "paused" ? "Продолжить обход" : "Начать обход"} onPress={handleStart} /> : null}
      {canOpen ? <PrimaryButton disabled={isSubmitting} icon="shield-checkmark-outline" label="Открыть обход" onPress={() => router.replace(`/patrol/assignment/${assignment.assignmentId}`)} /> : null}
      {canRelease ? <PrimaryButton disabled={isSubmitting} icon="return-up-back-outline" label="Вернуть заявку" onPress={handleRelease} variant="danger" /> : null}
      <PrimaryButton disabled={isSubmitting} icon="swap-horizontal-outline" label="Назад к списку" onPress={() => router.replace("/patrol/request-board")} variant="secondary" />
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.infoCell}>
      <Text style={[styles.infoLabel, { color: colors.mutedText }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
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
      return "Приостановлена";
    case "completedLocal":
    case "syncing":
      return "Ждет отправки";
    case "syncError":
      return "Ошибка отправки";
    case "authRequired":
      return "Нужно войти";
    case "needsDispatcherDecision":
      return "Решение диспетчера";
    case "cancelledServer":
    case "cancelled":
      return "Отменена";
    default:
      return "История";
  }
}

function statusTone(status: string) {
  if (status === "available" || status === "assigned" || status === "accepted") {
    return "success";
  }
  if (status === "syncError" || status === "authRequired" || status === "cancelledServer" || status === "cancelled") {
    return "danger";
  }
  if (status === "paused" || status === "completedLocal" || status === "syncing" || status === "needsDispatcherDecision") {
    return "warning";
  }
  return "neutral";
}

function actionHint(status: string) {
  switch (status) {
    case "available":
    case "assigned":
      return "Если это нужный маршрут, нажмите \"Принять эту заявку\". Одним касанием из списка заявка не принимается.";
    case "accepted":
      return "Заявка принята, обход еще не начат. Можно начать обход или вернуть заявку в список.";
    case "paused":
      return "Обход на паузе. Можно продолжить с сохраненным прогрессом.";
    case "inProgress":
      return "Обход уже идет. Откройте его, чтобы сканировать метки или отправить отчет.";
    case "completedLocal":
    case "syncing":
      return "Отчет сохранен на телефоне и ожидает отправки. Его можно проверить в очереди.";
    case "syncError":
    case "authRequired":
      return "Есть проблема с отправкой. Данные не удалены, откройте очередь восстановления.";
    case "cancelledServer":
    case "cancelled":
      return "Заявка отменена диспетчером. Начинать обход по ней не нужно.";
    case "needsDispatcherDecision":
      return "По заявке нужно решение диспетчера. Локальные данные сохранены.";
    default:
      return "Проверьте маршрут, время и статус. Доступные действия показаны ниже.";
  }
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
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  displayNumber: {
    fontSize: 13,
    fontWeight: "900"
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "900"
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  infoCell: {
    backgroundColor: "#f8fafc",
    borderColor: "#dbe5f2",
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: "30%",
    flexGrow: 1,
    gap: 3,
    padding: 10
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "900"
  },
  existingCard: {
    borderColor: "#bfdbfe"
  },
  guideCard: {
    backgroundColor: "#f8fbff",
    borderColor: "#bfdbfe"
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    lineHeight: 20
  }
});

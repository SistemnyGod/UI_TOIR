import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import {
  ActiveAssignment,
  getActiveAssignment,
  getRequestBoardItem,
  RequestBoardItem,
  takeRequestLocally
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
  const [blockingAssignment, setBlockingAssignment] = useState<ActiveAssignment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      void Promise.all([getRequestBoardItem(requestId), getActiveAssignment()]).then(([item, active]) => {
        if (isMounted) {
          setRequest(item);
          setBlockingAssignment(active);
        }
      });

      return () => {
        isMounted = false;
      };
    }, [requestId])
  );

  async function handleTakeRequest() {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await takeRequestLocally(requestId);
      router.replace(`/patrol/assignment/${result.assignment.assignmentId}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Не удалось взять заявку. Проверьте, что нет другого активного обхода.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!request) {
    return (
      <Screen title="Заявка" subtitle="Карточка заявки на обход.">
        <Card>
          <Text style={[styles.text, { color: colors.mutedText }]}>Заявка не найдена на телефоне.</Text>
        </Card>
      </Screen>
    );
  }

  const hasBlockingAssignment = blockingAssignment !== null;
  const blockingAssignmentLabel =
    blockingAssignment?.status === "completedLocal" ? "Отчет ожидает отправки" : "Уже есть активный обход";
  const blockingAssignmentText =
    blockingAssignment?.status === "completedLocal"
      ? "Предыдущий отчет сохранен на телефоне и ожидает отправки. Новую заявку можно взять после успешной синхронизации."
      : "Сначала завершите текущий обход. Параллельные обходы в MVP не включены.";

  return (
    <Screen title="Заявка" subtitle="Проверьте маршрут и возьмите обход в работу.">
      <Card>
        <StatusPill label={request.status === "inProgress" ? "В работе" : "Готова к работе"} tone="success" />
        <Text style={[styles.title, { color: colors.text }]}>{request.routeName}</Text>
        <Text style={[styles.text, { color: colors.mutedText }]}>{request.assignedFullName ?? "Свободная заявка"}</Text>
        <Text style={[styles.meta, { color: colors.mutedText }]}>{formatDateTime(request.plannedStartAt)}</Text>
      </Card>

      {blockingAssignment ? (
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>{blockingAssignmentLabel}</Text>
          <Text style={[styles.text, { color: colors.mutedText }]}>{blockingAssignmentText}</Text>
          <PrimaryButton
            label={blockingAssignment.status === "completedLocal" ? "Открыть сохраненный отчет" : "Открыть активный обход"}
            onPress={() => router.replace(`/patrol/assignment/${blockingAssignment.assignmentId}`)}
          />
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isSubmitting ? <ActivityIndicator /> : null}
      <PrimaryButton disabled={isSubmitting || hasBlockingAssignment} label="Взять в работу" onPress={handleTakeRequest} />
    </Screen>
  );
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
  title: {
    fontSize: 20,
    fontWeight: "600"
  },
  text: {
    fontSize: 15,
    lineHeight: 21
  },
  meta: {
    fontSize: 14,
    fontWeight: "600"
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    lineHeight: 20
  }
});

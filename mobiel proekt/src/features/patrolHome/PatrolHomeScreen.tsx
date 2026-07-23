import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ActiveAssignment, AssignmentProgress, RequestBoardItem } from "@/db/repositories/patrolRepository";
import { useAppTheme } from "@/features/settings/themePreference";
import { Card } from "@/ui/Card";
import { PrimaryButton } from "@/ui/PrimaryButton";
import { Screen } from "@/ui/Screen";
import { StatusPill } from "@/ui/StatusPill";
import { PatrolHomeActive, usePatrolHomeDashboard } from "./usePatrolHomeDashboard";

export function PatrolHomeScreen() {
  const router = useRouter();
  const dashboard = usePatrolHomeDashboard();

  return (
    <Screen
      title="Обход"
      subtitle={dashboard.active ? undefined : "Выберите заявку, проверьте маршрут и подтвердите принятие."}
    >
      {dashboard.active ? (
        <ActivePatrolCard
          active={dashboard.active}
          onOpenAllPoints={() => router.push(`/patrol/assignment/${dashboard.active!.assignment.assignmentId}/all-points`)}
          onOpenPatrol={() => {
            const action = getPrimaryAction(dashboard.active!.assignment.status);
            router.push(action.path(dashboard.active!.assignment.assignmentId) as never);
          }}
          onOpenQueue={() => router.push("/settings/sync-queue" as never)}
          onOpenRequests={() => router.push("/patrol/request-board")}
        />
      ) : (
        <EmptyPatrolCard
          onOpenRequests={() => router.push("/patrol/request-board")}
          summary={dashboard.summary}
        />
      )}

      <RequestSection
        isRefreshing={dashboard.isRefreshing}
        onOpenRequest={(requestId) => router.push(`/patrol/request/${requestId}`)}
        onRefresh={() => void dashboard.refresh()}
        requests={dashboard.visibleRequests}
      />

      {dashboard.message ? <DashboardMessage message={dashboard.message} /> : null}
    </Screen>
  );
}

function ActivePatrolCard({
  active,
  onOpenAllPoints,
  onOpenPatrol,
  onOpenQueue,
  onOpenRequests
}: {
  active: PatrolHomeActive;
  onOpenAllPoints: () => void;
  onOpenPatrol: () => void;
  onOpenQueue: () => void;
  onOpenRequests: () => void;
}) {
  const { colors } = useAppTheme();
  const status = active.assignment.status;
  const isCompletedLocal = status === "completedLocal";
  const isAccepted = status === "accepted";
  const isPaused = status === "paused";
  const isInProgress = status === "inProgress";
  const canUsePatrolAction = isAccepted || isPaused || isInProgress;
  const primaryAction = getPrimaryAction(status);
  const percent = progressPercent(active.progress);

  return (
    <Card>
      <CardHeading
        eyebrow="Текущая заявка"
        statusLabel={assignmentStatusLabel(status)}
        statusTone={isCompletedLocal || isAccepted || isPaused ? "warning" : isInProgress ? "success" : "neutral"}
        title={active.assignment.routeName || "Маршрут без названия"}
      />

      <View
        accessibilityLabel={`Пройдено ${active.progress.completed} из ${active.progress.total} меток`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        style={styles.progressBlock}
      >
        <View style={styles.progressHeader}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            {active.progress.completed} из {active.progress.total} меток
          </Text>
          <Text style={[styles.percent, { color: colors.text }]}>{percent}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${percent}%` }]} />
        </View>
      </View>

      {canUsePatrolAction && !isCompletedLocal ? (
        <PrimaryButton
          icon={primaryAction.icon}
          label={primaryAction.label}
          onPress={onOpenPatrol}
          size="large"
        />
      ) : (
        <Text style={[styles.bodyText, { color: colors.mutedText }]}>
          {isCompletedLocal
            ? "Отчёт сохранён на телефоне. Он отправится автоматически при связи; статус можно посмотреть в очереди."
            : homeBlockedHint(status)}
        </Text>
      )}

      <View style={styles.actions}>
        <HomeQuickAction icon="list-outline" label="Все метки" onPress={onOpenAllPoints} />
        <HomeQuickAction icon="swap-horizontal-outline" label="Заявки" onPress={onOpenRequests} />
        {isCompletedLocal ? (
          <HomeQuickAction icon="cloud-upload-outline" label="Очередь" onPress={onOpenQueue} />
        ) : null}
      </View>
    </Card>
  );
}

function EmptyPatrolCard({
  onOpenRequests,
  summary
}: {
  onOpenRequests: () => void;
  summary: { available: number; mine: number; unsent: number };
}) {
  const { colors } = useAppTheme();

  return (
    <Card>
      <CardHeading eyebrow="Активный обход" statusLabel="Нет обхода" statusTone="neutral" title="Заявка не выбрана" />
      <View style={styles.emptyDescription}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundAccent }]}>
          <Ionicons color={colors.primary} name="shield-checkmark-outline" size={22} />
        </View>
        <Text style={[styles.bodyText, styles.emptyText, { color: colors.mutedText }]}>
          Откройте карточку заявки, проверьте маршрут и подтвердите принятие. Одним касанием из списка заявка не принимается.
        </Text>
      </View>
      <View style={styles.quickStats}>
        <SummaryStat label="Доступно" value={summary.available} />
        <SummaryStat label="Мои" value={summary.mine} />
        <SummaryStat label="Не отправлено" value={summary.unsent} />
      </View>
      <PrimaryButton icon="list-outline" label="Выбрать заявку" onPress={onOpenRequests} size="large" />
    </Card>
  );
}

function CardHeading({
  eyebrow,
  statusLabel,
  statusTone,
  title
}: {
  eyebrow: string;
  statusLabel: string;
  statusTone: "neutral" | "success" | "warning" | "danger";
  title: string;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.headerRow}>
      <View style={styles.titleBlock}>
        <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>{eyebrow}</Text>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={styles.statusSlot}>
        <StatusPill label={statusLabel} tone={statusTone} />
      </View>
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.quickStat, { backgroundColor: colors.backgroundAccent, borderColor: colors.border }]}>
      <Text style={[styles.quickStatValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.quickStatLabel, { color: colors.mutedText }]}>{label}</Text>
    </View>
  );
}

function RequestSection({
  isRefreshing,
  onOpenRequest,
  onRefresh,
  requests
}: {
  isRefreshing: boolean;
  onOpenRequest: (requestId: string) => void;
  onRefresh: () => void;
  requests: RequestBoardItem[];
}) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.requestSection}>
      <View style={styles.requestSectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Действующие заявки</Text>
        <Pressable
          accessibilityLabel="Обновить список заявок"
          accessibilityRole="button"
          accessibilityState={{ busy: isRefreshing, disabled: isRefreshing }}
          disabled={isRefreshing}
          hitSlop={8}
          onPress={onRefresh}
          style={({ pressed }) => [styles.refreshButton, pressed ? styles.pressed : null]}
        >
          <Ionicons color={isRefreshing ? colors.mutedText : colors.primary} name="refresh-outline" size={17} />
          <Text style={[styles.link, { color: isRefreshing ? colors.mutedText : colors.primary }]}>
            {isRefreshing ? "Обновляем..." : "Обновить"}
          </Text>
        </Pressable>
      </View>

      {requests.length > 0 ? requests.map((request) => (
        <Pressable
          accessibilityHint="Открыть и проверить заявку"
          accessibilityLabel={`${request.routeName}. ${requestStatusLabel(request.status)}`}
          accessibilityRole="button"
          key={request.requestId}
          onPress={() => onOpenRequest(request.requestId)}
          style={({ pressed }) => pressed ? styles.requestPressed : null}
        >
          <RequestCard request={request} />
        </Pressable>
      )) : (
        <Card style={styles.requestCard}>
          <View style={styles.emptyRequestRow}>
            <Ionicons color={colors.mutedText} name="file-tray-outline" size={21} />
            <View style={styles.emptyRequestText}>
              <Text style={[styles.requestTitle, { color: colors.text }]}>Заявок нет</Text>
              <Text style={[styles.bodyText, { color: colors.mutedText }]}>
                Новые заявки появятся после push-сигнала или обновления данных.
              </Text>
            </View>
          </View>
        </Card>
      )}
    </View>
  );
}

function RequestCard({ request }: { request: RequestBoardItem }) {
  const { colors } = useAppTheme();

  return (
    <Card style={styles.requestCard}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.requestTitle, { color: colors.text }]}>{request.routeName}</Text>
          <Text style={[styles.requestMeta, { color: colors.mutedText }]}>
            {request.assignedFullName ?? "Свободная заявка"}
          </Text>
          <Text style={[styles.requestMeta, { color: colors.mutedText }]}>План: {formatDateTime(request.plannedStartAt)}</Text>
        </View>
        <View style={styles.statusSlot}>
          <StatusPill
            label={requestStatusLabel(request.status)}
            tone={request.status === "accepted" ? "warning" : "success"}
          />
        </View>
      </View>
    </Card>
  );
}

function DashboardMessage({ message }: { message: string }) {
  const { colors } = useAppTheme();

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.message, { backgroundColor: colors.backgroundAccent, borderColor: colors.border }]}
    >
      <Ionicons color={colors.primary} name="information-circle-outline" size={18} />
      <Text style={[styles.messageText, { color: colors.mutedText }]}>{message}</Text>
    </View>
  );
}

function HomeQuickAction({
  icon,
  label,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { borderColor: colors.border, backgroundColor: colors.card },
        pressed ? styles.pressed : null
      ]}
    >
      <Ionicons color={colors.primary} name={icon} size={18} />
      <Text style={[styles.quickActionText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function progressPercent(progress: AssignmentProgress) {
  return progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
}

function assignmentStatusLabel(status: ActiveAssignment["status"]) {
  switch (status) {
    case "accepted":
      return "Принята";
    case "inProgress":
      return "В работе";
    case "paused":
      return "Пауза";
    case "completedLocal":
      return "Ожидает отправки";
    case "completedServer":
      return "Отправлено";
    case "syncError":
      return "Ошибка отправки";
    case "authRequired":
      return "Нужно войти";
    case "needsDispatcherDecision":
      return "Решение диспетчера";
    case "cancelledServer":
      return "Отменена";
    default:
      return "Обход";
  }
}

function requestStatusLabel(status: RequestBoardItem["status"]) {
  if (status === "accepted") {
    return "Принята";
  }
  if (status === "assigned") {
    return "Назначена";
  }
  return "Доступна";
}

function getPrimaryAction(status: ActiveAssignment["status"] | undefined) {
  if (status === "accepted" || status === "paused") {
    return {
      icon: "play-outline" as const,
      label: status === "paused" ? "Продолжить обход" : "Начать обход",
      path: (assignmentId: string) => `/patrol/assignment/${assignmentId}`
    };
  }

  return {
    icon: "scan-outline" as const,
    label: "Сканировать NFC",
    path: (assignmentId: string) => `/patrol/assignment/${assignmentId}/scan-nfc`
  };
}

function homeBlockedHint(status: ActiveAssignment["status"]) {
  if (status === "cancelledServer" || status === "cancelled") {
    return "Заявка отменена диспетчером. Действия по меткам заблокированы.";
  }
  if (status === "authRequired") {
    return "Сессия требует входа. Отчет и локальные действия сохранены в очереди.";
  }
  if (status === "needsDispatcherDecision" || status === "conflict") {
    return "Нужно решение диспетчера. Откройте карточку обхода и очередь синхронизации.";
  }
  if (status === "syncError") {
    return "Отправка остановлена из-за ошибки. Данные сохранены, повтор доступен в очереди.";
  }
  return "Действия по обходу временно недоступны. Проверьте статус и синхронизацию.";
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 21
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28
  },
  emptyDescription: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 11
  },
  emptyIcon: {
    alignItems: "center",
    borderRadius: 10,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  emptyRequestRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  emptyRequestText: {
    flex: 1,
    gap: 4
  },
  emptyText: {
    flex: 1
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between"
  },
  link: {
    fontSize: 14,
    fontWeight: "800"
  },
  message: {
    alignItems: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 11
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18
  },
  percent: {
    fontSize: 18,
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.72
  },
  progressBlock: {
    gap: 8
  },
  progressFill: {
    borderRadius: 999,
    height: 10
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  progressTrack: {
    borderRadius: 999,
    height: 10,
    overflow: "hidden"
  },
  quickAction: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 13,
    paddingVertical: 9
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: "900"
  },
  quickStat: {
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: 96,
    flexGrow: 1,
    gap: 2,
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  quickStatLabel: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14
  },
  quickStatValue: {
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 24
  },
  quickStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  refreshButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 4
  },
  requestCard: {
    padding: 14
  },
  requestMeta: {
    fontSize: 13,
    lineHeight: 18
  },
  requestPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.995 }]
  },
  requestSection: {
    gap: 10
  },
  requestSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  requestTitle: {
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800"
  },
  sectionTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "900"
  },
  statusSlot: {
    flexShrink: 1,
    maxWidth: "100%"
  },
  titleBlock: {
    flexGrow: 1,
    flexShrink: 1,
    gap: 5,
    minWidth: 190
  }
});
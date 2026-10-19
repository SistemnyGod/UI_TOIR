import type { ActiveAssignment, AssignmentProgress } from "@/db/repositories/patrolRepository";

type AssignmentStatus = ActiveAssignment["status"];

const blockedStatuses: readonly string[] = ["needsDispatcherDecision", "cancelledServer", "authRequired", "syncError", "conflict", "releasePending"];

/** Which parts of the active patrol screen apply to the patrol's status and progress. */
export function describeActivePatrol(status: AssignmentStatus, progress: AssignmentProgress) {
  return {
    isAccepted: status === "accepted",
    isPaused: status === "paused",
    isInProgress: status === "inProgress",
    isCompletedLocal: status === "completedLocal",
    isCompletedServer: status === "completedServer",
    isBlocked: blockedStatuses.includes(status),
    isReadyForReview: progress.total > 0 && progress.completed >= progress.total
  };
}

export type ActivePatrolView = ReturnType<typeof describeActivePatrol>;

/** The large bottom action while the patrol is in progress: review, scan or list the points. */
export function primaryPatrolAction(assignmentId: string, progress: AssignmentProgress, nfcEnabled: boolean) {
  const isReadyForReview = progress.total > 0 && progress.completed >= progress.total;
  return {
    icon: isReadyForReview ? "document-text-outline" as const : nfcEnabled ? "scan-outline" as const : "list-outline" as const,
    label: progress.total === 0
      ? "Загружаем метки маршрута"
      : isReadyForReview
        ? "Отправить отчёт"
        : nfcEnabled
          ? "Сканировать NFC"
          : "Открыть все метки",
    path: isReadyForReview
      ? `/patrol/assignment/${assignmentId}/submit`
      : nfcEnabled
        ? `/patrol/assignment/${assignmentId}/scan-nfc`
        : `/patrol/assignment/${assignmentId}/all-points`
  };
}

export function progressPercent(progress: AssignmentProgress) {
  return progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
}

export function assignmentStatusLabel(status: AssignmentStatus) {
  switch (status) {
    case "accepted":
      return "Принята";
    case "inProgress":
      return "В работе";
    case "paused":
      return "Пауза";
    case "completedLocal":
      return "Ждет отправки";
    case "completedServer":
      return "Отправлено";
    case "needsDispatcherDecision":
      return "Решение";
    case "cancelledServer":
      return "Отменена";
    case "authRequired":
      return "Нужен вход";
    case "syncError":
    case "conflict":
      return "Ошибка";
    default:
      return "Обход";
  }
}

export function assignmentStatusTone(status: AssignmentStatus) {
  if (status === "inProgress" || status === "completedServer") {
    return "success";
  }
  if (status === "syncError" || status === "authRequired" || status === "cancelledServer" || status === "conflict") {
    return "danger";
  }
  if (status === "accepted" || status === "paused" || status === "completedLocal" || status === "needsDispatcherDecision") {
    return "warning";
  }
  return "neutral";
}

export function nextStepText(status: AssignmentStatus, progress: AssignmentProgress) {
  if (status === "accepted") {
    return "Нажмите \"Начать обход\", когда готовы идти по маршруту.";
  }
  if (status === "paused") {
    return "Нажмите \"Продолжить обход\", чтобы вернуться к меткам.";
  }
  if (status === "completedLocal") {
    return "Отчёт сохранён после ручного подтверждения. Если сети нет, он будет доставлен после подключения.";
  }
  if (status === "completedServer") {
    return "Отчет принят сервером. Можно выбрать новую заявку.";
  }
  if (status === "needsDispatcherDecision") {
    return "Данные сохранены. Дождитесь решения диспетчера или откройте очередь.";
  }
  if (status === "authRequired") {
    return "Нужно войти снова. Локальные данные и отчет не удалены.";
  }
  if (status === "syncError" || status === "conflict") {
    return "Откройте очередь отправки и повторите синхронизацию.";
  }
  if (status === "cancelledServer") {
    return "Заявка отменена. Выполнять обход по ней не нужно.";
  }
  if (progress.completed >= progress.total && progress.total > 0) {
    return "Все метки заполнены. Проверьте отчет и нажмите \"Отправить отчет\".";
  }
  return "Сканируйте следующую метку через NFC или откройте список всех меток.";
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

import type { Ionicons } from "@expo/vector-icons";

import type { SyncQueueFileItem } from "@/db/repositories/filesRepository";
import type { SyncQueueCommandItem } from "@/db/repositories/outboxRepository";
import type { ThemeColors } from "@/ui/atomTheme";
import { softShadow } from "@/ui/typography";

export type CommandResolution = "serverWins" | "dispatcher" | "retryRevision" | "cancelRejected" | "continueSwitch";
export type DestructiveResolution = Extract<CommandResolution, "serverWins" | "cancelRejected">;
export type QueueTone = "success" | "warning" | "danger";

export function confirmationTitle(action: DestructiveResolution) {
  return action === "serverWins" ? "Принять состояние сервера?" : "Отменить локальное действие?";
}

export function confirmationMessage(command: Pick<SyncQueueCommandItem, "commandType" | "assignmentRouteName">, action: DestructiveResolution) {
  const subject = `«${commandTitle(command)}»${command.assignmentRouteName ? ` (${command.assignmentRouteName})` : ""}`;
  if (action === "serverWins") {
    return `Телефон заменит локальное состояние данными сервера. Действие ${subject} не будет отправлено, а локальные изменения по этому обходу, которых нет на сервере, будут потеряны.`;
  }
  return `Действие ${subject} не будет отправлено на сервер и уйдёт из очереди. Вернуть его в очередь будет нельзя. Запись останется в журнале действий.`;
}

export function commandSubject(command: SyncQueueCommandItem) {
  if (command.assignmentRouteName) return command.assignmentRouteName;
  switch (command.entityType) {
    case "workTask":
      return "Работа ЭМУ";
    case "shiftRemark":
      return "Замечание по смене";
    case "patrolPoint":
      return "Точка обхода";
    default:
      return "Обход";
  }
}

export function fileSubject(file: SyncQueueFileItem) {
  if (file.assignmentRouteName) return file.pointName ? `${file.assignmentRouteName} · ${file.pointName}` : file.assignmentRouteName;
  if (file.workTaskId) return "Вложение к работе";
  if (file.remarkId) return "Вложение к замечанию";
  return "Вложение к отчёту";
}

/** Each queue entry is its own card; entries that need a decision get a danger outline. */
export function queueCardStyle(colors: Partial<ThemeColors>, tone: QueueTone) {
  return [{ backgroundColor: colors.card, borderColor: tone === "danger" ? colors.danger : colors.cardBorder }, softShadow(colors.shadow ?? "transparent", 1)];
}

export function commandIcon(commandType: string): keyof typeof Ionicons.glyphMap {
  if (commandType === "completePatrolAssignment") return "document-text-outline";
  if (commandType === "switchPatrolAssignment") return "swap-horizontal-outline";
  if (/Point|Photo/.test(commandType)) return "location-outline";
  if (/WorkTask|PlannedWork/.test(commandType)) return "construct-outline";
  if (/Remark|Appeal/.test(commandType)) return "chatbubble-ellipses-outline";
  return "map-outline";
}

export function warningBox(colors: Partial<ThemeColors>) {
  return { backgroundColor: colors.warningSurface, borderColor: colors.warning, color: colors.warning };
}

export function dangerBox(colors: Partial<ThemeColors>) {
  return { backgroundColor: colors.dangerSurface, borderColor: colors.danger, color: colors.danger };
}

export function buildQueueSummary(commands: SyncQueueCommandItem[], files: SyncQueueFileItem[]) {
  const errors =
    commands.filter((command) => command.status === "conflict" || command.status === "rejected" || command.status === "invalidPayload").length +
    files.filter((file) => file.status === "failed").length;
  return { errors };
}

const retryableCommandStatuses = new Set(["pending", "sending", "retryLater", "waiting_network"]);

export function countRetryable(commands: SyncQueueCommandItem[], files: SyncQueueFileItem[]) {
  return commands.filter((command) => retryableCommandStatuses.has(command.status)).length
    + files.filter((file) => file.status !== "failed").length;
}

export function commandTitle(command: Pick<SyncQueueCommandItem, "commandType">) {
  switch (command.commandType) {
    case "completePatrolAssignment":
      return "Отчет обхода";
    case "takePatrolRequest":
      return "Принятие заявки";
    case "acceptPatrolRequest":
      return "Заявка принята";
    case "releasePatrolRequest":
      return "Возврат заявки";
    case "startPatrolAssignment":
      return "Начало обхода";
    case "pausePatrolAssignment":
      return "Пауза обхода";
    case "resumePatrolAssignment":
      return "Продолжение обхода";
    case "handoffPatrolAssignment":
      return "Передача диспетчеру";
    case "transferPatrolAssignment":
      return "Передача обхода коллеге";
    case "markPatrolPointOk":
      return "Метка исправна";
    case "markPatrolPointIssue":
      return "Метка неисправна";
    case "scanPatrolPointNfc":
      return "Сканирование NFC";
    case "scanPatrolPointQr":
      return "Сканирование QR";
    case "createShiftRemark":
      return "Замечание по смене";
    case "attachShiftRemarkMedia":
      return "Вложение замечания";
    case "switchPatrolAssignment":
      return "Переход на другой обход";
    case "createPatrolAppeal":
      return "Обращение";
    case "uploadPatrolPhoto":
      return "Фото точки";
    case "createWorkTask":
      return "Новая работа";
    case "updateWorkTask":
      return "Изменение работы";
    case "pauseWorkTask":
      return "Приостановка работы";
    case "resumeWorkTask":
      return "Продолжение работы";
    case "completeWorkTask":
      return "Завершение работы";
    case "startPlannedWork":
      return "Начало плановой работы";
    case "joinWorkTask":
      return "Участие в работе";
    case "replaceWorkTaskParticipant":
      return "Замена участника работы";
    default:
      return "Операция синхронизации";
  }
}

export function commandActionLabel(status: string) {
  switch (status) {
    case "conflict":
      return "Выбрать решение";
    case "rejected":
      return "Отменить локально";
    case "invalidPayload":
      return "Исправить данные";
    case "pending":
    case "sending":
    case "retryLater":
      return "Повторить отправку";
    default:
      return "-";
  }
}

export function statusLabel(status: string, resolutionStatus: string | null = null) {
  if (status === "conflict" && resolutionStatus === "dispatcher") {
    return "Ожидает диспетчера";
  }

  if (resolutionStatus === "resolvedServerWins") {
    return "Принято состояние сервера";
  }
  if (resolutionStatus === "cancelledLocal") {
    return "Отменено локально";
  }
  if (resolutionStatus === "retryRequested") {
    return "Автоповтор запланирован";
  }

  switch (status) {
    case "pending":
      return "Локально сохранено";
    case "sending":
      return "Отправляется";
    case "retryLater":
      return "Повтор позже";
    case "accepted":
    case "duplicate":
      return "Принято сервером";
    case "conflict":
      return "Конфликт";
    case "rejected":
      return "Отклонено";
    case "invalidPayload":
      return "Повреждённые данные";
    case "waiting_network":
      return "Ждёт сети";
    case "waiting_auth":
      return "Нужен вход";
    case "wrong_contour":
      return "Другой сервер";
    case "blocked":
      return "Ждёт предыдущих действий";
    default:
      return "Ожидает отправки";
  }
}

export function fileStatusLabel(status: string) {
  switch (status) {
    case "queued":
    case "localOnly":
      return "Ждёт загрузки";
    case "uploading":
      return "Загружается";
    case "retryLater":
      return "Повтор позже";
    case "uploaded":
    case "linked":
      return "Загружено";
    case "duplicate":
      return "Уже загружено";
    case "failed":
      return "Ошибка загрузки";
    default:
      return statusLabel(status);
  }
}

export function statusTone(status: string, resolutionStatus: string | null = null): QueueTone {
  if (status === "accepted" || status === "duplicate" || status === "uploaded" || status === "linked") {
    return "success";
  }

  if (status === "conflict" && resolutionStatus === "dispatcher") {
    return "warning";
  }

  if (resolutionStatus === "resolvedServerWins" || resolutionStatus === "cancelledLocal") {
    return "success";
  }
  if (resolutionStatus === "retryRequested") {
    return "warning";
  }

  if (status === "conflict" || status === "rejected" || status === "invalidPayload" || status === "failed") {
    return "danger";
  }

  return "warning";
}

// One formatter for the whole list instead of one per timestamp per render.
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit"
});

export function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateTimeFormat.format(new Date(value));
}

export function syncResultMessage(skipped: "offline" | "serverUnavailable" | "unauthenticated" | "wrongContour" | "failed" | null) {
  switch (skipped) {
    case "offline":
      return "Нет подключения. Очередь сохранена и повторится автоматически после появления сети.";
    case "serverUnavailable":
      return "Сервер временно недоступен. Следующая попытка уже запланирована.";
    case "unauthenticated":
      return "Нужно войти повторно. Данные сохранены на телефоне.";
    case "failed":
      return "Отправка прервалась. Данные не потеряны — повтор можно запустить еще раз.";
    default:
      return "Проверка завершена. Список обновлен по подтверждениям сервера.";
  }
}

import { isReauthenticationRequiredError } from "../../auth/sessionErrors.ts";
import type { ReportDeliveryState } from "../../domain/reporting/reportDeliveryState.ts";

export type ReportDeliveryStatus =
  | "pending"
  | "sending"
  | "accepted"
  | "duplicate"
  | "retryLater"
  | "rejected"
  | "conflict"
  | "waiting_auth"
  | "waiting_network"
  | "wrong_contour"
  | "blocked"
  | "superseded"
  | "cancelled"
  | "invalidPayload";

export type ReportDeliveryAction = "submit" | "retry" | "repair" | "signIn" | "serverSettings" | "done" | "wait";

type ReportPresentationInput = ReportDeliveryState | ReportDeliveryStatus | null;

export function getReportDeliveryPresentation(input: ReportPresentationInput, legacyLastError: string | null = null) {
  const delivery = typeof input === "string" || input === null
    ? fromLegacyStatus(input, legacyLastError)
    : input;

  switch (delivery.status) {
    case "notQueued":
      return neutral("submit", "Завершить обход и отправить", "Готов к отправке", "Сначала отчёт сохранится на телефоне, затем приложение отправит его на сервер.");
    case "delivered":
      return success("done", "К списку обходов", "Отчёт доставлен", "Сервер подтвердил получение. Повторная отправка не требуется.");
    case "sending":
      return neutral("wait", "Отправка уже выполняется", "Идёт отправка", "Подождите завершения текущей попытки. Второй запрос не будет создан.");
    case "waitingAuth":
      return warning("signIn", "Войти и продолжить отправку", "Требуется вход", "Отчёт сохранён на телефоне. После входа отправка продолжится без повторного заполнения.");
    case "waitingNetwork":
      return warning("retry", "Проверить отправку", "Отчёт сохранён на телефоне", "Очередь доставит его после подключения к серверу.");
    case "retryScheduled":
      return warning("retry", "Проверить отправку", "Отчёт сохранён, восстанавливаем отправку", delivery.lastError ?? "Очередь продолжит доставку после появления сети.");
    case "wrongContour":
      return danger("serverSettings", "Проверить настройки сервера", "Подключён сервер другого контура", delivery.lastError ?? "Проверьте настройки сервера перед повторной отправкой.");
    case "conflict":
      return danger("repair", "Проверить конфликт", "Отправка отчёта остановлена", "Команда одной из точек конфликтует с состоянием сервера. Проверьте конфликт перед повторной отправкой.");
    case "repairRequired":
      return danger("repair", "Исправить отчёт", "Отчёт требует исправления", delivery.lastError ?? "Одна из сохранённых операций повреждена. Автоматическая отправка не продолжится до исправления данных.");
    case "blockedByDependency":
      return danger("repair", "Проверить блокирующую операцию", "Отправка отчёта остановлена", delivery.lastError ?? "Более ранняя операция этого обхода требует обработки.");
    case "queued":
      return warning("retry", "Проверить отправку", "Отчёт сохранён", "Отчёт сохранён на телефоне и ожидает отправки.");
  }
}

function fromLegacyStatus(status: ReportDeliveryStatus | null, lastError: string | null): ReportDeliveryState {
  if (!status || status === "superseded" || status === "cancelled") return { status: "notQueued" };
  if (status === "accepted" || status === "duplicate") return { status: "delivered", clientOperationId: "legacy", deliveredAt: null };
  if (status === "sending") return { status: "sending", clientOperationId: "legacy" };
  if (status === "waiting_auth" || isAuthenticationError(lastError)) return { status: "waitingAuth", clientOperationId: "legacy", lastError };
  if (status === "waiting_network") return { status: "waitingNetwork", clientOperationId: "legacy", lastError };
  if (status === "retryLater") return { status: "retryScheduled", clientOperationId: "legacy", nextAttemptAt: null, lastError };
  if (status === "wrong_contour") return { status: "wrongContour", blockingOperationId: "legacy", lastError };
  if (status === "blocked") return { status: "blockedByDependency", blockingOperationId: "legacy", blockingCommandType: "unknown", blockingStatus: status, lastError };
  if (status === "rejected" || status === "invalidPayload") return { status: "repairRequired", blockingOperationId: "legacy", blockingCommandType: "unknown", lastError };
  if (status === "conflict") return { status: "conflict", blockingOperationId: "legacy", blockingCommandType: "unknown", lastError };
  return { status: "queued", clientOperationId: "legacy" };
}

function neutral(action: ReportDeliveryAction, buttonLabel: string, title: string, detail: string) {
  return { action, buttonLabel, title, detail, tone: "neutral" as const };
}

function success(action: ReportDeliveryAction, buttonLabel: string, title: string, detail: string) {
  return { action, buttonLabel, title, detail, tone: "success" as const };
}

function warning(action: ReportDeliveryAction, buttonLabel: string, title: string, detail: string) {
  return { action, buttonLabel, title, detail, tone: "warning" as const };
}

function danger(action: ReportDeliveryAction, buttonLabel: string, title: string, detail: string) {
  return { action, buttonLabel, title, detail, tone: "danger" as const };
}

export function isAuthenticationError(message: string | null) {
  return isReauthenticationRequiredError(message);
}
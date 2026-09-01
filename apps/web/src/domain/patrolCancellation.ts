import type { AssignmentCancellationReasonCode } from "../types";

const cancellationReasonLabels: Record<string, string> = {
  urgent_work: "Ушел на другую срочную работу",
  ppr: "ППР",
  employee_absent: "Сотрудник отсутствует",
  route_unavailable: "Маршрут временно недоступен",
  duplicate: "Заявка создана повторно",
  created_by_error: "Ошибка при создании",
  other: "Прочее",
  legacy_unknown: "Причина не указана — историческая запись",
};

export function cancellationReasonLabel(code?: string | null, text?: string | null) {
  if (text?.trim()) return text.trim();
  return cancellationReasonLabels[code ?? ""] ?? "Причина не указана";
}

export function isCancellationReasonCode(value: string): value is AssignmentCancellationReasonCode {
  return value in cancellationReasonLabels && value !== "legacy_unknown";
}

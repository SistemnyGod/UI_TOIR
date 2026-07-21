import { isReauthenticationRequiredError } from "../../auth/sessionErrors.ts";

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
  | "superseded";

export type ReportDeliveryAction = "submit" | "retry" | "repair" | "resubmit" | "signIn" | "serverSettings" | "done";

export function getReportDeliveryPresentation(status: ReportDeliveryStatus | null, lastError: string | null) {
  if (!status || status === "superseded") {
    return {
      action: "submit" as const,
      buttonLabel: "Завершить обход и отправить",
      detail: "Сначала отчет сохранится на телефоне, затем приложение отправит его на сервер.",
      title: "Готов к отправке",
      tone: "neutral" as const
    };
  }

  if (status === "accepted" || status === "duplicate") {
    return {
      action: "done" as const,
      buttonLabel: "К списку обходов",
      detail: "Сервер подтвердил получение. Повторная отправка не требуется.",
      title: "Отчет доставлен",
      tone: "success" as const
    };
  }

  if (status === "sending") {
    return {
      action: "retry" as const,
      buttonLabel: "Проверить и повторить",
      detail: "Если отправка зависла или ответ потерялся, повтор пройдет с тем же номером операции без дубля.",
      title: "Идет отправка",
      tone: "neutral" as const
    };
  }

  if (status === "rejected" || status === "conflict") {
    return {
      action: status === "rejected" ? "resubmit" as const : "repair" as const,
      buttonLabel: status === "rejected" ? "Отправить исправленный отчет" : "Проверить конфликт",
      detail: lastError || "Сервер не принял данные. Проверьте точки обхода и отправьте исправленный отчет.",
      title: status === "conflict" ? "Нужна проверка данных" : "Отчет не принят",
      tone: "danger" as const
    };
  }

  if (status === "wrong_contour" || status === "blocked") {
    return {
      action: "serverSettings" as const,
      buttonLabel: "Проверить настройки сервера",
      detail: lastError || "Отправка заблокирована до подтверждения целевого серверного контура.",
      title: "Отправка заблокирована",
      tone: "danger" as const
    };

  }
  if (status === "waiting_auth" || isAuthenticationError(lastError)) {
    return {
      action: "signIn" as const,
      buttonLabel: "Войти и продолжить отправку",
      detail: "Отчет сохранен на телефоне. После входа отправка продолжится без повторного заполнения.",
      title: "Требуется вход",
      tone: "warning" as const
    };
  }

  return {
    action: "retry" as const,
    buttonLabel: "Повторить отправку сейчас",
    detail: lastError || "Отчет сохранен на телефоне и будет отправлен автоматически после восстановления связи.",
    title: status === "pending" ? "Отчет сохранен" : "Отправка отложена",
    tone: "warning" as const
  };
}

export function isAuthenticationError(message: string | null) {
  return isReauthenticationRequiredError(message);
}

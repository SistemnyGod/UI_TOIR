import { SyncConflict } from "@/domain/sync/syncTypes";

export function getConflictUserMessage(conflict: SyncConflict) {
  if (conflict.reason.includes("route")) {
    return "Маршрут изменился. Отчет сохранен на телефоне и ожидает решения оператора.";
  }

  if (conflict.reason.includes("request")) {
    return "Заявка изменилась. Данные не удалены и ожидают проверки.";
  }

  return "Нужно решение оператора. Данные сохранены на телефоне.";
}

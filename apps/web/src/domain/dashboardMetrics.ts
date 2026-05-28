import type { ActivePatrol, Metric, RouteDirectoryItem, ServiceRequest } from "../types";

export function buildLocalDashboardMetrics({
  activePatrols,
  requests,
  routeDirectory,
}: {
  activePatrols: ActivePatrol[];
  requests: ServiceRequest[];
  routeDirectory: RouteDirectoryItem[];
}): Metric[] {
  const assignedRequestIds = new Set(activePatrols.map((patrol) => patrol.patrolRequestId).filter(Boolean));
  const assignedToday = requests.filter((request) => request.status !== "Закрыта" && !assignedRequestIds.has(request.id)).length;

  return [
    {
      label: "Завершенные обходы сегодня",
      value: "0",
      delta: "живых результатов пока нет",
      tone: "green",
      icon: "✓",
    },
    {
      label: "Активные обходы сейчас",
      value: String(activePatrols.length),
      delta: activePatrols.length > 0 ? "созданы из заявок" : "нет активных обходов",
      tone: "blue",
      icon: "↻",
    },
    {
      label: "Заявки на обход",
      value: String(assignedToday),
      delta: "ожидают прохождения",
      tone: "orange",
      icon: "!",
    },
    {
      label: "Маршрутов в справочнике",
      value: String(routeDirectory.length),
      delta: "по текущим данным",
      tone: "violet",
      icon: "⌖",
    },
  ];
}

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
  const waitingRequests = requests.filter((request) => !isClosedRequest(request.status) && !assignedRequestIds.has(request.id)).length;
  const activeRoutes = routeDirectory.filter((route) => !isArchivedRoute(route.status)).length;

  return [
    {
      label: "Завершено обходов сегодня",
      value: "0",
      delta: "живых результатов пока нет",
      tone: "green",
      icon: "check",
    },
    {
      label: "Активные обходы сейчас",
      value: String(activePatrols.length),
      delta: activePatrols.length > 0 ? "созданы из заявок" : "нет активных обходов",
      tone: "blue",
      icon: "run",
    },
    {
      label: "Заявки на обход",
      value: String(waitingRequests),
      delta: "ожидают назначения",
      tone: "orange",
      icon: "request",
    },
    {
      label: "Маршрутов в справочнике",
      value: String(activeRoutes),
      delta: "по текущим данным",
      tone: "violet",
      icon: "map",
    },
  ];
}

function isClosedRequest(status: string) {
  return status.toLocaleLowerCase("ru-RU").includes("закрыт") || status.toLocaleLowerCase("ru-RU").includes("closed");
}

function isArchivedRoute(status: string) {
  return status.toLocaleLowerCase("ru-RU").includes("архив") || status.toLocaleLowerCase("ru-RU").includes("archive");
}

export const terminalPointStatuses = new Set(["ok", "issue", "skipped"] as const);

export type TerminalPointStatus = "ok" | "issue" | "skipped";

export type RequiredPointReadinessInput = {
  pointId: string;
  pointName: string;
  orderIndex: number;
  required: boolean;
  status: string | null | undefined;
};

export type RequiredPointReadinessProblem = {
  pointId: string;
  pointName: string;
  orderIndex: number;
  reason: string;
};

export function isTerminalPointStatus(status: string | null | undefined): status is TerminalPointStatus {
  return status !== null && status !== undefined && terminalPointStatuses.has(status as TerminalPointStatus);
}

function getRequiredPointProblemReason(status: string | null | undefined) {
  switch (status) {
    case "scanned":
      return "Обязательная метка просканирована, но результат не заполнен.";
    case "deferred":
      return "Обязательная метка отложена.";
    case "pending":
    case null:
    case undefined:
      return "Обязательная метка не заполнена.";
    default:
      return "Обязательная метка имеет неизвестный статус результата.";
  }
}

export function evaluateRequiredPointReadiness(points: readonly RequiredPointReadinessInput[]) {
  const requiredPoints = points.filter((point) => point.required);
  const terminalRequiredPoints = requiredPoints.filter((point) => isTerminalPointStatus(point.status));
  const problems: RequiredPointReadinessProblem[] = requiredPoints
    .filter((point) => !isTerminalPointStatus(point.status))
    .map((point) => ({
      pointId: point.pointId,
      pointName: point.pointName,
      orderIndex: point.orderIndex,
      reason: getRequiredPointProblemReason(point.status)
    }));

  return {
    requiredCount: requiredPoints.length,
    terminalRequiredCount: terminalRequiredPoints.length,
    problems,
    ready: requiredPoints.length === terminalRequiredPoints.length
  };
}

export function evaluateReportPointReadiness(points: readonly RequiredPointReadinessInput[]) {
  const terminalPoints = points.filter((point) => isTerminalPointStatus(point.status));
  const problems: RequiredPointReadinessProblem[] = points
    .filter((point) => !isTerminalPointStatus(point.status))
    .map((point) => ({
      pointId: point.pointId,
      pointName: point.pointName,
      orderIndex: point.orderIndex,
      reason: getRequiredPointProblemReason(point.status)
    }));

  return {
    totalCount: points.length,
    terminalCount: terminalPoints.length,
    problems,
    ready: points.length > 0 && points.length === terminalPoints.length
  };
}
export function canCreateCompletionCommand(assignmentExists: boolean, readinessReady: boolean) {
  return assignmentExists && readinessReady;
}

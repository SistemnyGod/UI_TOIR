export type CompletionPayloadValidation =
  | { valid: true }
  | { valid: false; message: string };

const terminalStatuses = new Set(["ok", "issue", "skipped"]);

export function validatePatrolCompletionPayload(payload: Record<string, unknown>): CompletionPayloadValidation {
  const assignmentId = payload.assignmentId;
  if (typeof assignmentId !== "string" || assignmentId.trim().length === 0) {
    return invalid("В отчёте отсутствует назначение.");
  }

  const summary = isRecord(payload.summary) ? payload.summary : null;
  const totalPoints = summary?.totalPoints;
  const completedPoints = summary?.completedPoints;
  if (!Number.isInteger(totalPoints) || (totalPoints as number) <= 0) {
    return invalid("В отчёте отсутствуют точки маршрута.");
  }
  if (!Number.isInteger(completedPoints) || completedPoints !== totalPoints) {
    return invalid("Не все точки маршрута заполнены.");
  }

  if (!Array.isArray(payload.pointResults) || payload.pointResults.length !== totalPoints) {
    return invalid("Количество результатов не совпадает с количеством точек маршрута.");
  }

  const pointIds = new Set<string>();
  for (const value of payload.pointResults) {
    if (!isRecord(value) || typeof value.pointId !== "string" || value.pointId.trim().length === 0) {
      return invalid("Один из результатов точки повреждён.");
    }
    if (typeof value.status !== "string" || !terminalStatuses.has(value.status)) {
      return invalid("Один из результатов точки не завершён.");
    }
    if (pointIds.has(value.pointId)) {
      return invalid("В отчёте найдены повторяющиеся результаты точек.");
    }
    pointIds.add(value.pointId);
  }

  return { valid: true };
}

function invalid(message: string): CompletionPayloadValidation {
  return { valid: false, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

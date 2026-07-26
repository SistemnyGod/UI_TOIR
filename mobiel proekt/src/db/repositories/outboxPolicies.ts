import { OutboxResponse } from "@/domain/sync/syncTypes";

export function extractCompletionFileIds(payloadJson: string) {
  try {
    const payload = JSON.parse(payloadJson) as { pointResults?: { photoClientFileIds?: unknown }[] };
    return Array.from(new Set(
      (payload.pointResults ?? []).flatMap((point) =>
        Array.isArray(point.photoClientFileIds)
          ? point.photoClientFileIds.filter((value): value is string => typeof value === "string")
          : []
      )
    ));
  } catch {
    return [];
  }
}

export function extractAssignmentId(payloadJson: string) {
  try {
    const payload = JSON.parse(payloadJson) as { assignmentId?: unknown };
    return typeof payload.assignmentId === "string" && payload.assignmentId.trim()
      ? payload.assignmentId
      : null;
  } catch {
    return null;
  }
}

export function isProblemResponse(status: OutboxResponse["status"]) {
  return status === "conflict" || status === "rejected" || status === "retryLater";
}

export function isCancelledCompletionResponse(response: OutboxResponse) {
  return (
    (response.status === "accepted" || response.status === "duplicate")
    && response.message.toLowerCase().includes("dispatcher cancellation")
  );
}


export type PatrolPointConflictIdentity = {
  assignmentId: string;
  pointId: string;
};

export function parsePatrolPointConflictIdentity(
  payloadJson: string,
  entityLocalId: string | null
): PatrolPointConflictIdentity {
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error("\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 payload \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442\u0430 \u0442\u043e\u0447\u043a\u0438.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 payload \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442\u0430 \u0442\u043e\u0447\u043a\u0438.");
  }

  const record = payload as Record<string, unknown>;
  const assignmentId = typeof record.assignmentId === "string" ? record.assignmentId.trim() : "";
  const pointId = typeof record.pointId === "string" ? record.pointId.trim() : "";
  if (!assignmentId) {
    throw new Error("\u0412 payload \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442\u0430 \u0442\u043e\u0447\u043a\u0438 \u043e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 assignmentId.");
  }
  if (!pointId) {
    throw new Error("\u0412 payload \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442\u0430 \u0442\u043e\u0447\u043a\u0438 \u043e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 pointId.");
  }
  if (entityLocalId && pointId !== entityLocalId) {
    throw new Error("pointId \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442\u0430 \u0442\u043e\u0447\u043a\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442 \u0441 entityLocalId.");
  }

  return { assignmentId, pointId };
}

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

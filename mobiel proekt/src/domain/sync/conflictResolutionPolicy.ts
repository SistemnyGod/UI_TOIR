import { OutboxCommandStatus } from "@/domain/sync/syncTypes";

export type ConflictServerSnapshot = {
  assignmentId: string | null;
  requestId: string | null;
  assignmentStatus: string | null;
  requestStatus: string | null;
  revision: number | null;
  startedAtLocal: string | null;
  completedAtLocal: string | null;
};

export type ConflictResolutionTransition = {
  commandStatus: Extract<OutboxCommandStatus, "superseded" | "cancelled">;
  conflictStatus: "resolved";
  resolutionStatus: "resolvedServerWins" | "cancelledLocal" | "retryRequested";
  localState: ConflictServerSnapshot | null;
};

export function applyServerWinsTransition(snapshot: ConflictServerSnapshot): ConflictResolutionTransition {
  return {
    commandStatus: "superseded",
    conflictStatus: "resolved",
    resolutionStatus: "resolvedServerWins",
    localState: snapshot
  };
}

export function applyRejectedCancellationTransition(): ConflictResolutionTransition {
  return {
    commandStatus: "cancelled",
    conflictStatus: "resolved",
    resolutionStatus: "cancelledLocal",
    localState: null
  };
}

export function isResolutionBlocking(conflictStatus: string, commandStatus: string) {
  return conflictStatus !== "resolved"
    && conflictStatus !== "dismissed"
    || commandStatus === "pending"
    || commandStatus === "sending"
    || commandStatus === "retryLater"
    || commandStatus === "waiting_auth"
    || commandStatus === "waiting_network"
    || commandStatus === "wrong_contour"
    || commandStatus === "blocked";
}
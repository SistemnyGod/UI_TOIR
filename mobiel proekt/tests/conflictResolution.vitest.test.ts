import { describe, expect, it } from "vitest";

import {
  applyServerWinsTransition,
  isResolutionBlocking
} from "@/domain/sync/conflictResolutionPolicy";

describe("локальное разрешение serverWins", () => {
  it("закрывает конфликт, заменяет assignment server state и убирает logout blocker", () => {
    const serverState = {
      assignmentId: "assignment-A",
      requestId: "request-A",
      assignmentStatus: "completedServer",
      requestStatus: "completedServer",
      revision: 12,
      startedAtLocal: "2026-07-25T08:00:00.000Z",
      completedAtLocal: "2026-07-25T09:00:00.000Z"
    } as const;

    const transition = applyServerWinsTransition(serverState);

    expect(transition.commandStatus).toBe("superseded");
    expect(transition.conflictStatus).toBe("resolved");
    expect(transition.resolutionStatus).toBe("resolvedServerWins");
    expect(transition.localState).toEqual(serverState);
    expect(isResolutionBlocking(transition.conflictStatus, transition.commandStatus)).toBe(false);
    expect(["pending", "sending", "retryLater", "waiting_auth", "waiting_network", "wrong_contour", "blocked"])
      .not.toContain(transition.commandStatus);
  });
});
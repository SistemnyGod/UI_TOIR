import { describe, expect, it } from "vitest";

import {
  applyServerWinsTransition,
  isResolutionBlocking
} from "@/domain/sync/conflictResolutionPolicy";
import { parsePatrolPointConflictIdentity } from "@/db/repositories/outboxPolicies";

describe("Р»РѕРєР°Р»СЊРЅРѕРµ СЂР°Р·СЂРµС€РµРЅРёРµ serverWins", () => {
  it("Р·Р°РєСЂС‹РІР°РµС‚ РєРѕРЅС„Р»РёРєС‚, Р·Р°РјРµРЅСЏРµС‚ assignment server state Рё СѓР±РёСЂР°РµС‚ logout blocker", () => {
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

  it("validates patrol point payload before serverWins", () => {
    expect(parsePatrolPointConflictIdentity(
      JSON.stringify({ assignmentId: "assignment-A", pointId: "point-A" }),
      "point-A"
    )).toEqual({ assignmentId: "assignment-A", pointId: "point-A" });
    expect(() => parsePatrolPointConflictIdentity("{broken", "point-A")).toThrow();
    expect(() => parsePatrolPointConflictIdentity(JSON.stringify({ pointId: "point-A" }), "point-A")).toThrow();
    expect(() => parsePatrolPointConflictIdentity(
      JSON.stringify({ assignmentId: "assignment-A", pointId: "point-B" }),
      "point-A"
    )).toThrow();
  });
});

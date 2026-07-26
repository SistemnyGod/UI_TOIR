import { describe, expect, it } from "vitest";

import { canAttachMedia, canScanAssignment } from "@/domain/patrol/patrolStateMachine";

describe("patrol assignment state machine", () => {
  it.each([
    ["authRequired", false],
    ["syncError", false],
    ["needsDispatcherDecision", false],
    ["cancelledServer", false],
    ["inProgress", true]
  ])("scan for %s is allowed: %s", (status, expected) => {
    expect(canScanAssignment(status)).toBe(expected);
  });

  it("blocks adding media after completedLocal", () => {
    expect(canAttachMedia("inProgress")).toBe(true);
    expect(canAttachMedia("completedLocal")).toBe(false);
  });
});
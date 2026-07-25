import { describe, expect, it } from "vitest";

import { canScanAssignment } from "@/domain/patrol/patrolStateMachine";

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
});

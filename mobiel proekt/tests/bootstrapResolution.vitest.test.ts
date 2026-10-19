import { describe, expect, it } from "vitest";

import { resolveBootstrapAssignmentStatus } from "@/domain/sync/bootstrapResolutionPolicy";

// Merging local and server assignment ids and recovering the completion time run on the real
// schema in conflictIdentityBehavior.vitest.test.ts.
describe("bootstrap resolution", () => {
  it("replaces stale needsDispatcherDecision when the server resolved the conflict", () => {
    expect(resolveBootstrapAssignmentStatus("needsDispatcherDecision", "inProgress", false)).toBe("inProgress");
  });

  it("does not roll a locally started patrol back to accepted", () => {
    expect(resolveBootstrapAssignmentStatus("inProgress", "accepted", false)).toBe("inProgress");
    expect(resolveBootstrapAssignmentStatus("paused", "inProgress", false)).toBe("inProgress");
    expect(resolveBootstrapAssignmentStatus("inProgress", "paused", false)).toBe("paused");
    expect(resolveBootstrapAssignmentStatus("paused", "inProgress", true)).toBe("paused");
    expect(resolveBootstrapAssignmentStatus("completedLocal", "inProgress", false)).toBe("completedLocal");
  });

  it("lets terminal server states win over local recovery", () => {
    expect(resolveBootstrapAssignmentStatus("completedLocal", "completedServer", true)).toBe("completedServer");
    expect(resolveBootstrapAssignmentStatus("inProgress", "cancelledServer", true)).toBe("cancelledServer");
  });
});

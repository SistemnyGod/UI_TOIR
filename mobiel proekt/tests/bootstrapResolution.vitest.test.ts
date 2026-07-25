import { describe, expect, it } from "vitest";

import { resolveBootstrapAssignmentStatus } from "@/domain/sync/bootstrapResolutionPolicy";

describe("bootstrap resolution", () => {
  it("replaces stale needsDispatcherDecision when the server resolved the conflict", () => {
    expect(resolveBootstrapAssignmentStatus("needsDispatcherDecision", "inProgress", false)).toBe("inProgress");
  });
});
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveBootstrapAssignmentStatus } from "@/domain/sync/bootstrapResolutionPolicy";

const bootstrapRepositorySource = readFileSync(
  new URL("../src/db/repositories/bootstrapRepository.ts", import.meta.url),
  "utf8"
);

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

  it("remaps the queue aggregate together with assignment identifiers", () => {
    expect(bootstrapRepositorySource).toMatch(/aggregate_key = CASE WHEN aggregate_key = \? THEN \? ELSE aggregate_key END/);
    expect(bootstrapRepositorySource).toMatch(/`patrolAssignment:\$\{local\.assignmentId\}`/);
    expect(bootstrapRepositorySource).toMatch(/`patrolAssignment:\$\{serverAssignment\.assignmentId\}`/);
    expect(bootstrapRepositorySource).toMatch(/payload\.sourceAssignmentId === local\.assignmentId/);
    expect(bootstrapRepositorySource).toMatch(/payload\.sourceAssignmentId = serverAssignment\.assignmentId/);
    expect(bootstrapRepositorySource).toMatch(/patrol_report_cache/);
    expect(bootstrapRepositorySource).toMatch(/patrol_device_context/);
    expect(bootstrapRepositorySource).toMatch(/patrol_assignments\.completed_at_local IS NOT NULL/);
  });

  it("recovers a lost local completion timestamp from the durable completion command", () => {
    expect(bootstrapRepositorySource).toMatch(/command_type = 'completePatrolAssignment'/);
    expect(bootstrapRepositorySource).toMatch(/completedAtLocal/);
    expect(bootstrapRepositorySource).toMatch(/createdAtLocal/);
    expect(bootstrapRepositorySource).toMatch(/completed_at_local = CASE[\s\S]*patrol_assignments\.completed_at_local IS NOT NULL/);
  });
});

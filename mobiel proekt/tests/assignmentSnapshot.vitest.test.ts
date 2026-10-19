import { describe, expect, it } from "vitest";
import { resolveAssignmentSnapshot } from "@/domain/patrol/assignmentSnapshot";
import type { BootstrapDto, PatrolAssignmentDto, PatrolPointDto, PatrolRouteDto } from "@/domain/patrol/patrolTypes";
const route = (version: number): PatrolRouteDto => ({ routeId: "route", version, name: `Revision ${version}`, allowFreeOrder: false, nfcEnabled: true, qrFallbackEnabled: false });
const point = (revision: number): PatrolPointDto => ({ pointId: `point-${revision}`, routeId: "route", revision, name: `Point ${revision}`, orderIndex: 1, nfcUidHash: null, qrCodeHash: null, required: true, requiresPhoto: false, description: null, instruction: `Instruction ${revision}` });
const assignment = (version: number): PatrolAssignmentDto => ({ assignmentId: `assignment-${version}`, routeId: "route", requestId: "request", revision: 0, routeVersionNo: version, status: "assigned", startedAtLocal: null, completedAtLocal: null });
const bootstrap = { routes: [route(2)], points: [point(2)] } as BootstrapDto;
describe("assignment snapshot selection", () => {
  it("uses the immutable assignment revision on first delivery after a route edit", () => {
    const selected = resolveAssignmentSnapshot(bootstrap, { ...assignment(1), routeSnapshot: { route: route(1), points: [point(1)] } });
    expect(selected?.route.version).toBe(1);
    expect(selected?.points[0].instruction).toBe("Instruction 1");
    expect(selected?.manifest?.isComplete).toBe(true);
  });
  it("keeps two simultaneous revisions of the same route separate", () => {
    for (const version of [1, 2]) {
      const selected = resolveAssignmentSnapshot(bootstrap, { ...assignment(version), routeSnapshot: { route: route(version), points: [point(version)] } });
      expect(selected?.points.map(p => p.pointId)).toEqual([`point-${version}`]);
    }
  });
  it("supports a matching legacy catalog and refuses a mismatching one", () => {
    expect(resolveAssignmentSnapshot(bootstrap, assignment(2))?.route.version).toBe(2);
    expect(resolveAssignmentSnapshot(bootstrap, assignment(1))).toBeNull();
  });
  it("supports an archived route absent from the current catalog", () => {
    expect(resolveAssignmentSnapshot({ routes: [], points: [] } as unknown as BootstrapDto, { ...assignment(1), routeSnapshot: { route: route(1), points: [point(1)] } })?.points).toHaveLength(1);
  });
  it("rejects mixed or duplicated points instead of falsely accepting a complete snapshot", () => {
    expect(() => resolveAssignmentSnapshot(bootstrap, { ...assignment(1), routeSnapshot: { route: route(2), points: [point(2)] } })).toThrow();
    expect(() => resolveAssignmentSnapshot(bootstrap, { ...assignment(1), routeSnapshot: { route: route(1), points: [point(2)] } })).toThrow();
    expect(() => resolveAssignmentSnapshot(bootstrap, { ...assignment(1), routeSnapshot: { route: route(1), points: [point(1), point(1)] } })).toThrow();
  });
});

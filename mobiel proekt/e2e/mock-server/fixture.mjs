// Seed data for the e2e mock backend: one employee, one accepted patrol
// request with a two-point NFC route. Test-only values; they exist nowhere else.
export const CONTOUR_ID = "patrol360-e2e";
export const TEST_LOGIN = "e2e.patrol";
export const TEST_PASSWORD = "e2e-patrol-pass";

export const ROUTE_NAME = "E2E маршрут";
export const POINT_NAMES = ["E2E насос 1", "E2E щит 2"];

export function createFixture() {
  const updatedAtServer = "2026-10-01T06:00:00.000Z";
  const userId = "e2e-user-0001";
  const employeeId = "e2e-employee-0001";
  const routeId = "e2e-route-0001";
  const requestId = "e2e-request-0001";
  const assignmentId = "e2e-assignment-0001";
  const plannedStartAt = new Date(Date.now() - 10 * 60_000).toISOString();

  return {
    user: {
      serverUserId: userId,
      fullName: "E2E Обходчик",
      roles: ["patrolEmployee"],
      permissions: [],
      updatedAtServer
    },
    device: { deviceId: "pending", ownerUserId: userId, trusted: true, blockedAt: null },
    boundEmployees: [{ employeeId, fullName: "E2E Обходчик", position: "Обходчик", department: "E2E" }],
    routes: [{ routeId, name: ROUTE_NAME, version: 1, allowFreeOrder: false, nfcEnabled: true, qrFallbackEnabled: false }],
    points: POINT_NAMES.map((name, index) => ({
      pointId: `e2e-point-000${index + 1}`,
      routeId,
      name,
      orderIndex: index + 1,
      nfcUidHash: null,
      qrCodeHash: null,
      required: true,
      requiresPhoto: false,
      description: null,
      instruction: null,
      revision: 1
    })),
    requestBoard: [{
      requestId,
      displayNumber: "E2E-1",
      routeId,
      routeName: ROUTE_NAME,
      plannedStartAt,
      assignedFullName: "E2E Обходчик",
      assignedEmployeeId: employeeId,
      status: "accepted",
      revision: 1
    }],
    assignments: [{
      assignmentId,
      requestId,
      routeId,
      employeeId,
      status: "accepted",
      startedAtLocal: null,
      completedAtLocal: null,
      revision: 1,
      routeVersionNo: 1
    }],
    completedReports: []
  };
}

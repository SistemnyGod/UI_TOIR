import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapResponseSchema,
  loginResponseSchema,
  notificationListResponseSchema,
  workItemListResponseSchema,
  workTaskListResponseSchema
} from "../src/api/schemas.ts";

const user = {
  serverUserId: "user-1",
  fullName: "Operator",
  roles: ["mobile"],
  permissions: ["patrol.read"],
  updatedAtServer: "2026-07-20T10:00:00Z"
};

test("auth response accepts the complete mobile session", () => {
  const result = loginResponseSchema.safeParse({
    user,
    device: {
      deviceId: "device-1",
      ownerUserId: "user-1",
      trusted: true,
      blockedAt: null
    },
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: "2026-07-20T11:00:00Z",
    refreshExpiresAt: "2026-07-27T11:00:00Z",
    contourId: "patrol360-local-enterprise"
  });

  assert.equal(result.success, true);
});

test("auth response rejects missing tokens before they reach SecureStore", () => {
  const result = loginResponseSchema.safeParse({
    user,
    device: { deviceId: "device-1", ownerUserId: "user-1", trusted: true, blockedAt: null },
    accessToken: "",
    refreshToken: "refresh-token",
    expiresAt: "2026-07-20T11:00:00Z",
    refreshExpiresAt: "2026-07-27T11:00:00Z"
  });

  assert.equal(result.success, false);
});

test("bootstrap response rejects an unknown patrol status", () => {
  const result = bootstrapResponseSchema.safeParse({
    user,
    device: { deviceId: "device-1", ownerUserId: "user-1", trusted: true, blockedAt: null },
    boundEmployees: [],
    emuSections: [],
    requestBoard: [{
      requestId: "request-1",
      displayNumber: null,
      routeId: "route-1",
      routeName: "Route",
      plannedStartAt: "2026-07-20T11:00:00Z",
      assignedFullName: null,
      status: "status-added-by-unknown-server",
      revision: 1
    }],
    assignments: [],
    routes: [],
    points: [],
    serverTime: "2026-07-20T10:00:00Z",
    syncCursor: null
  });

  assert.equal(result.success, false);
});

test("work task and work item responses require their nested contract", () => {
  assert.equal(workTaskListResponseSchema.safeParse([{
    taskId: "task-1",
    title: "Task",
    status: "available",
    plannedAt: null,
    revision: 1,
    completedAtLocal: null,
    sectionId: null,
    sectionName: null,
    employeeId: null,
    employeeName: null,
    createdAtLocal: "2026-07-20T10:00:00Z",
    syncStatus: "synced"
  }]).success, true);

  assert.equal(workItemListResponseSchema.safeParse([{
    itemId: "item-1",
    kind: "workSession",
    workSessionId: "session-1",
    planTaskId: null,
    title: "Task",
    description: "Description",
    sectionId: null,
    sectionName: "Section",
    plannedAt: null,
    status: "inProgress",
    approvalStatus: "approved",
    revision: 1,
    source: "web",
    assignedEmployees: [],
    actualParticipants: [],
    attachments: [],
    capabilities: {
      canStart: false,
      canJoin: true,
      canReplace: false,
      canPause: true,
      canResume: false,
      canComplete: true
    }
  }]).success, true);
});

test("notification list rejects malformed timestamps and identifiers", () => {
  const result = notificationListResponseSchema.safeParse([{
    id: "notification-1",
    type: "assignment",
    title: "Title",
    message: "Message",
    entityType: null,
    entityId: null,
    createdAt: "not-a-date",
    readAt: null
  }]);

  assert.equal(result.success, false);
});

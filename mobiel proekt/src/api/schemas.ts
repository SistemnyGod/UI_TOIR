import { z } from "zod";

const identifier = z.string().min(1);
const timestamp = z.string().min(1).refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Expected an ISO timestamp"
});
const nullableString = z.string().nullable();
const workTaskStatus = z.enum([
  "available",
  "assigned",
  "new",
  "accepted",
  "inProgress",
  "paused",
  "completedLocal",
  "completedServer",
  "cancelled",
  "conflict"
]);
const patrolRequestStatus = z.enum([
  "available",
  "assigned",
  "accepted",
  "inProgress",
  "paused",
  "completed",
  "completedServer",
  "cancelled",
  "cancelledServer",
  "completedLocal",
  "syncing",
  "syncError",
  "authRequired",
  "needsDispatcherDecision"
]);
const patrolAssignmentStatus = z.enum([
  "accepted",
  "inProgress",
  "paused",
  "completedLocal",
  "syncing",
  "completedServer",
  "conflict",
  "cancelledServer",
  "syncError",
  "authRequired",
  "needsDispatcherDecision"
]);

export const mobileUserSchema = z.object({
  serverUserId: identifier,
  fullName: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  updatedAtServer: timestamp
}).passthrough();

export const mobileDeviceSchema = z.object({
  deviceId: identifier,
  ownerUserId: identifier,
  trusted: z.boolean(),
  blockedAt: nullableString
}).passthrough();

export const loginResponseSchema = z.object({
  user: mobileUserSchema,
  device: mobileDeviceSchema,
  accessToken: identifier,
  refreshToken: identifier,
  expiresAt: timestamp,
  refreshExpiresAt: timestamp,
  contourId: identifier
}).passthrough();

const mobileEmployeeSchema = z.object({
  employeeId: identifier,
  fullName: z.string(),
  position: nullableString,
  department: nullableString
}).passthrough();

const emuSectionSchema = z.object({
  sectionId: identifier,
  name: z.string(),
  sortOrder: z.number().int()
}).passthrough();

const patrolRequestBoardItemSchema = z.object({
  requestId: identifier,
  displayNumber: nullableString,
  routeId: identifier,
  routeName: z.string(),
  plannedStartAt: timestamp,
  assignedFullName: nullableString,
  status: patrolRequestStatus,
  revision: z.number().int()
}).passthrough();

const patrolAssignmentSchema = z.object({
  assignmentId: identifier,
  requestId: identifier,
  routeId: identifier,
  status: patrolAssignmentStatus,
  startedAtLocal: nullableString,
  completedAtLocal: nullableString,
  revision: z.number().int(),
  routeVersionNo: z.number().int()
}).passthrough();

const patrolRouteSchema = z.object({
  routeId: identifier,
  name: z.string(),
  version: z.number().int(),
  allowFreeOrder: z.boolean(),
  nfcEnabled: z.boolean(),
  qrFallbackEnabled: z.boolean()
}).passthrough();

const patrolPointSchema = z.object({
  pointId: identifier,
  routeId: identifier,
  name: z.string(),
  orderIndex: z.number().int(),
  nfcUidHash: nullableString,
  qrCodeHash: nullableString,
  required: z.boolean(),
  requiresPhoto: z.boolean(),
  description: nullableString,
  instruction: nullableString,
  revision: z.number().int()
}).passthrough();

export const bootstrapResponseSchema = z.object({
  user: mobileUserSchema,
  device: mobileDeviceSchema,
  boundEmployees: z.array(mobileEmployeeSchema),
  emuSections: z.array(emuSectionSchema),
  requestBoard: z.array(patrolRequestBoardItemSchema),
  assignments: z.array(patrolAssignmentSchema),
  cancelledAssignmentIds: z.array(identifier).optional(),
  routes: z.array(patrolRouteSchema),
  points: z.array(patrolPointSchema),
  serverTime: timestamp,
  syncCursor: nullableString,
  contourId: identifier
}).passthrough();

export const workTaskListResponseSchema = z.array(z.object({
  taskId: identifier,
  title: z.string(),
  status: workTaskStatus,
  plannedAt: timestamp.nullable(),
  revision: z.number().int(),
  completedAtLocal: timestamp.nullable(),
  sectionId: identifier.nullable(),
  sectionName: z.string().nullable(),
  employeeId: identifier.nullable(),
  employeeName: z.string().nullable(),
  createdAtLocal: timestamp,
  syncStatus: z.string()
}).passthrough());

const workParticipantSchema = z.object({
  employeeId: identifier,
  fullName: z.string(),
  status: z.string(),
  startedAt: timestamp.nullable(),
  finishedAt: timestamp.nullable(),
  isCurrentMobileEmployee: z.boolean()
}).passthrough();

const workAttachmentSchema = z.object({
  fileId: identifier,
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: timestamp
}).passthrough();

const workItemCapabilitiesSchema = z.object({
  canStart: z.boolean(),
  canJoin: z.boolean(),
  canReplace: z.boolean(),
  canPause: z.boolean(),
  canResume: z.boolean(),
  canComplete: z.boolean()
}).passthrough();

const rawWorkItemSchema = z.object({
  itemId: identifier,
  kind: z.enum(["planTask", "workSession"]),
  workSessionId: identifier.nullable(),
  planTaskId: identifier.nullable(),
  title: z.string(),
  description: z.string(),
  sectionId: identifier.nullable(),
  sectionName: z.string(),
  plannedAt: timestamp.nullable(),
  status: workTaskStatus,
  approvalStatus: z.string(),
  revision: z.number().int(),
  source: z.string(),
  assignedEmployees: z.array(workParticipantSchema),
  actualParticipants: z.array(workParticipantSchema),
  attachments: z.array(workAttachmentSchema),
  capabilities: workItemCapabilitiesSchema
}).passthrough();

export const workItemListResponseSchema = z.array(rawWorkItemSchema);

export const registerPushTokenResponseSchema = z.object({
  deviceId: identifier,
  pushEnabled: z.boolean(),
  registeredAt: timestamp
}).passthrough();

export const notificationSchema = z.object({
  id: identifier,
  type: z.string(),
  title: z.string(),
  message: z.string(),
  entityType: nullableString,
  entityId: nullableString,
  createdAt: timestamp,
  readAt: timestamp.nullable()
}).passthrough();

export const notificationListResponseSchema = z.array(notificationSchema);

export const emptyResponseSchema = z.undefined();
export const unknownResponseSchema = z.unknown();

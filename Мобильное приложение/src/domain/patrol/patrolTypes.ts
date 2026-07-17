export type MobileUserDto = {
  serverUserId: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  updatedAtServer: string;
};

export type MobileDeviceDto = {
  deviceId: string;
  ownerUserId: string;
  trusted: boolean;
  blockedAt: string | null;
};

export type MobileEmployeeDto = {
  employeeId: string;
  fullName: string;
  position: string | null;
  department: string | null;
};

export type MobileEmuSectionDto = {
  sectionId: string;
  name: string;
  sortOrder: number;
};

export type PatrolRequestBoardItemDto = {
  requestId: string;
  displayNumber: string | null;
  routeId: string;
  routeName: string;
  plannedStartAt: string;
  assignedFullName: string | null;
  status: PatrolRequestStatus;
  revision: number;
};

export type PatrolRequestStatus =
  | "available"
  | "assigned"
  | "accepted"
  | "inProgress"
  | "paused"
  | "completed"
  | "completedServer"
  | "cancelled"
  | "cancelledServer"
  | "completedLocal"
  | "syncing"
  | "syncError"
  | "authRequired"
  | "needsDispatcherDecision";

export type PatrolAssignmentStatus =
  | "accepted"
  | "inProgress"
  | "paused"
  | "completedLocal"
  | "syncing"
  | "completedServer"
  | "conflict"
  | "cancelledServer"
  | "syncError"
  | "authRequired"
  | "needsDispatcherDecision";

export type PatrolAssignmentDto = {
  assignmentId: string;
  requestId: string;
  routeId: string;
  status: PatrolAssignmentStatus;
  startedAtLocal: string | null;
  completedAtLocal: string | null;
  revision: number;
  routeVersionNo: number;
};

export type PatrolRouteDto = {
  routeId: string;
  name: string;
  version: number;
  allowFreeOrder: boolean;
  nfcEnabled: boolean;
  qrFallbackEnabled: boolean;
};

export type PatrolPointDto = {
  pointId: string;
  routeId: string;
  name: string;
  orderIndex: number;
  nfcUidHash: string | null;
  qrCodeHash: string | null;
  required: boolean;
  requiresPhoto: boolean;
  description: string | null;
  instruction: string | null;
  revision: number;
};

export type PatrolPointResultStatus = "pending" | "scanned" | "ok" | "issue" | "deferred" | "skipped";

export type PatrolPointResultDto = {
  localResultId: string;
  assignmentId: string;
  pointId: string;
  status: PatrolPointResultStatus;
  comment: string | null;
  issueTypeId: string | null;
  severity: "low" | "medium" | "high" | null;
  photoClientFileIds: string[];
  completedAtLocal: string | null;
};

export type BootstrapDto = {
  user: MobileUserDto;
  device: MobileDeviceDto;
  boundEmployees: MobileEmployeeDto[];
  emuSections: MobileEmuSectionDto[];
  requestBoard: PatrolRequestBoardItemDto[];
  assignments: PatrolAssignmentDto[];
  cancelledAssignmentIds?: string[];
  routes: PatrolRouteDto[];
  points: PatrolPointDto[];
  serverTime: string;
  syncCursor: string | null;
};

export type MobileNotificationDto = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  readAt: string | null;
};

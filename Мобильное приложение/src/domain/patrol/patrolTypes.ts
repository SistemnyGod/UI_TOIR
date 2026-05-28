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

export type PatrolRequestBoardItemDto = {
  requestId: string;
  routeId: string;
  routeName: string;
  plannedStartAt: string;
  assignedFullName: string | null;
  status: "available" | "assigned" | "accepted" | "inProgress" | "completed" | "cancelled";
  revision: number;
};

export type PatrolAssignmentDto = {
  assignmentId: string;
  requestId: string;
  routeId: string;
  status: "accepted" | "inProgress" | "completedLocal" | "syncing" | "completedServer" | "conflict";
  startedAtLocal: string | null;
  completedAtLocal: string | null;
  revision: number;
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
  requestBoard: PatrolRequestBoardItemDto[];
  assignments: PatrolAssignmentDto[];
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

import { PointDraftSelectedStatus } from "@/domain/patrol/pointDraftPolicy";

export type RequestBoardItem = {
  assignedEmployeeId?: string | null;
  performerSelectionAvailable?: number;
  requestId: string;
  displayNumber: string | null;
  routeId: string;
  routeName: string;
  plannedStartAt: string;
  assignedFullName: string | null;
  status: string;
  revision: number;
};

export type ActiveAssignment = {
  employeeId?: string | null;
  assignedFullName?: string | null;
  assignmentId: string;
  requestId: string;
  routeId: string;
  routeName: string;
  status: string;
  startedAtLocal: string | null;
  completedAtLocal: string | null;
  revision: number;
  routeVersionNo: number;
  snapshotVersion?: number;
  snapshotCreatedAt?: string | null;
  snapshotSource?: string | null;
  snapshotAllowFreeOrder?: number | null;
  snapshotNfcEnabled?: number | null;
  snapshotQrFallbackEnabled?: number | null;
};

export type PointListItem = {
  pointId: string;
  routeId: string;
  name: string;
  description?: string | null;
  instruction?: string | null;
  orderIndex: number;
  required: boolean;
  requiresPhoto: boolean;
  status: "pending" | "scanned" | "ok" | "issue" | "deferred" | "skipped";
  comment: string | null;
  manualReason?: string | null;
  issueTypeId?: string | null;
  confirmationType?: "nfc" | "qr" | "manual" | null;
  photoClientFileIds: string[];
};

export type PointForFill = PointListItem & {
  assignmentId: string;
  nfcUidHash: string | null;
  qrCodeHash: string | null;
  confirmationType: "nfc" | "qr" | "manual" | null;
  scannedAtLocal: string | null;
  completedAtLocal: string | null;
  issueTypeId: string | null;
  deferredReason: string | null;
  photoClientFileIds: string[];
};

export type AssignmentProgress = {
  total: number;
  /** Points actually inspected. A skipped point is processed but never inspected. */
  inspected: number;
  completed: number;
  deferred: number;
  issues: number;
  skipped: number;
};

export type ReportProblem = {
  pointId: string;
  pointName: string;
  orderIndex: number;
  reason: string;
};

export type ReportReadiness = {
  assignment: ActiveAssignment | null;
  progress: AssignmentProgress;
  problems: ReportProblem[];
  ready: boolean;
};

export type DeferPointInput = {
  manualReason?: string;
  selectedStatus?: PointDraftSelectedStatus;
  comment?: string | null;
  issueTypeId?: string | null;
  photoClientFileIds?: string[];
  reason?: string;
};

export type AssignmentScanPolicy = {
  allowFreeOrder: boolean;
  nfcEnabled: boolean;
  qrFallbackEnabled: boolean;
};

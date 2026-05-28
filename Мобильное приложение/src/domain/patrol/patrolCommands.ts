import { PatrolPointResultDto } from "@/domain/patrol/patrolTypes";

export type TakePatrolRequestPayload = {
  requestId: string;
  routeId: string;
  requestRevision: number;
  takenAtLocal: string;
};

export type ScanPatrolPointNfcPayload = {
  assignmentId: string;
  pointId: string;
  nfcUidHash: string;
  scannedAtLocal: string;
};

export type SavePatrolPointResultPayload = PatrolPointResultDto;

export type CompletePatrolAssignmentPayload = {
  assignmentId: string;
  requestId: string;
  completedAtLocal: string;
  pointResultIds: string[];
};

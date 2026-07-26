import type { OutboxCommand } from "@/domain/sync/syncTypes";

export function extractUploadClientFileIds(command: Pick<OutboxCommand, "commandType" | "payload">): string[] {
  if (command.commandType === "createShiftRemark" || command.commandType === "attachShiftRemarkMedia") {
    return readStringArray(command.payload.mediaClientFileIds);
  }

  if (command.commandType === "markPatrolPointOk" || command.commandType === "markPatrolPointIssue") {
    return readStringArray(command.payload.photoClientFileIds);
  }

  if (command.commandType === "completePatrolAssignment") {
    const pointResults = command.payload.pointResults;
    if (!Array.isArray(pointResults)) {
      return [];
    }

    return pointResults.flatMap((result) => {
      if (!isRecord(result)) {
        return [];
      }
      return readStringArray(result.photoClientFileIds);
    });
  }

  return [];
}

export type UploadFileReference = {
  clientFileId: string;
  assignmentId?: string;
  pointId?: string;
  remarkId?: string;
};

export function extractUploadFileReferences(command: OutboxCommand): UploadFileReference[] {
  const entityId = command.entityLocalId ?? command.entityServerId ?? undefined;

  if (command.commandType === "createShiftRemark" || command.commandType === "attachShiftRemarkMedia") {
    const remarkId = readString(command.payload.remarkId) ?? entityId;
    return readStringArray(command.payload.mediaClientFileIds).map((clientFileId) => ({ clientFileId, remarkId }));
  }

  if (command.commandType === "markPatrolPointOk" || command.commandType === "markPatrolPointIssue") {
    const assignmentId = readString(command.payload.assignmentId);
    const pointId = readString(command.payload.pointId) ?? entityId;
    return readStringArray(command.payload.photoClientFileIds).map((clientFileId) => ({ clientFileId, assignmentId, pointId }));
  }

  if (command.commandType === "completePatrolAssignment") {
    const assignmentId = readString(command.payload.assignmentId) ?? entityId;
    const pointResults = command.payload.pointResults;
    if (!Array.isArray(pointResults)) {
      return [];
    }

    return pointResults.flatMap((result) => {
      if (!isRecord(result)) {
        return [];
      }
      const pointId = readString(result.pointId);
      return readStringArray(result.photoClientFileIds).map((clientFileId) => ({
        clientFileId,
        assignmentId,
        pointId
      }));
    });
  }

  return [];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
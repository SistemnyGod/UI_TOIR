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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
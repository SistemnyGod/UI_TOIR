import type { OutboxCommandStatus, OutboxCommandType } from "@/domain/sync/syncTypes";

const revisionPendingStatuses = new Set<OutboxCommandStatus>(["pending", "retryLater"]);
const revisionCommandTypes = new Set<OutboxCommandType>([
  "updateWorkTask",
  "pauseWorkTask",
  "resumeWorkTask",
  "completeWorkTask",
  "startPlannedWork",
  "joinWorkTask",
  "replaceWorkTaskParticipant"
]);

export type PendingWorkTaskRevisionCommand = {
  commandType: OutboxCommandType;
  status: OutboxCommandStatus;
  payload: Record<string, unknown>;
  entityServerId: string | null;
};

export function applyWorkTaskServerRevision(
  commands: PendingWorkTaskRevisionCommand[],
  serverRevision: number | null,
  serverEntityId: string | null
) {
  return commands.map((command) => {
    if (!revisionPendingStatuses.has(command.status) || !revisionCommandTypes.has(command.commandType)) {
      return command;
    }

    const payload = { ...command.payload };
    if (serverRevision !== null) {
      payload.baseRevision = serverRevision;
    }
    if (serverEntityId) {
      payload.taskId = serverEntityId;
    }

    return {
      ...command,
      entityServerId: serverEntityId ?? command.entityServerId,
      payload
    };
  });
}

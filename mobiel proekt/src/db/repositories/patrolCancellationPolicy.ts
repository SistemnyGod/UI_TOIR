export type AssignmentCommandReference = {
  clientOperationId: string;
  entityLocalId: string | null;
  entityServerId: string | null;
  payloadJson: string;
};

export function getAssignmentCommandIds(
  commands: AssignmentCommandReference[],
  assignmentId: string
) {
  return commands
    .filter((command) => {
      if (command.entityLocalId === assignmentId || command.entityServerId === assignmentId) {
        return true;
      }

      try {
        const payload = JSON.parse(command.payloadJson) as { assignmentId?: unknown };
        return payload.assignmentId === assignmentId;
      } catch {
        return false;
      }
    })
    .map((command) => command.clientOperationId);
}
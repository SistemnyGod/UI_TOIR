export type OrderedOutboxItem = {
  createdAtLocal: string;
  assignmentId: string | null;
  sequenceNo?: number | null;
  clientOperationId?: string;
};

export type OutboxAggregateCommand = {
  commandType: string;
  entityType?: string | null;
  entityLocalId?: string | null;
  entityServerId?: string | null;
  payload: Record<string, unknown>;
};

export function getCommandAssignmentId(command: OutboxAggregateCommand) {
  if (command.commandType === "acceptPatrolRequest" || command.commandType === "takePatrolRequest" || command.commandType === "startPatrolAssignment") {
    return command.entityLocalId ?? null;
  }

  const payloadAssignmentId = command.payload.assignmentId;
  return typeof payloadAssignmentId === "string" && payloadAssignmentId ? payloadAssignmentId : command.entityLocalId ?? null;
}
export function getCommandAggregateKey(command: OutboxAggregateCommand) {
  const assignmentId = getCommandAssignmentId(command);
  const isPatrolAggregate = command.entityType === "patrolAssignment"
    || command.entityType === "patrolPoint"
    || /Patrol/.test(command.commandType);
  if (isPatrolAggregate && assignmentId) {
    return `patrolAssignment:${assignmentId}`;
  }

  const entityId = command.entityLocalId ?? command.entityServerId ?? assignmentId;
  if (entityId) {
    return `${command.entityType ?? "command"}:${entityId}`;
  }

  return null;
}
function compareByCreatedAt(left: OrderedOutboxItem, right: OrderedOutboxItem) {
  const leftSequence = left.sequenceNo ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequenceNo ?? Number.MAX_SAFE_INTEGER;
  if (left.assignmentId && left.assignmentId === right.assignmentId && leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  const createdAtOrder = left.createdAtLocal.localeCompare(right.createdAtLocal);
  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }
  return (left.clientOperationId ?? "").localeCompare(right.clientOperationId ?? "");
}

/**
 * Keeps every command of one patrol in FIFO order while independent patrols
 * remain eligible to be interleaved by the first command of their aggregate.
 */
export function selectNextOutboxCommands<T extends OrderedOutboxItem>(commands: T[], batchLimit: number) {
  const sortedCommands = [...commands].sort(compareByCreatedAt);
  const aggregateCommands = new Map<string, T[]>();

  sortedCommands.forEach((command, index) => {
    const aggregateKey = command.assignmentId ? `assignment:${command.assignmentId}` : `independent:${index}`;
    const current = aggregateCommands.get(aggregateKey);
    if (current) {
      current.push(command);
    } else {
      aggregateCommands.set(aggregateKey, [command]);
    }
  });

  // Only the head of each aggregate enters one batch. The next command of
  // the same assignment becomes eligible on the following sync pass, after
  // the head has been accepted or marked duplicate.
  return [...aggregateCommands.values()]
    .map((aggregate) => aggregate[0])
    .sort(compareByCreatedAt)
    .slice(0, batchLimit);
}

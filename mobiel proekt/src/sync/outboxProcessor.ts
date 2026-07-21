import * as Crypto from "expo-crypto";

import { insertOutboxCommand, listPendingOutboxCommands } from "@/db/repositories/outboxRepository";
import { MobileEntityType, OutboxCommand, OutboxCommandType } from "@/domain/sync/syncTypes";
import { selectNextOutboxCommands as selectNextByAssignment } from "@/sync/outboxOrderingPolicy";
import { assertRecordsBelongToOwner } from "@/sync/ownerIsolation";

type CreateOutboxCommandInput = {
  ownerUserId: string;
  commandType: OutboxCommandType;
  entityType: MobileEntityType;
  entityLocalId?: string | null;
  entityServerId?: string | null;
  payload: Record<string, unknown>;
};

export function createOutboxCommand(input: CreateOutboxCommandInput): OutboxCommand {
  return {
    clientOperationId: Crypto.randomUUID(),
    ownerUserId: input.ownerUserId,
    commandType: input.commandType,
    entityType: input.entityType,
    entityLocalId: input.entityLocalId ?? null,
    entityServerId: input.entityServerId ?? null,
    payload: input.payload,
    createdAtLocal: new Date().toISOString(),
    attemptCount: 0,
    status: "pending"
  };
}

export async function enqueueOutboxCommand(input: CreateOutboxCommandInput) {
  const command = createOutboxCommand(input);
  await insertOutboxCommand(command);

  return command;
}

export async function getPendingOutboxBatch(ownerUserId: string, limit?: number) {
  const batchLimit = limit ?? 25;
  const commands = assertRecordsBelongToOwner(
    ownerUserId,
    await listPendingOutboxCommands(ownerUserId, Math.max(batchLimit * 4, 100))
  );
  return selectNextByAssignment(
    commands.map((command) => ({ command, assignmentId: getCommandAssignmentId(command), createdAtLocal: command.createdAtLocal })),
    batchLimit
  ).map((item) => item.command);
}

/* Legacy export retained for callers that operate on full command objects. */
export function selectNextOutboxCommands(commands: OutboxCommand[], batchLimit: number) {
  // A patrol is a state machine, not an independently sortable set of jobs.
  // Sending `start` before the preceding `accept` used to be possible because
  // of global command priorities.  Select only the oldest pending command per
  // patrol in a pass; after its server acknowledgement the next pass advances
  // that same patrol.  Commands from different patrols remain independent.
  return selectNextByAssignment(
    commands.map((command) => ({ command, assignmentId: getCommandAssignmentId(command), createdAtLocal: command.createdAtLocal })),
    batchLimit
  ).map((item) => item.command);
}

function getCommandAssignmentId(command: OutboxCommand) {
  if (command.commandType === "takePatrolRequest" || command.commandType === "startPatrolAssignment") {
    return command.entityLocalId ?? null;
  }

  const payloadAssignmentId = command.payload.assignmentId;
  return typeof payloadAssignmentId === "string" ? payloadAssignmentId : command.entityLocalId ?? null;
}

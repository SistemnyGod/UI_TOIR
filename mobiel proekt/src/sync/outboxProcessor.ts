import * as Crypto from "expo-crypto";

import { insertOutboxCommand, listPendingOutboxCommands } from "@/db/repositories/outboxRepository";
import { MobileEntityType, OutboxCommand, OutboxCommandType } from "@/domain/sync/syncTypes";
import { getCommandAggregateKey, selectNextOutboxCommands as selectNextByAssignment } from "@/sync/outboxOrderingPolicy";
import { assertRecordsBelongToOwner } from "@/sync/ownerIsolation";
import { requestSyncAfterMutation } from "@/sync/mutationSyncRequest";

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
  requestSyncAfterMutation();

  return command;
}

export async function getPendingOutboxBatch(
  ownerUserId: string,
  limit?: number,
  excludedClientOperationIds: ReadonlySet<string> = new Set(),
  aggregateKey?: string
) {
  const batchLimit = limit ?? 25;
  const commands = assertRecordsBelongToOwner(
    ownerUserId,
    await listPendingOutboxCommands(ownerUserId, Math.max(batchLimit * 4, 100), aggregateKey)
  ).filter((command) => !excludedClientOperationIds.has(command.clientOperationId));
  return selectNextByAssignment(
    commands.map((command) => ({ command, assignmentId: getCommandAggregateKey(command), createdAtLocal: command.createdAtLocal, sequenceNo: command.sequenceNo, clientOperationId: command.clientOperationId })),
    batchLimit
  ).map((item) => item.command);
}

/* Legacy export retained for callers that operate on full command objects. */
export function selectNextOutboxCommands(commands: OutboxCommand[], batchLimit: number) {
  // A patrol is a state machine, not an independently sortable set of jobs.
  // Sending `start` before the preceding `accept` used to be possible because
  // of global command priorities.  Commands for one patrol stay FIFO;
  // commands from different patrols remain independent aggregates.

  return selectNextByAssignment(
    commands.map((command) => ({ command, assignmentId: getCommandAggregateKey(command), createdAtLocal: command.createdAtLocal, sequenceNo: command.sequenceNo, clientOperationId: command.clientOperationId })),
    batchLimit
  ).map((item) => item.command);
}

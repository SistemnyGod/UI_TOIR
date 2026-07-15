import * as Crypto from "expo-crypto";

import { insertOutboxCommand, listPendingOutboxCommands } from "@/db/repositories/outboxRepository";
import { MobileEntityType, OutboxCommand, OutboxCommandType } from "@/domain/sync/syncTypes";
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
  const blockedCompleteAssignmentIds = new Set(
    commands
      .filter((command) => command.commandType !== "completePatrolAssignment")
      .map(getCommandAssignmentId)
      .filter((assignmentId): assignmentId is string => Boolean(assignmentId))
  );

  return commands
    .sort(compareOutboxCommands)
    .filter((command) => {
      if (command.commandType !== "completePatrolAssignment") {
        return true;
      }

      const assignmentId = getCommandAssignmentId(command);
      return !assignmentId || !blockedCompleteAssignmentIds.has(assignmentId);
    })
    .slice(0, batchLimit);
}

function compareOutboxCommands(left: OutboxCommand, right: OutboxCommand) {
  const priorityDiff = getCommandPriority(left.commandType) - getCommandPriority(right.commandType);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return left.createdAtLocal.localeCompare(right.createdAtLocal);
}

function getCommandPriority(commandType: OutboxCommandType) {
  switch (commandType) {
    case "takePatrolRequest":
    case "startPatrolAssignment":
      return 0;
    case "scanPatrolPointNfc":
    case "scanPatrolPointQr":
      return 1;
    case "markPatrolPointOk":
    case "markPatrolPointIssue":
      return 2;
    case "completePatrolAssignment":
      return 4;
    default:
      return 3;
  }
}

function getCommandAssignmentId(command: OutboxCommand) {
  if (command.commandType === "takePatrolRequest" || command.commandType === "startPatrolAssignment") {
    return command.entityLocalId ?? null;
  }

  const payloadAssignmentId = command.payload.assignmentId;
  return typeof payloadAssignmentId === "string" ? payloadAssignmentId : command.entityLocalId ?? null;
}

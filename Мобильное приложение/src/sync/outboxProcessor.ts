import * as Crypto from "expo-crypto";

import { insertOutboxCommand, listPendingOutboxCommands } from "@/db/repositories/outboxRepository";
import { MobileEntityType, OutboxCommand, OutboxCommandType } from "@/domain/sync/syncTypes";

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

export async function getPendingOutboxBatch(limit?: number) {
  return listPendingOutboxCommands(limit);
}

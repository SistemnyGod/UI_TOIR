import { postOutbox } from "@/api/mobileApi";
import { uploadPatrolPhoto } from "@/api/fileApi";
import { getAccessToken } from "@/auth/tokenStorage";
import { hasUsableNetwork } from "@/core/network";
import {
  listFilesByClientIds,
  markFileUploaded,
  markFileUploadFailed,
  markFileUploading
} from "@/db/repositories/filesRepository";
import {
  applyOutboxResponses,
  markOutboxCommandsRetryLater,
  markOutboxCommandsSending,
  resetStaleSendingOutboxCommands
} from "@/db/repositories/outboxRepository";
import { getPendingOutboxBatch } from "@/sync/outboxProcessor";
import { OutboxCommand } from "@/domain/sync/syncTypes";

type ForegroundSyncResult = {
  sent: number;
  skipped: "offline" | "busy" | "unauthenticated" | null;
};

const staleSendingTimeoutMs = 5 * 60 * 1000;
let foregroundSyncPromise: Promise<ForegroundSyncResult> | null = null;

export async function runForegroundSync(): Promise<ForegroundSyncResult> {
  if (foregroundSyncPromise) {
    return { sent: 0, skipped: "busy" };
  }

  foregroundSyncPromise = runForegroundSyncInternal();

  try {
    return await foregroundSyncPromise;
  } finally {
    foregroundSyncPromise = null;
  }
}

async function runForegroundSyncInternal(): Promise<ForegroundSyncResult> {
  if (!(await hasUsableNetwork())) {
    return { sent: 0, skipped: "offline" as const };
  }

  if (!(await getAccessToken())) {
    return { sent: 0, skipped: "unauthenticated" as const };
  }

  await resetStaleSendingOutboxCommands(getStaleSendingBoundaryIso());

  const commands = await getPendingOutboxBatch();

  if (commands.length === 0) {
    return { sent: 0, skipped: null };
  }

  const commandIds = commands.map((command) => command.clientOperationId);
  await markOutboxCommandsSending(commandIds);

  try {
    await uploadPhotosForCompleteCommands(commands);
    const responses = await postOutbox(commands);
    await applyOutboxResponses(responses);

    return { sent: responses.length, skipped: null };
  } catch (error) {
    await markOutboxCommandsRetryLater(commandIds);
    throw error;
  }
}

export async function recoverStaleSendingOutboxCommands() {
  await resetStaleSendingOutboxCommands(getStaleSendingBoundaryIso());
}

function getStaleSendingBoundaryIso() {
  return new Date(Date.now() - staleSendingTimeoutMs).toISOString();
}

async function uploadPhotosForCompleteCommands(commands: OutboxCommand[]) {
  const clientFileIds = Array.from(new Set(commands.flatMap(extractUploadClientFileIds)));
  const files = await listFilesByClientIds(clientFileIds);

  for (const file of files) {
    if (file.status === "uploaded" || file.status === "linked") {
      continue;
    }

    try {
      await markFileUploading(file.clientFileId);
      const response = await uploadPatrolPhoto(file);
      await markFileUploaded(file.clientFileId, response.serverFileId);
    } catch {
      await markFileUploadFailed(file.clientFileId);
      throw new Error("Mobile file upload failed.");
    }
  }
}

function extractUploadClientFileIds(command: OutboxCommand) {
  if (command.commandType === "createShiftRemark" || command.commandType === "attachShiftRemarkMedia") {
    const mediaClientFileIds = command.payload.mediaClientFileIds;
    return Array.isArray(mediaClientFileIds)
      ? mediaClientFileIds.filter((item): item is string => typeof item === "string")
      : [];
  }

  if (command.commandType === "completePatrolAssignment") {
    return extractPatrolPhotoClientFileIds(command);
  }

  return [];
}

function extractPatrolPhotoClientFileIds(command: OutboxCommand) {
  const pointResults = command.payload.pointResults;
  if (!Array.isArray(pointResults)) {
    return [];
  }

  return pointResults.flatMap((result) => {
    if (!isRecord(result) || !Array.isArray(result.photoClientFileIds)) {
      return [];
    }

    return result.photoClientFileIds.filter((item): item is string => typeof item === "string");
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

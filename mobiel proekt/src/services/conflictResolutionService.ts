import { getBootstrap } from "@/api/mobileApi";
import { getAccessToken } from "@/auth/tokenStorage";
import { currentContourId } from "@/core/environments";
import {
  cancelRejectedOutboxCommand,
  getOutboxCommandEntityLocalId,
  markOutboxConflictForDispatcher,
  resolveOutboxConflictAsServerWins,
  retryOutboxConflictWithRevision
} from "@/db/repositories/outboxRepository";
import { saveBootstrap } from "@/db/repositories/bootstrapRepository";
import { SyncQueueCommandItem } from "@/db/repositories/outboxTypes";

export async function acceptServerConflict(ownerUserId: string, command: SyncQueueCommandItem) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("Сессия истекла. Сначала войдите повторно, затем повторите разрешение конфликта.");
  }

  const bootstrap = await getBootstrap(accessToken);
  if (bootstrap.contourId !== currentContourId || bootstrap.user.serverUserId !== ownerUserId) {
    throw new Error("Состояние сервера относится к другому контуру или пользователю. Локальные данные не изменены.");
  }

  await saveBootstrap(bootstrap, { force: true });
  const targetId = await getOutboxCommandEntityLocalId(ownerUserId, command.clientOperationId) ?? command.entityLocalId;
  const assignment = command.entityType === "patrolAssignment"
    ? bootstrap.assignments.find((item) => item.assignmentId === targetId)
    : null;
  const assignmentWasCancelled = command.entityType === "patrolAssignment"
    && Boolean(targetId && bootstrap.cancelledAssignmentIds?.includes(targetId));

  if (command.entityType === "patrolAssignment" && !assignment && !assignmentWasCancelled) {
    throw new Error("Сервер не вернул актуальное состояние назначения. Конфликт оставлен открытым.");
  }

  const request = assignment
    ? bootstrap.requestBoard.find((item) => item.requestId === assignment.requestId)
    : null;

  await resolveOutboxConflictAsServerWins(ownerUserId, command.clientOperationId, {
    assignmentId: assignment?.assignmentId ?? targetId,
    requestId: assignment?.requestId ?? null,
    assignmentStatus: assignment?.status ?? (assignmentWasCancelled ? "cancelledServer" : null),
    requestStatus: request?.status ?? (assignmentWasCancelled ? "cancelledServer" : null),
    revision: assignment?.revision ?? null,
    startedAtLocal: assignment?.startedAtLocal ?? null,
    completedAtLocal: assignment?.completedAtLocal ?? null
  });
}
export async function retryConflictWithLatestRevision(ownerUserId: string, command: SyncQueueCommandItem) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("Сессия истекла. Сначала войдите повторно.");
  }
  if (command.commandType !== "completePatrolAssignment" || command.entityType !== "patrolAssignment" || !command.entityLocalId) {
    throw new Error("Для этой конфликтной команды повтор с новой ревизией не поддерживается.");
  }

  const bootstrap = await getBootstrap(accessToken);
  if (bootstrap.contourId !== currentContourId || bootstrap.user.serverUserId !== ownerUserId) {
    throw new Error("Состояние сервера относится к другому контуру или пользователю.");
  }
  const assignment = bootstrap.assignments.find((item) => item.assignmentId === command.entityLocalId);
  if (!assignment) {
    throw new Error("Назначение больше недоступно на сервере. Оставьте конфликт на решение диспетчера.");
  }

  await retryOutboxConflictWithRevision(ownerUserId, command.clientOperationId, assignment.revision);
}
export async function sendConflictToDispatcher(ownerUserId: string, command: SyncQueueCommandItem) {
  await markOutboxConflictForDispatcher(
    ownerUserId,
    command.clientOperationId,
    "Конфликт сохранён на телефоне и передан на решение диспетчера."
  );
}

export async function cancelRejectedCommand(ownerUserId: string, command: SyncQueueCommandItem) {
  await cancelRejectedOutboxCommand(
    ownerUserId,
    command.clientOperationId,
    command.lastError ?? "Отклонённое локальное действие отменено пользователем."
  );
}
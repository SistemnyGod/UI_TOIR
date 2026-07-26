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
import { isPatrolAssignmentCommand, resolvePatrolAssignmentIdentity } from "@/db/repositories/outboxPolicies";
import { SyncQueueCommandItem } from "@/db/repositories/outboxTypes";

export function canAcceptServerConflict(command: Pick<SyncQueueCommandItem, "commandType" | "entityType" | "entityLocalId">) {
  return isPatrolAssignmentCommand({
    commandType: command.commandType,
    entityType: command.entityType,
    entityLocalId: command.entityLocalId,
    payload: null
  });
}

export async function acceptServerConflict(ownerUserId: string, command: SyncQueueCommandItem) {
  if (!canAcceptServerConflict(command)) {
    throw new Error("\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u043d\u0435\u043b\u044c\u0437\u044f \u043f\u0440\u0438\u043d\u044f\u0442\u044c \u0434\u043b\u044f \u044d\u0442\u043e\u0439 \u0441\u0443\u0449\u043d\u043e\u0441\u0442\u0438 \u0431\u0435\u0437 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0435\u0451 \u0430\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0445 \u0434\u0430\u043d\u043d\u044b\u0445. \u041f\u0435\u0440\u0435\u0434\u0430\u0439\u0442\u0435 \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442 \u0434\u0438\u0441\u043f\u0435\u0442\u0447\u0435\u0440\u0443 \u0438\u043b\u0438 \u043e\u0442\u043c\u0435\u043d\u0438\u0442\u0435 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435.");
  }
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
  const assignmentCommandInput = {
    commandType: command.commandType,
    entityType: command.entityType,
    entityLocalId: targetId,
    payload: null
  };
  const isAssignmentCommand = isPatrolAssignmentCommand(assignmentCommandInput);
  const assignmentId = resolvePatrolAssignmentIdentity(assignmentCommandInput);
  const assignment = assignmentId
    ? bootstrap.assignments.find((item) => item.assignmentId === assignmentId)
    : null;
  const assignmentWasCancelled = isAssignmentCommand
    && Boolean(assignmentId && bootstrap.cancelledAssignmentIds?.includes(assignmentId));

  if (isAssignmentCommand && !assignmentId) {
    throw new Error("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0438\u0442\u044c \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u043a\u043e\u043d\u0444\u043b\u0438\u043a\u0442\u043d\u043e\u0439 \u043a\u043e\u043c\u0430\u043d\u0434\u044b. \u041a\u043e\u043d\u0444\u043b\u0438\u043a\u0442 \u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d \u043e\u0442\u043a\u0440\u044b\u0442\u044b\u043c.");
  }
  if (isAssignmentCommand && !assignment && !assignmentWasCancelled) {
    throw new Error("\u0421\u0435\u0440\u0432\u0435\u0440 \u043d\u0435 \u0432\u0435\u0440\u043d\u0443\u043b \u0430\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u043e\u0435 \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f. \u041a\u043e\u043d\u0444\u043b\u0438\u043a\u0442 \u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d \u043e\u0442\u043a\u0440\u044b\u0442\u044b\u043c.");
  }

  const request = assignment
    ? bootstrap.requestBoard.find((item) => item.requestId === assignment.requestId)
    : null;

  await resolveOutboxConflictAsServerWins(ownerUserId, command.clientOperationId, {
    assignmentId: assignment?.assignmentId ?? assignmentId,
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
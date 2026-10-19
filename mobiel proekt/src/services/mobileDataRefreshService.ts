import { refreshStoredAccessTokenIfNeeded } from "@/api/httpClient";
import { getBootstrap } from "@/api/mobileApi";
import { assertDataOwnerContext, captureDataOwnerContext, StaleDataOwnerContextError, type DataOwnerContext } from "@/auth/dataOwnerContext";
import { hasUsableNetwork } from "@/core/network";
import { saveBootstrap } from "@/db/repositories/bootstrapRepository";
import { refreshPatrolAppealsPage } from "@/db/repositories/patrolAppealRepository";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { logMobileError } from "@/services/mobileErrorReporter";
import { refreshPushRegistrationIfAllowed, syncMobileNotifications } from "@/services/notificationService";
import { syncWorkItems } from "@/services/workTaskService";
import { emitSyncEvent } from "@/sync/syncEvents";

let activeRefresh: { context: DataOwnerContext; promise: Promise<boolean> } | null = null;

export async function refreshMobileData() {
  const context = await captureDataOwnerContext();
  if (activeRefresh && activeRefresh.context.ownerUserId === context.ownerUserId
    && activeRefresh.context.contourId === context.contourId
    && activeRefresh.context.generation === context.generation) {
    return activeRefresh.promise;
  }

  const promise: Promise<boolean> = refreshMobileDataInternal(context).catch(async error => {
    const sessionChanged = error instanceof StaleDataOwnerContextError
      || (error instanceof Error && error.name === "StaleAuthResponseError");
    if (!sessionChanged) throw error;
    const current = await captureDataOwnerContext();
    // Restart a read for the same employee after reauthentication. A response
    // from a different account is still rejected and is never saved.
    if (current.ownerUserId !== context.ownerUserId || current.contourId !== context.contourId) throw error;
    if (activeRefresh && activeRefresh.context.ownerUserId === current.ownerUserId
      && activeRefresh.context.contourId === current.contourId && activeRefresh.context.generation === current.generation
      && activeRefresh.promise !== promise) return activeRefresh.promise;
    return refreshMobileDataInternal(current);
  }).finally(() => {
    if (activeRefresh?.promise === promise) activeRefresh = null;
  });
  activeRefresh = { context, promise };
  return promise;
}

async function refreshMobileDataInternal(context: DataOwnerContext) {
  if (!(await hasUsableNetwork())) {
    void logMobileAction({
      eventType: "mobile.refresh.skipped",
      entityType: "bootstrap",
      message: "Обновление данных пропущено: сеть недоступна."
    }).catch(() => undefined);
    return false;
  }

  const accessToken = await refreshStoredAccessTokenIfNeeded();
  await assertDataOwnerContext(context);
  if (!accessToken) {
    void logMobileAction({
      eventType: "mobile.refresh.skipped",
      entityType: "bootstrap",
      message: "Обновление данных пропущено: требуется подтверждение серверной сессии."
    }).catch(() => undefined);
    return false;
  }

  await assertDataOwnerContext(context);
  const bootstrap = await getBootstrap(undefined, { patrolAppealsPaging: true, workItemsPaging: true });
  await assertDataOwnerContext(context);
  const snapshotUpdated = await saveBootstrap(bootstrap, { context });
  await assertDataOwnerContext(context);
  if (snapshotUpdated) {
    await assertDataOwnerContext(context);
    emitSyncEvent({
      acceptedOperationIds: [],
      completedAssignmentIds: [],
      cancelledAssignmentIds: bootstrap.cancelledAssignmentIds ?? [],
      snapshotRefreshed: true,
      refreshedZones: ["requests", "activePatrols", "points", "references"]
    });
  }
  // Google push services are optional and may be unreachable on the plant LAN.
  // Neither their registration nor appeal paging may delay publishing requests.
  void refreshPushRegistrationIfAllowed().catch(error => {
    void logMobileError("mobile.refresh.push-registration.failed", error);
  });
  if (bootstrap.patrolAppealsPaging) {
    await refreshPatrolAppealsPage().catch((error) => {
      void logMobileError("mobile.refresh.patrol-appeals.failed", error);
    });
  }
  const refreshTasks = [
    { name: "notifications", task: syncMobileNotifications() },
    { name: "work-items", task: syncWorkItems() }
  ] as const;
  const refreshResults = await Promise.allSettled(refreshTasks.map(({ task }) => task));
  await assertDataOwnerContext(context);
  const failedTasks = refreshResults.flatMap((result, index) =>
    result.status === "rejected" ? [{ name: refreshTasks[index].name, reason: result.reason }] : []
  );
  for (const failedTask of failedTasks) {
    void logMobileError(`mobile.refresh.${failedTask.name}.failed`, failedTask.reason);
  }
  // Notification sync publishes its own event only when local data changes.
  const completedZones = refreshTasks.flatMap((task, index) => refreshResults[index]?.status === "fulfilled" && task.name === "work-items" ? ["workItems"] : []);
  if (completedZones.length > 0) {
    emitSyncEvent({
      acceptedOperationIds: [],
      completedAssignmentIds: [],
      refreshedZones: completedZones as ("workItems" | "notifications")[]
    });
  }
  if (failedTasks.length > 0) {
    void logMobileAction({
      eventType: "mobile.refresh.partial",
      entityType: "bootstrap",
      message: "Часть мобильных данных не обновилась.",
      payload: { failedTasks: failedTasks.map(({ name }) => name) }
    }).catch(() => undefined);
    return false;
  }

  void logMobileAction({
    eventType: "mobile.refresh.completed",
    entityType: "bootstrap",
    message: "Данные смены обновлены с сервера.",
    payload: {
      requestCount: bootstrap.requestBoard.length,
      assignmentCount: bootstrap.assignments.length,
      routeCount: bootstrap.routes.length,
      snapshotUpdated
    }
  }).catch(() => undefined);

  return true;
}

import { getBootstrap } from "@/api/mobileApi";
import { getAccessToken } from "@/auth/tokenStorage";
import { hasUsableNetwork } from "@/core/network";
import { saveBootstrap } from "@/db/repositories/bootstrapRepository";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { logMobileError } from "@/services/mobileErrorReporter";
import { refreshPushRegistrationIfAllowed, syncMobileNotifications } from "@/services/notificationService";
import { syncWorkItems } from "@/services/workTaskService";
import { emitSyncEvent } from "@/sync/syncEvents";

let refreshPromise: Promise<boolean> | null = null;

export async function refreshMobileData() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = refreshMobileDataInternal().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function refreshMobileDataInternal() {
  const accessToken = await getAccessToken();
  if (!accessToken || !(await hasUsableNetwork())) {
    void logMobileAction({
      eventType: "mobile.refresh.skipped",
      entityType: "bootstrap",
      message: "Обновление данных пропущено: нет сети или активной сессии."
    }).catch(() => undefined);
    return false;
  }

  try {
    await refreshPushRegistrationIfAllowed();
  } catch (error) {
    void logMobileError("mobile.refresh.push-registration.failed", error);
  }

  const bootstrap = await getBootstrap(accessToken);
  const snapshotUpdated = await saveBootstrap(bootstrap);
  emitSyncEvent({
    acceptedOperationIds: [],
    completedAssignmentIds: [],
    cancelledAssignmentIds: bootstrap.cancelledAssignmentIds ?? [],
    snapshotRefreshed: true
  });
  const refreshTasks = [
    { name: "notifications", task: syncMobileNotifications() },
    { name: "work-items", task: syncWorkItems() }
  ] as const;
  const refreshResults = await Promise.allSettled(refreshTasks.map(({ task }) => task));
  const failedTasks = refreshResults.flatMap((result, index) =>
    result.status === "rejected" ? [{ name: refreshTasks[index].name, reason: result.reason }] : []
  );
  for (const failedTask of failedTasks) {
    void logMobileError(`mobile.refresh.${failedTask.name}.failed`, failedTask.reason);
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

import { getBootstrap } from "@/api/mobileApi";
import { getAccessToken } from "@/auth/tokenStorage";
import { hasUsableNetwork } from "@/core/network";
import { saveBootstrap } from "@/db/repositories/bootstrapRepository";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
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

  await refreshPushRegistrationIfAllowed().catch(() => null);

  const bootstrap = await getBootstrap(accessToken);
  const snapshotUpdated = await saveBootstrap(bootstrap);
  emitSyncEvent({
    acceptedOperationIds: [],
    completedAssignmentIds: [],
    cancelledAssignmentIds: bootstrap.cancelledAssignmentIds ?? []
  });
  await Promise.all([
    syncMobileNotifications().catch(() => []),
    syncWorkItems().catch(() => [])
  ]);

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

import { getBootstrap } from "@/api/mobileApi";
import { getAccessToken } from "@/auth/tokenStorage";
import { hasUsableNetwork } from "@/core/network";
import { saveBootstrap } from "@/db/repositories/bootstrapRepository";
import { syncMobileNotifications } from "@/services/notificationService";
import { syncWorkTasks } from "@/services/workTaskService";

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
    return false;
  }

  const bootstrap = await getBootstrap(accessToken);
  await saveBootstrap(bootstrap);
  await Promise.all([
    syncMobileNotifications().catch(() => []),
    syncWorkTasks().catch(() => [])
  ]);

  return true;
}

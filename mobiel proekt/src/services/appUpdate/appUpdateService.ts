import { useSyncExternalStore } from "react";

import { fetchAppUpdateManifest } from "@/api/appUpdateApi";
import { getInstalledAppVersion } from "@/core/appVersion";
import { getMobileRuntimeConfig } from "@/core/serverSettings";
import { expoApkFileSystem } from "@/services/appUpdate/apkFiles";
import { createAppUpdateController, type AppUpdateState } from "@/services/appUpdate/appUpdateController";
import { subscribeToServerAppUpdateRequired } from "@/services/appUpdate/appUpdateEvents";
import { logMobileError } from "@/services/mobileErrorReporter";

export const appUpdateController = createAppUpdateController({
  installed: getInstalledAppVersion,
  fetchManifest: fetchAppUpdateManifest,
  contourId: async () => (await getMobileRuntimeConfig()).contourId,
  files: expoApkFileSystem,
  log: (event, error) => { void logMobileError(event, error); }
});

subscribeToServerAppUpdateRequired(() => appUpdateController.handleServerRequiresUpdate());

export function useAppUpdateState(): AppUpdateState {
  return useSyncExternalStore(appUpdateController.subscribe, appUpdateController.getState, appUpdateController.getState);
}

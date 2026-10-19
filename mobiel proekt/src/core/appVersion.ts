import Constants from "expo-constants";

import { parseVersionCode } from "@/domain/appUpdate/appUpdatePolicy";

export type InstalledAppVersion = {
  versionName: string | null;
  versionCode: number | null;
};

/**
 * The version of the installed APK. Native values come from the package
 * itself; the embedded Expo config is a fallback for development builds.
 */
export function getInstalledAppVersion(): InstalledAppVersion {
  return {
    versionName: Constants.nativeAppVersion?.trim() || Constants.expoConfig?.version?.trim() || null,
    versionCode: parseVersionCode(Constants.nativeBuildVersion)
      ?? parseVersionCode(Constants.expoConfig?.android?.versionCode)
  };
}

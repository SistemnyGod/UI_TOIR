import Constants from "expo-constants";
import { Platform } from "react-native";

import { postDailyDiagnosticReport } from "@/api/mobileApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import {
  getOrCreatePendingDiagnosticReport,
  markDiagnosticReportFailed,
  markDiagnosticReportSent
} from "@/db/repositories/diagnosticReportRepository";
import { hasUsableNetwork } from "@/core/network";

let activeUpload: Promise<boolean> | null = null;

export function triggerDailyDiagnosticReportUpload() {
  activeUpload ??= uploadDailyDiagnosticReport().finally(() => {
    activeUpload = null;
  });
  return activeUpload;
}

async function uploadDailyDiagnosticReport() {
  if (!(await hasUsableNetwork())) {
    return false;
  }

  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return false;
  }

  const report = await getOrCreatePendingDiagnosticReport(ownerUserId, {
    deviceId: await getOrCreateDeviceId(),
    appVersion: Constants.expoConfig?.version ?? "unknown",
    platform: `Android ${String(Platform.Version)}`
  });
  if (!report) {
    return false;
  }

  try {
    await postDailyDiagnosticReport(report);
    await markDiagnosticReportSent(report);
    return true;
  } catch (error) {
    await markDiagnosticReportFailed(report.reportId, error instanceof Error ? error.message : String(error));
    return false;
  }
}

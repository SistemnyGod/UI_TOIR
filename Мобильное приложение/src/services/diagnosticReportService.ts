import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { postDailyDiagnosticReport } from "@/api/mobileApi";
import { getOrCreateDeviceId } from "@/auth/deviceRegistration";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import {
  getOrCreatePendingDiagnosticReport,
  listDiagnosticReports,
  markDiagnosticReportFailed,
  markDiagnosticReportSent
} from "@/db/repositories/diagnosticReportRepository";
import { hasUsableNetwork } from "@/core/network";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";

let activeUpload: Promise<DiagnosticUploadResult> | null = null;
const automaticDiagnosticsKey = "patrol360.diagnostics.automaticUpload";

export type DiagnosticUploadResult =
  | { status: "sent"; reportId: string }
  | { status: "notDue" }
  | { status: "disabled" }
  | { status: "offline" }
  | { status: "unauthenticated" }
  | { status: "failed"; message: string };

export function triggerDailyDiagnosticReportUpload() {
  activeUpload ??= uploadDailyDiagnosticReport().finally(() => {
    activeUpload = null;
  });
  return activeUpload;
}

export async function isAutomaticDiagnosticUploadEnabled() {
  const stored = await SecureStore.getItemAsync(automaticDiagnosticsKey);
  return stored !== "false";
}

export async function setAutomaticDiagnosticUploadEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(automaticDiagnosticsKey, enabled ? "true" : "false");
}

export async function triggerManualDiagnosticReportUpload() {
  return uploadDiagnosticReport({ force: true, includeEmpty: true, respectAutomaticSetting: false });
}

export async function runSafeDiagnosticTest() {
  await logMobileAction({
    eventType: "diagnostic.test.error",
    entityType: "mobileApp",
    message: "Тестовая диагностическая ошибка. Пользователь запустил проверку отправки логов вручную."
  });

  return triggerManualDiagnosticReportUpload();
}

export async function getDiagnosticSettingsSnapshot() {
  const [automaticUploadEnabled, recentReports] = await Promise.all([
    isAutomaticDiagnosticUploadEnabled(),
    listDiagnosticReports(5)
  ]);

  return { automaticUploadEnabled, recentReports };
}

async function uploadDailyDiagnosticReport() {
  return uploadDiagnosticReport({ force: false, includeEmpty: false, respectAutomaticSetting: true });
}

async function uploadDiagnosticReport(options: {
  force: boolean;
  includeEmpty: boolean;
  respectAutomaticSetting: boolean;
}): Promise<DiagnosticUploadResult> {
  if (options.respectAutomaticSetting && !(await isAutomaticDiagnosticUploadEnabled())) {
    return { status: "disabled" };
  }

  if (!(await hasUsableNetwork())) {
    return { status: "offline" };
  }

  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return { status: "unauthenticated" };
  }

  const report = await getOrCreatePendingDiagnosticReport(ownerUserId, {
    deviceId: await getOrCreateDeviceId(),
    appVersion: Constants.expoConfig?.version ?? "unknown",
    platform: `Android ${String(Platform.Version)}`
  }, new Date(), { force: options.force, includeEmpty: options.includeEmpty });
  if (!report) {
    return { status: "notDue" };
  }

  try {
    await postDailyDiagnosticReport(report);
    await markDiagnosticReportSent(report);
    return { status: "sent", reportId: report.reportId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markDiagnosticReportFailed(report.reportId, message);
    return { status: "failed", message };
  }
}

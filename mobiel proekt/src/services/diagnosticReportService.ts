import * as SecureStore from "expo-secure-store";

import { postDailyDiagnosticReport } from "@/api/mobileApi";
import { getAppRuntimeMetadata } from "@/auth/appMetadata";
import { getStoredOwnerUserId } from "@/auth/tokenStorage";
import {
  MobileDiagnosticReport,
  getPendingDiagnosticReport,
  getOrCreatePendingDiagnosticReport,
  listDiagnosticReports,
  markDiagnosticReportFailed,
  markDiagnosticReportSent
} from "@/db/repositories/diagnosticReportRepository";
import { hasUsableNetwork } from "@/core/network";
import { logMobileAction } from "@/db/repositories/mobileActionLogRepository";
import { collectDiagnosticContext } from "@/services/diagnosticContextService";

type DiagnosticUploadKind = "daily" | "pending" | "manual";
type QueuedDiagnosticUpload = {
  kind: DiagnosticUploadKind;
  upload: () => Promise<DiagnosticUploadResult>;
  promise: Promise<DiagnosticUploadResult>;
  resolve: (result: DiagnosticUploadResult) => void;
  reject: (error: unknown) => void;
};

let activeUpload: Promise<DiagnosticUploadResult> | null = null;
let activeUploadKind: DiagnosticUploadKind | null = null;
let queuedUpload: QueuedDiagnosticUpload | null = null;
const automaticDiagnosticsKey = "patrol360.diagnostics.automaticUpload";

export type DiagnosticUploadResult =
  | { status: "sent"; reportId: string }
  | { status: "notDue" }
  | { status: "disabled" }
  | { status: "offline"; reportId?: string }
  | { status: "queued"; reportId: string }
  | { status: "unauthenticated" }
  | { status: "failed"; message: string };

export function triggerDailyDiagnosticReportUpload() {
  return scheduleDiagnosticUpload("daily", uploadDailyDiagnosticReport);
}

export function triggerPendingDiagnosticReportUpload() {
  return scheduleDiagnosticUpload("pending", uploadPendingDiagnosticReport);
}


function scheduleDiagnosticUpload(
  kind: DiagnosticUploadKind,
  upload: () => Promise<DiagnosticUploadResult>
) {
  if (activeUpload) {
    if (kind !== "manual" || activeUploadKind === "manual") {
      return activeUpload;
    }
    if (queuedUpload) {
      return queuedUpload.promise;
    }

    let resolve!: (result: DiagnosticUploadResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<DiagnosticUploadResult>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    queuedUpload = { kind, upload, promise, resolve, reject };
    return promise;
  }

  let request!: Promise<DiagnosticUploadResult>;
  request = (async () => {
    try {
      return await upload();
    } catch (error) {
      return {
        status: "failed" as const,
        message: error instanceof Error ? error.message : "Не удалось подготовить диагностический отчёт."
      };
    }
  })().finally(() => {
    if (activeUpload !== request) {
      return;
    }

    activeUpload = null;
    activeUploadKind = null;
    const nextUpload = queuedUpload;
    queuedUpload = null;
    if (nextUpload) {
      scheduleDiagnosticUpload(nextUpload.kind, nextUpload.upload)
        .then(nextUpload.resolve, nextUpload.reject);
    }
  });

  activeUpload = request;
  activeUploadKind = kind;
  return request;
}
export async function isAutomaticDiagnosticUploadEnabled() {
  const stored = await SecureStore.getItemAsync(automaticDiagnosticsKey);
  return stored !== "false";
}

export async function setAutomaticDiagnosticUploadEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(automaticDiagnosticsKey, enabled ? "true" : "false");
}

export function triggerManualDiagnosticReportUpload() {
  return scheduleDiagnosticUpload("manual", () =>
    uploadDiagnosticReport({ force: true, includeEmpty: true, respectAutomaticSetting: false })
  );
}

export function triggerReportDeliveryDiagnostic() {
  return scheduleDiagnosticUpload("manual", async () => {
    await logMobileAction({
      eventType: "diagnostic.report_delivery.threshold",
      entityType: "mobileApp",
      message: "Отчёт не доставлен после трёх онлайн-попыток. Подготовлена безопасная диагностика без содержимого отчёта."
    });
    return uploadDiagnosticReport({ force: true, includeEmpty: true, respectAutomaticSetting: false });
  });
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


  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return { status: "unauthenticated" };
  }

  const runtimeMetadata = getAppRuntimeMetadata();
  const report = await getOrCreatePendingDiagnosticReport(ownerUserId, {
    appVersion: runtimeMetadata.appVersion,
    platform: runtimeMetadata.platform
  }, new Date(), {
    force: options.force,
    includeEmpty: options.includeEmpty,
    context: await collectDiagnosticContext()
  });
  if (!report) {
    return { status: "notDue" };
  }

  if (!(await hasUsableNetwork())) {
    return { status: "queued", reportId: report.reportId };
  }

  return sendPendingDiagnosticReport(report);
}

async function uploadPendingDiagnosticReport(): Promise<DiagnosticUploadResult> {
  const ownerUserId = await getStoredOwnerUserId();
  if (!ownerUserId) {
    return { status: "unauthenticated" };
  }

  const report = await getPendingDiagnosticReport(ownerUserId);
  if (!report) {
    return { status: "notDue" };
  }

  if (!(await hasUsableNetwork())) {
    return { status: "offline", reportId: report.reportId };
  }

  return sendPendingDiagnosticReport(report);
}

async function sendPendingDiagnosticReport(report: MobileDiagnosticReport): Promise<DiagnosticUploadResult> {
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

import { mobileRequest } from "@/api/httpClient";
import { BootstrapDto } from "@/domain/patrol/patrolTypes";
import { OutboxCommand, OutboxResponse } from "@/domain/sync/syncTypes";
import { MobileDiagnosticReport } from "@/db/repositories/diagnosticReportRepository";

export function getBootstrap(accessToken?: string) {
  return mobileRequest<BootstrapDto>("/api/v1/mobile/bootstrap", {
    accessToken
  });
}

export function postOutbox(commands: OutboxCommand[]) {
  return mobileRequest<OutboxResponse[]>("/api/v1/mobile/outbox", {
    method: "POST",
    body: { commands }
  });
}

export function getOutboxResult(clientOperationId: string) {
  return mobileRequest<OutboxResponse>(`/api/v1/mobile/outbox/${clientOperationId}`);
}

export function postDailyDiagnosticReport(report: MobileDiagnosticReport) {
  return mobileRequest<{ reportId: string; status: "stored" | "duplicate"; storedAt: string }>(
    "/api/v1/mobile/diagnostics/daily",
    { method: "POST", body: report }
  );
}

import { mobileRequest } from "@/api/httpClient";
import { BootstrapDto } from "@/domain/patrol/patrolTypes";
import { OutboxCommand, OutboxResponse } from "@/domain/sync/syncTypes";
import { MobileDiagnosticReport } from "@/db/repositories/diagnosticReportRepository";

export function getBootstrap(accessToken?: string) {
  return mobileRequest<BootstrapDto>("/api/v1/mobile/bootstrap", {
    accessToken
  });
}

export async function postOutbox(commands: OutboxCommand[]) {
  const response = await mobileRequest<unknown>("/api/v1/mobile/outbox", {
    method: "POST",
    body: { commands }
  });

  return validateOutboxResponses(response, commands);
}

export function validateOutboxResponses(value: unknown, commands: OutboxCommand[]): OutboxResponse[] {
  if (!Array.isArray(value)) {
    throw new Error("Сервер вернул некорректный ответ очереди. Данные сохранены и будут повторены.");
  }

  const expectedIds = new Set(commands.map((command) => command.clientOperationId));
  const responseIds = new Set<string>();
  const allowedStatuses = new Set<OutboxResponse["status"]>([
    "accepted",
    "duplicate",
    "retryLater",
    "rejected",
    "conflict"
  ]);

  if (value.length !== expectedIds.size) {
    throw new Error("Сервер вернул неполный ответ очереди. Данные сохранены и будут повторены.");
  }

  for (const item of value) {
    if (!isRecord(item)
      || typeof item.clientOperationId !== "string"
      || !expectedIds.has(item.clientOperationId)
      || responseIds.has(item.clientOperationId)
      || typeof item.status !== "string"
      || !allowedStatuses.has(item.status as OutboxResponse["status"])
      || typeof item.message !== "string"
      || (item.serverEntityId !== null && typeof item.serverEntityId !== "string")
      || (item.serverRevision !== null && typeof item.serverRevision !== "number")
      || (item.conflictId !== null && typeof item.conflictId !== "string")
      || (item.retryAfterSeconds !== null && typeof item.retryAfterSeconds !== "number")) {
      throw new Error("Сервер вернул некорректный ответ операции. Данные сохранены и будут повторены.");
    }

    responseIds.add(item.clientOperationId);
  }

  if (responseIds.size !== expectedIds.size) {
    throw new Error("Сервер вернул ответ не для всех операций. Данные сохранены и будут повторены.");
  }

  return value as OutboxResponse[];
}

export function getOutboxResult(clientOperationId: string) {
  return mobileRequest<unknown>(`/api/v1/mobile/outbox/${clientOperationId}`).then((response) =>
    validateOutboxResponse(response, clientOperationId)
  );
}

export function validateOutboxResponse(value: unknown, expectedClientOperationId: string) {
  const [response] = validateOutboxResponses([value], [{ clientOperationId: expectedClientOperationId } as OutboxCommand]);
  return response;
}

export function postDailyDiagnosticReport(report: MobileDiagnosticReport) {
  return mobileRequest<unknown>(
    "/api/v1/mobile/diagnostics/daily",
    { method: "POST", body: report }
  ).then((response) => validateDiagnosticReportReceipt(response, report.reportId));
}

export function validateDiagnosticReportReceipt(value: unknown, expectedReportId: string) {
  if (!isRecord(value)
    || value.reportId !== expectedReportId
    || (value.status !== "stored" && value.status !== "duplicate")
    || typeof value.storedAt !== "string"
    || Number.isNaN(Date.parse(value.storedAt))) {
    throw new Error("Сервер вернул некорректное подтверждение диагностического отчёта. Отчёт сохранён и будет повторен.");
  }

  return value as { reportId: string; status: "stored" | "duplicate"; storedAt: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

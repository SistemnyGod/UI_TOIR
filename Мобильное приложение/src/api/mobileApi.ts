import { mobileRequest } from "@/api/httpClient";
import { BootstrapDto } from "@/domain/patrol/patrolTypes";
import { OutboxCommand, OutboxResponse } from "@/domain/sync/syncTypes";

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

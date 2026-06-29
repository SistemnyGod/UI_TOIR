import { ApiClient, type ApiRequestOptions } from "../api/client";
import type {
  MobileDeviceHealthDto,
  MobileSyncConflictDetailDto,
  MobileSyncConflictListItemDto,
  MobileSyncConflictResolutionDto,
  MobileSyncConflictResolutionRequestDto,
} from "../api/contracts";
import type { MobileDeviceHealth, MobileSyncConflict } from "../types";

export function createApiMobileSyncRepository({
  baseUrl,
  fetcher,
}: {
  baseUrl?: string;
  fetcher?: typeof fetch;
} = {}) {
  const client = new ApiClient({ baseUrl, fetcher });

  return {
    async getConflicts(options: ApiRequestOptions = {}) {
      const rows = await client.get<MobileSyncConflictListItemDto[]>("/api/v1/mobile-sync/conflicts", options);
      return rows.map(mapConflict);
    },

    async getDeviceHealth(options: ApiRequestOptions = {}) {
      const rows = await client.get<MobileDeviceHealthDto[]>("/api/v1/mobile-sync/device-health", options);
      return rows.map(mapDeviceHealth);
    },

    async getConflict(clientOperationId: string, options: ApiRequestOptions = {}) {
      const row = await client.get<MobileSyncConflictDetailDto>(`/api/v1/mobile-sync/conflicts/${clientOperationId}`, options);
      return mapConflict(row);
    },

    resolveConflict(
      clientOperationId: string,
      payload: MobileSyncConflictResolutionRequestDto,
      options: ApiRequestOptions = {},
    ) {
      return client.post<MobileSyncConflictResolutionDto, MobileSyncConflictResolutionRequestDto>(
        `/api/v1/mobile-sync/conflicts/${clientOperationId}/resolution`,
        payload,
        options,
      );
    },
  };
}

function mapDeviceHealth(row: MobileDeviceHealthDto): MobileDeviceHealth {
  return {
    mobileAccountId: row.mobileAccountId,
    login: row.login,
    deviceId: row.deviceId,
    deviceName: row.deviceName,
    appVersion: row.appVersion,
    lastSeenAt: row.lastSeenAt ? formatDateTime(row.lastSeenAt) : null,
    pushStatus: row.pushStatus,
    pendingOutboxCount: row.pendingOutboxCount,
    staleOutboxCount: row.staleOutboxCount,
    lastError: row.lastError,
  };
}

function mapConflict(row: MobileSyncConflictListItemDto | MobileSyncConflictDetailDto): MobileSyncConflict {
  return {
    clientOperationId: row.clientOperationId,
    mobileAccountId: row.mobileAccountId,
    accountLogin: row.accountLogin,
    commandType: row.commandType,
    entityType: row.entityType,
    entityServerId: row.entityServerId,
    message: row.message,
    payloadSnapshot: row.payloadSnapshot,
    responseSnapshot: "responseSnapshot" in row ? row.responseSnapshot : undefined,
    createdAtServer: formatDateTime(row.createdAtServer),
    status: row.status,
    attemptCount: "attemptCount" in row ? row.attemptCount : undefined,
    operationStatus: "operationStatus" in row ? row.operationStatus : undefined,
    resolutionComment: "resolutionComment" in row ? row.resolutionComment : undefined,
    resolvedBy: "resolvedBy" in row ? row.resolvedBy : undefined,
    resolvedAt: "resolvedAt" in row && row.resolvedAt ? formatDateTime(row.resolvedAt) : undefined,
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

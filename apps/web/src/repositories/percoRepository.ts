import { ApiClient } from "../api/client";
import type {
  ClosePercoPresenceIntervalDto,
  MatchPercoEmployeeDto,
  PercoConnectionTestResultDto,
  PercoDiagnosticsDto,
  PercoIntegrationLogDto,
  PercoIntegrationSettingsDto,
  PercoSecretStatusDto,
  PercoSyncResultDto,
  PercoUnmatchedEmployeeDto,
  UpdatePercoIntegrationSettingsDto,
} from "../api/contracts";

export function createPercoRepository({ baseUrl }: { baseUrl?: string } = {}) {
  const client = new ApiClient({ baseUrl });

  return {
    getSettings() {
      return client.get<PercoIntegrationSettingsDto>("/api/v1/integrations/perco/settings");
    },

    updateSettings(payload: UpdatePercoIntegrationSettingsDto) {
      return client.put<PercoIntegrationSettingsDto, UpdatePercoIntegrationSettingsDto>(
        "/api/v1/integrations/perco/settings",
        payload,
      );
    },

    testConnection() {
      return client.post<PercoConnectionTestResultDto>("/api/v1/integrations/perco/test-connection");
    },

    checkSecret() {
      return client.post<PercoSecretStatusDto>("/api/v1/integrations/perco/check-secret");
    },

    syncEmployees() {
      return client.post<PercoSyncResultDto>("/api/v1/integrations/perco/sync-employees");
    },

    syncEvents() {
      return client.post<PercoSyncResultDto>("/api/v1/integrations/perco/sync-events");
    },

    getUnmatchedEmployees() {
      return client.get<ReadonlyArray<PercoUnmatchedEmployeeDto>>("/api/v1/integrations/perco/unmatched-employees");
    },

    matchEmployee(payload: MatchPercoEmployeeDto) {
      return client.post<PercoSyncResultDto, MatchPercoEmployeeDto>("/api/v1/integrations/perco/match-employee", payload);
    },

    getLogs(take = 100) {
      return client.get<ReadonlyArray<PercoIntegrationLogDto>>(`/api/v1/integrations/perco/logs?take=${take}`);
    },

    getDiagnostics(take = 100) {
      return client.get<PercoDiagnosticsDto>(`/api/v1/integrations/perco/diagnostics?take=${take}`);
    },

    closePresenceInterval(intervalId: string, payload: ClosePercoPresenceIntervalDto) {
      return client.patch<PercoSyncResultDto, ClosePercoPresenceIntervalDto>(
        `/api/v1/integrations/perco/presence-intervals/${intervalId}/close`,
        payload,
      );
    },
  };
}

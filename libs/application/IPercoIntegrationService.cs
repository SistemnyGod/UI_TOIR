using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IPercoIntegrationService
{
    Task<PercoIntegrationSettingsDto> GetSettingsAsync(CancellationToken cancellationToken = default);

    Task<PercoIntegrationSettingsDto> UpdateSettingsAsync(
        UpdatePercoIntegrationSettingsDto request,
        Guid? actorUserId,
        CancellationToken cancellationToken = default);

    Task<PercoConnectionTestResultDto> TestConnectionAsync(
        Guid? actorUserId,
        CancellationToken cancellationToken = default);

    Task<PercoSecretStatusDto> CheckSecretStatusAsync(
        string component,
        CancellationToken cancellationToken = default);

    Task<PercoSyncResultDto> SyncEmployeesAsync(
        Guid? actorUserId,
        CancellationToken cancellationToken = default);

    Task<PercoSyncResultDto> SyncEventsAsync(
        Guid? actorUserId,
        CancellationToken cancellationToken = default);

    Task<int> RunAutomaticSyncIfDueAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PercoUnmatchedEmployeeDto>> GetUnmatchedEmployeesAsync(CancellationToken cancellationToken = default);

    Task<PercoSyncResultDto> MatchEmployeeAsync(
        MatchPercoEmployeeDto request,
        Guid? actorUserId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PercoIntegrationLogDto>> GetLogsAsync(
        int take = 100,
        CancellationToken cancellationToken = default);

    Task<PercoDiagnosticsDto> GetDiagnosticsAsync(
        int take = 100,
        CancellationToken cancellationToken = default);

    Task<PercoSyncResultDto> ClosePresenceIntervalAsync(
        Guid intervalId,
        ClosePercoPresenceIntervalDto request,
        Guid? actorUserId,
        CancellationToken cancellationToken = default);
}

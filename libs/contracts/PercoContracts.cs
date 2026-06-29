namespace Patrol360.Contracts;

public sealed record PercoIntegrationSettingsDto(
    bool IsEnabled,
    string AuthMode,
    string BaseUrl,
    string? Username,
    bool HasPassword,
    bool HasToken,
    string Timezone,
    int EmployeesSyncMinutes,
    int EventsSyncMinutes,
    int ShiftStartToleranceMinutes,
    int ShiftEndToleranceMinutes,
    string DevPath,
    string EmployeesEndpoint,
    string EventsEndpoint,
    string LastDiscoverySummary,
    DateTimeOffset? LastConnectionCheckAt,
    string? LastConnectionStatus,
    string? LastConnectionError,
    PercoSecretStatusDto SecretStatus);

public sealed record UpdatePercoIntegrationSettingsDto(
    bool IsEnabled,
    string? AuthMode,
    string BaseUrl,
    string? Username,
    string? Password,
    string? Token,
    string Timezone,
    int EmployeesSyncMinutes,
    int EventsSyncMinutes,
    int ShiftStartToleranceMinutes,
    int ShiftEndToleranceMinutes,
    string? DevPath,
    string? EmployeesEndpoint,
    string? EventsEndpoint);

public sealed record PercoSecretStatusDto(
    string ApiStatus,
    DateTimeOffset? ApiCheckedAt,
    string? ApiError,
    string WorkerStatus,
    DateTimeOffset? WorkerCheckedAt,
    string? WorkerError);

public sealed record PercoConnectionTestResultDto(
    bool Success,
    string Message,
    bool DevPageAvailable,
    bool AuthAvailable,
    IReadOnlyList<PercoDiscoveredEndpointDto> DiscoveredEndpoints,
    DateTimeOffset CheckedAt);

public sealed record PercoDiscoveredEndpointDto(
    string Kind,
    string Url,
    string Status);

public sealed record PercoSyncResultDto(
    bool Success,
    string Status,
    string Message,
    int Loaded,
    int Created,
    int Updated,
    int Inserted,
    int Duplicates,
    int Unmatched,
    int Errors,
    DateTimeOffset? LastSyncAt = null);

public sealed record PercoIntegrationLogDto(
    Guid Id,
    string Operation,
    string Status,
    string Message,
    string Details,
    DateTimeOffset StartedAt,
    DateTimeOffset? FinishedAt,
    Guid? CreatedByUserId);

public sealed record PercoUnmatchedEmployeeDto(
    string PercoEmployeeId,
    string FullName,
    string PersonnelNo,
    string CardNumber,
    string Department,
    Guid? SuggestedEmployeeId,
    string SuggestedEmployeeName);

public sealed record MatchPercoEmployeeDto(
    string PercoEmployeeId,
    Guid? EmployeeId,
    string Action);

public sealed record PercoDiagnosticsDto(
    DateTimeOffset GeneratedAt,
    DateTimeOffset WindowStart,
    DateTimeOffset WindowEnd,
    int RecentEventsCount,
    int OpenPresenceCount,
    int ClosedPresenceCount,
    int OldOpenPresenceCount,
    int UnmatchedEventsCount,
    IReadOnlyList<PercoAccessEventDiagnosticsDto> RecentEvents,
    IReadOnlyList<PercoPresenceIntervalDiagnosticsDto> PresenceIntervals);

public sealed record ClosePercoPresenceIntervalDto(
    DateTimeOffset EndedAt,
    string Comment);

public sealed record PercoAccessEventDiagnosticsDto(
    Guid Id,
    string PercoEventId,
    string PercoEmployeeId,
    Guid? EmployeeId,
    string EmployeeName,
    string PersonnelNo,
    string DeviceName,
    string Direction,
    string DirectionLabel,
    string ZoneTransition,
    string ShiftMarker,
    DateTimeOffset EventAt);

public sealed record PercoPresenceIntervalDiagnosticsDto(
    Guid Id,
    Guid EmployeeId,
    string EmployeeName,
    string PersonnelNo,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    int DurationMinutes,
    string Source,
    string State,
    string StateCode,
    bool NeedsReview,
    string AnalysisReason,
    string SuggestedAction,
    int AnalysisConfidence);

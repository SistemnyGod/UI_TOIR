namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class PercoIntegrationSettingsEntity
{
    public Guid Id { get; set; }
    public bool IsEnabled { get; set; }
    public string AuthMode { get; set; } = "LoginPassword";
    public string BaseUrl { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string PasswordEncrypted { get; set; } = string.Empty;
    public string TokenEncrypted { get; set; } = string.Empty;
    public string SessionTokenEncrypted { get; set; } = string.Empty;
    public DateTimeOffset? SessionTokenExpiresAt { get; set; }
    public string Timezone { get; set; } = "Asia/Yekaterinburg";
    public int EmployeesSyncMinutes { get; set; } = 60;
    public int EventsSyncMinutes { get; set; } = 5;
    public int ShiftStartToleranceMinutes { get; set; } = 120;
    public int ShiftEndToleranceMinutes { get; set; } = 240;
    public string DevPath { get; set; } = "/dev";
    public string EmployeesEndpoint { get; set; } = "/api/users/staff/fullList";
    public string EventsEndpoint { get; set; } = "/api/accessReports/events";
    public string LastDiscoverySummary { get; set; } = string.Empty;
    public DateTimeOffset? LastConnectionCheckAt { get; set; }
    public string LastConnectionStatus { get; set; } = string.Empty;
    public string LastConnectionError { get; set; } = string.Empty;
    public DateTimeOffset? LastApiSecretCheckAt { get; set; }
    public string LastApiSecretStatus { get; set; } = string.Empty;
    public string LastApiSecretError { get; set; } = string.Empty;
    public DateTimeOffset? LastWorkerSecretCheckAt { get; set; }
    public string LastWorkerSecretStatus { get; set; } = string.Empty;
    public string LastWorkerSecretError { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
}

internal sealed class PercoIntegrationLogEntity
{
    public Guid Id { get; set; }
    public string Operation { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public SiteUserEntity? CreatedByUser { get; set; }
}

internal sealed class PercoSyncStateEntity
{
    public Guid Id { get; set; }
    public string SyncType { get; set; } = string.Empty;
    public DateTimeOffset? LastSuccessAt { get; set; }
    public string LastCursor { get; set; } = string.Empty;
    public string LastError { get; set; } = string.Empty;
    public DateTimeOffset UpdatedAt { get; set; }
}

internal sealed class PercoEmployeeLinkEntity
{
    public Guid Id { get; set; }
    public string PercoEmployeeId { get; set; } = string.Empty;
    public Guid? EmployeeId { get; set; }
    public EmployeeEntity? Employee { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string PersonnelNo { get; set; } = string.Empty;
    public string CardNumber { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public Guid? MatchedByUserId { get; set; }
    public SiteUserEntity? MatchedByUser { get; set; }
    public DateTimeOffset? MatchedAt { get; set; }
    public string MatchStatus { get; set; } = "UNMATCHED";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

internal sealed class PercoAccessEventEntity
{
    public Guid Id { get; set; }
    public string PercoEventId { get; set; } = string.Empty;
    public string PercoEmployeeId { get; set; } = string.Empty;
    public Guid? EmployeeId { get; set; }
    public EmployeeEntity? Employee { get; set; }
    public string DeviceId { get; set; } = string.Empty;
    public string DeviceName { get; set; } = string.Empty;
    public string Direction { get; set; } = "UNKNOWN";
    public DateTimeOffset EventAt { get; set; }
    public string RawPayload { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class EmployeePresenceIntervalEntity
{
    public Guid Id { get; set; }
    public Guid EmployeeId { get; set; }
    public EmployeeEntity Employee { get; set; } = null!;
    public Guid? OpenedByEventId { get; set; }
    public PercoAccessEventEntity? OpenedByEvent { get; set; }
    public Guid? ClosedByEventId { get; set; }
    public PercoAccessEventEntity? ClosedByEvent { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public int DurationMinutes { get; set; }
    public string Source { get; set; } = "PERCO";
    public DateTimeOffset CreatedAt { get; set; }
}

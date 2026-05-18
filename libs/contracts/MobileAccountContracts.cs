namespace Patrol360.Contracts;

public sealed record MobileAccountDto(
    Guid Id,
    string Login,
    string PasswordState,
    string Employee,
    string EmployeeScope,
    IReadOnlyList<Guid> BoundEmployeeIds,
    IReadOnlyList<string> BoundEmployees,
    string Role,
    string Status,
    string Session,
    string LastSeen,
    string Device,
    string Version);

public sealed record MobileAccountCreatedDto(
    MobileAccountDto Account,
    string? TemporaryPassword);

public sealed record CreateMobileAccountDto(
    string? Employee,
    string EmployeeScope,
    string? Login,
    string Role,
    bool BindEmployee,
    bool RestrictToBoundDevice,
    bool TemporaryPassword);

public sealed record UpdateMobileAccountDto(
    string? Login,
    string? Role,
    string? Status);

public sealed record AttachMobileAccountEmployeeDto(
    Guid? EmployeeId,
    string? EmployeeName);

public sealed record ResetMobileAccountPasswordDto(
    string TemporaryPassword,
    DateTimeOffset ResetAt);

public sealed record MobileAccountSessionDto(
    Guid Id,
    Guid AccountId,
    string Status,
    string Device,
    string Platform,
    string AppVersion,
    string IpAddress,
    DateTimeOffset LastSeenAt);

public sealed record MobileAccountSecurityEventDto(
    Guid Id,
    Guid AccountId,
    string EventType,
    string Message,
    DateTimeOffset CreatedAt,
    string Actor);

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
    bool TemporaryPassword,
    string? Password = null,
    string? ConfirmPassword = null,
    string? Status = null,
    string? Language = null,
    bool? RequirePasswordChange = null,
    bool? RestrictToLinkedDevices = null);

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
    string DeviceId,
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

public sealed record AccountBindingInfoDto(
    Guid Id,
    string Name,
    string Code,
    string DeviceType,
    string Status);

public sealed record LinkedEmployeeDto(
    Guid Id,
    string FullName,
    string Position,
    string? AvatarUrl);

public sealed record AvailableEmployeeDto(
    Guid Id,
    string FullName,
    string Role,
    string Department,
    string Area,
    string? AvatarUrl);

public sealed record EmployeeBindingDataDto(
    AccountBindingInfoDto Account,
    IReadOnlyList<LinkedEmployeeDto> LinkedEmployees,
    IReadOnlyList<AvailableEmployeeDto> AvailableEmployees);

public sealed record BindMobileAccountEmployeesDto(
    IReadOnlyList<Guid> EmployeeIds);

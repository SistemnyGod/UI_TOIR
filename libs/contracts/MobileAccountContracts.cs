namespace Patrol360.Contracts;

public sealed record MobileAccountDto(
    Guid Id,
    string Login,
    string PasswordState,
    string Employee,
    string EmployeeScope,
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

public sealed record AttachMobileAccountEmployeeDto(string EmployeeName);

public sealed record ResetMobileAccountPasswordDto(
    string TemporaryPassword,
    DateTimeOffset ResetAt);

namespace Patrol360.Contracts;

public sealed record LoginRequestDto(
    string Login,
    string Password,
    bool RememberMe = false);

public sealed record PermissionDto(
    string Code,
    string Name);

public sealed record SessionUserDto(
    Guid Id,
    string Login,
    string DisplayName,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions,
    bool RequirePasswordChange = false);

public sealed record AuthSessionDto(
    SessionUserDto User,
    string AccessToken,
    DateTimeOffset ExpiresAt,
    bool RequirePasswordChange = false);

public sealed record ChangePasswordDto(
    string CurrentPassword,
    string NewPassword,
    string ConfirmPassword);

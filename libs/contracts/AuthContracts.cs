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
    IReadOnlyList<string> Permissions);

public sealed record AuthSessionDto(
    SessionUserDto User,
    string AccessToken,
    DateTimeOffset ExpiresAt);

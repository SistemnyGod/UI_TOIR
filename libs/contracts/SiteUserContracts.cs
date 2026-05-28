namespace Patrol360.Contracts;

public sealed record SiteUserDto(
    Guid Id,
    string Login,
    string DisplayName,
    IReadOnlyList<string> Roles,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt,
    IReadOnlyList<string> Permissions);

public sealed record RoleDto(
    Guid Id,
    string Code,
    string Name,
    IReadOnlyList<string> Permissions);

public sealed record CreateSiteUserDto(
    string Login,
    string DisplayName,
    IReadOnlyList<string> RoleCodes,
    string Status);

public sealed record SiteUserCreatedDto(
    SiteUserDto User,
    string TemporaryPassword);

public sealed record UpdateSiteUserDto(
    string Login,
    string DisplayName,
    IReadOnlyList<string> RoleCodes,
    string Status);

public sealed record ResetSiteUserPasswordDto(
    string TemporaryPassword,
    DateTimeOffset ResetAt);

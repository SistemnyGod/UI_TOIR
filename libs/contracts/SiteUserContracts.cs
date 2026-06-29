namespace Patrol360.Contracts;

public sealed record SiteUserDto(
    Guid Id,
    string Login,
    string DisplayName,
    IReadOnlyList<string> Roles,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt,
    IReadOnlyList<string> Permissions,
    IReadOnlyList<string> DirectPermissions);

public sealed record SiteUserAccessScopeDto(
    Guid Id,
    string ModuleKey,
    string ScopeType,
    Guid ScopeId,
    string ScopeName);

public sealed record SiteUserAccessDto(
    Guid UserId,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> DirectPermissions,
    IReadOnlyList<string> EffectivePermissions,
    IReadOnlyList<SiteUserAccessScopeDto> Scopes);

public sealed record UpdateSiteUserPermissionsDto(
    IReadOnlyList<string> PermissionCodes);

public sealed record UpdateSiteUserScopesDto(
    IReadOnlyList<SiteUserAccessScopeUpsertDto> Scopes);

public sealed record SiteUserAccessScopeUpsertDto(
    string ModuleKey,
    string ScopeType,
    Guid ScopeId);

public sealed record RoleDto(
    Guid Id,
    string Code,
    string Name,
    IReadOnlyList<string> Permissions);

public sealed record CreateSiteUserDto(
    string Login,
    string DisplayName,
    IReadOnlyList<string> RoleCodes,
    string Status,
    string? InitialPassword = null,
    IReadOnlyList<string>? PermissionCodes = null);

public sealed record SiteUserCreatedDto(
    SiteUserDto User,
    string TemporaryPassword);

public sealed record UpdateSiteUserDto(
    string Login,
    string DisplayName,
    IReadOnlyList<string> RoleCodes,
    string Status,
    IReadOnlyList<string>? PermissionCodes = null);

public sealed record ResetSiteUserPasswordDto(
    string TemporaryPassword,
    DateTimeOffset ResetAt);

namespace Patrol360.Contracts;

public sealed record PermissionOverrideDto(
    string Code,
    string Effect);

public sealed record SiteUserDto(
    Guid Id,
    string Login,
    string DisplayName,
    IReadOnlyList<string> Roles,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt,
    IReadOnlyList<string> Permissions,
    IReadOnlyList<string> DirectPermissions,
    IReadOnlyList<PermissionOverrideDto>? PermissionOverrides = null,
    bool RequirePasswordChange = false);

public sealed record SiteUserAccessScopeDto(
    Guid Id,
    string ModuleKey,
    string ScopeType,
    Guid ScopeId,
    string ScopeName,
    int SortOrder = 0);

public sealed record SiteUserAccessDto(
    Guid UserId,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> DirectPermissions,
    IReadOnlyList<string> EffectivePermissions,
    IReadOnlyList<SiteUserAccessScopeDto> Scopes,
    IReadOnlyList<PermissionOverrideDto>? PermissionOverrides = null,
    string ScopeMode = "selected");

public sealed record UpdateSiteUserPermissionsDto(
    IReadOnlyList<string> PermissionCodes,
    IReadOnlyList<PermissionOverrideDto>? PermissionOverrides = null);

public sealed record UpdateSiteUserScopesDto(
    IReadOnlyList<SiteUserAccessScopeUpsertDto> Scopes,
    string ScopeMode = "selected");

public sealed record SiteUserAccessScopeUpsertDto(
    string ModuleKey,
    string ScopeType,
    Guid ScopeId,
    int SortOrder = 0);

public sealed record RoleDto(
    Guid Id,
    string Code,
    string Name,
    IReadOnlyList<string> Permissions);

public sealed record PermissionCatalogItemDto(
    string Code,
    string Name,
    string ModuleKey,
    string Category,
    bool IsViewDefault,
    int DisplayOrder);

public sealed record AccessModuleDto(
    string Key,
    string Name,
    string Description,
    IReadOnlyList<PermissionCatalogItemDto> Permissions);

public sealed record SiteUserAccessCatalogDto(
    IReadOnlyList<RoleDto> Roles,
    IReadOnlyList<AccessModuleDto> Modules);

public sealed record SiteUserListResponseDto(
    IReadOnlyList<SiteUserDto> Items,
    int Page,
    int PageSize,
    int TotalCount);

public sealed record CreateSiteUserDto(
    string Login,
    string DisplayName,
    IReadOnlyList<string> RoleCodes,
    string Status,
    string? InitialPassword = null,
    IReadOnlyList<string>? PermissionCodes = null,
    IReadOnlyList<string>? EnabledModuleKeys = null,
    IReadOnlyList<PermissionOverrideDto>? PermissionOverrides = null,
    bool RequirePasswordChange = true);

public sealed record SiteUserCreatedDto(
    SiteUserDto User,
    string TemporaryPassword);

public sealed record UpdateSiteUserDto(
    string Login,
    string DisplayName,
    IReadOnlyList<string> RoleCodes,
    string Status,
    IReadOnlyList<string>? PermissionCodes = null,
    IReadOnlyList<PermissionOverrideDto>? PermissionOverrides = null,
    bool? RequirePasswordChange = null);

public sealed record ResetSiteUserPasswordDto(
    string TemporaryPassword,
    DateTimeOffset ResetAt);

public sealed record SiteUserAuditEventDto(
    Guid Id,
    Guid SiteUserId,
    string? ActorName,
    string EventType,
    string? ModuleKey,
    string Details,
    string? BeforeJson,
    string? AfterJson,
    DateTimeOffset CreatedAt,
    string? IpAddress);

public sealed record SiteUserAuditPageDto(
    IReadOnlyList<SiteUserAuditEventDto> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int ChangedPermissionsLast30Days);

public sealed record SiteUserSessionDto(
    Guid Id,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastSeenAt,
    DateTimeOffset ExpiresAt,
    string? IpAddress,
    string? UserAgent,
    bool IsCurrent);

public sealed record SiteUserSessionsDto(
    IReadOnlyList<SiteUserSessionDto> Items,
    int ActiveCount);

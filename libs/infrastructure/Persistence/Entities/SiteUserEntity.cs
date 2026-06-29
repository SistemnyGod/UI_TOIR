namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class SiteUserEntity
{
    public Guid Id { get; set; }

    public string Login { get; set; } = string.Empty;

    public string NormalizedLogin { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? LastLoginAt { get; set; }

    public List<SiteUserRoleEntity> Roles { get; set; } = [];

    public List<SiteUserPermissionEntity> Permissions { get; set; } = [];

    public List<SiteUserAccessScopeEntity> AccessScopes { get; set; } = [];

    public List<SiteUserSessionEntity> Sessions { get; set; } = [];
}

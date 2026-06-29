namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class SiteUserAccessScopeEntity
{
    public Guid Id { get; set; }

    public Guid SiteUserId { get; set; }

    public string ModuleKey { get; set; } = string.Empty;

    public string ScopeType { get; set; } = string.Empty;

    public Guid ScopeId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Guid? CreatedByUserId { get; set; }

    public SiteUserEntity SiteUser { get; set; } = null!;
}

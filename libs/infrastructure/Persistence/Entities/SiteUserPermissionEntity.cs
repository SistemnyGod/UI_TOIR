namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class SiteUserPermissionEntity
{
    public string Effect { get; set; } = "allow";

    public Guid SiteUserId { get; set; }

    public SiteUserEntity SiteUser { get; set; } = null!;

    public Guid PermissionId { get; set; }

    public PermissionEntity Permission { get; set; } = null!;
}

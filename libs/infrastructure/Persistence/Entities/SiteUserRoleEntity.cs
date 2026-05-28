namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class SiteUserRoleEntity
{
    public Guid SiteUserId { get; set; }

    public SiteUserEntity SiteUser { get; set; } = null!;

    public Guid RoleId { get; set; }

    public RoleEntity Role { get; set; } = null!;
}

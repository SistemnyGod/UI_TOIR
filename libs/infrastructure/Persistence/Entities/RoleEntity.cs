namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class RoleEntity
{
    public Guid Id { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public List<SiteUserRoleEntity> Users { get; set; } = [];

    public List<RolePermissionEntity> Permissions { get; set; } = [];
}

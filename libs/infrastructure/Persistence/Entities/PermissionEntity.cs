namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class PermissionEntity
{
    public Guid Id { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public List<RolePermissionEntity> Roles { get; set; } = [];

    public List<SiteUserPermissionEntity> Users { get; set; } = [];
}

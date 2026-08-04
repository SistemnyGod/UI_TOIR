namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class PermissionEntity
{
    public Guid Id { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string ModuleKey { get; set; } = "system";

    public string Category { get; set; } = "actions";

    public bool IsViewDefault { get; set; }

    public int DisplayOrder { get; set; }

    public List<RolePermissionEntity> Roles { get; set; } = [];

    public List<SiteUserPermissionEntity> Users { get; set; } = [];
}

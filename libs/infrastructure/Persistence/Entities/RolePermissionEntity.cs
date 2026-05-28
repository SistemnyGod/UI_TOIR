namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class RolePermissionEntity
{
    public Guid RoleId { get; set; }

    public RoleEntity Role { get; set; } = null!;

    public Guid PermissionId { get; set; }

    public PermissionEntity Permission { get; set; } = null!;
}

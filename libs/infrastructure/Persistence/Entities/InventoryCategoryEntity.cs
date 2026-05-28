namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class InventoryCategoryEntity
{
    public Guid Id { get; set; }

    public Guid? ParentId { get; set; }

    public int? LegacyId { get; set; }

    public string Name { get; set; } = string.Empty;

    public bool IsArchived { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public InventoryCategoryEntity? Parent { get; set; }

    public List<InventoryCategoryEntity> Children { get; set; } = [];

    public List<InventoryItemEntity> Items { get; set; } = [];
}

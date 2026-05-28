namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class InventoryUnitEntity
{
    public Guid Id { get; set; }

    public int? LegacyId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Symbol { get; set; } = string.Empty;

    public List<InventoryItemEntity> Items { get; set; } = [];
}

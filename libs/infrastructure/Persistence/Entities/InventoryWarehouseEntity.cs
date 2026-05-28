namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class InventoryWarehouseEntity
{
    public Guid Id { get; set; }

    public int? LegacyId { get; set; }

    public string Name { get; set; } = string.Empty;

    public bool IsDefault { get; set; }

    public bool IsArchived { get; set; }

    public List<InventoryStockMoveEntity> StockMoves { get; set; } = [];
}

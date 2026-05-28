namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class InventoryStockMoveEntity
{
    public Guid Id { get; set; }

    public int? LegacyId { get; set; }

    public Guid ItemId { get; set; }

    public Guid WarehouseId { get; set; }

    public decimal QuantityDelta { get; set; }

    public DateTimeOffset MovedAt { get; set; }

    public Guid? EmployeeId { get; set; }

    public string MoveType { get; set; } = string.Empty;

    public string ReferenceType { get; set; } = string.Empty;

    public Guid? ReferenceId { get; set; }

    public Guid? CustodyRecordId { get; set; }

    public Guid? PpeCardLineId { get; set; }

    public InventoryItemEntity Item { get; set; } = null!;

    public InventoryWarehouseEntity Warehouse { get; set; } = null!;

    public EmployeeEntity? Employee { get; set; }

    public InventoryCustodyRecordEntity? CustodyRecord { get; set; }

    public InventoryPpeCardLineEntity? PpeCardLine { get; set; }
}

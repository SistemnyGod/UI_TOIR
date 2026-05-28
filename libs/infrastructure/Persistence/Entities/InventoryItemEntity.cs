namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class InventoryItemEntity
{
    public Guid Id { get; set; }

    public int? LegacyId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Sku { get; set; } = string.Empty;

    public Guid? CategoryId { get; set; }

    public Guid? UnitId { get; set; }

    public string ItemKind { get; set; } = string.Empty;

    public string NormItemName { get; set; } = string.Empty;

    public string ActualItemName { get; set; } = string.Empty;

    public string BrandName { get; set; } = string.Empty;

    public string ModelName { get; set; } = string.Empty;

    public string Article { get; set; } = string.Empty;

    public string ProtectionClass { get; set; } = string.Empty;

    public string ClothingSize { get; set; } = string.Empty;

    public string HeightSize { get; set; } = string.Empty;

    public string ShoeSize { get; set; } = string.Empty;

    public string HeadSize { get; set; } = string.Empty;

    public string GloveSize { get; set; } = string.Empty;

    public string RespiratorSize { get; set; } = string.Empty;

    public int? DefaultLifeMonths { get; set; }

    public long? DefaultUnitPriceMinor { get; set; }

    public decimal? MinStockQty { get; set; }

    public bool IsConsumable { get; set; }

    public bool TrackLife { get; set; }

    public string TrackingType { get; set; } = string.Empty;

    public string Comment { get; set; } = string.Empty;

    public bool IsActive { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public InventoryCategoryEntity? Category { get; set; }

    public InventoryUnitEntity? Unit { get; set; }

    public List<InventoryStockMoveEntity> StockMoves { get; set; } = [];
}

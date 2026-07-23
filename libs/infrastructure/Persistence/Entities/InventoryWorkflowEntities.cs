namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class InventoryCustodyCategoryEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
}

internal sealed class InventoryCustodyDocumentEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public string Number { get; set; } = string.Empty;
    public Guid EmployeeId { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public EmployeeEntity Employee { get; set; } = null!;
    public List<InventoryCustodyRecordEntity> Records { get; set; } = [];
}

internal sealed class InventoryCustodyRecordEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public Guid DocumentId { get; set; }
    public Guid EmployeeId { get; set; }
    public Guid ItemId { get; set; }
    public Guid WarehouseId { get; set; }
    public decimal Quantity { get; set; }
    public string Status { get; set; } = string.Empty;
    public string Comment { get; set; } = string.Empty;
    public DateTimeOffset IssuedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public InventoryCustodyDocumentEntity Document { get; set; } = null!;
    public EmployeeEntity Employee { get; set; } = null!;
    public InventoryItemEntity Item { get; set; } = null!;
    public InventoryWarehouseEntity Warehouse { get; set; } = null!;
    public List<InventoryCustodyRecordEventEntity> Events { get; set; } = [];
    public List<InventoryStockMoveEntity> StockMoves { get; set; } = [];
}

internal sealed class InventoryCustodyRecordEventEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public Guid RecordId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string FromStatus { get; set; } = string.Empty;
    public string ToStatus { get; set; } = string.Empty;
    public string Comment { get; set; } = string.Empty;
    public string Actor { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public InventoryCustodyRecordEntity Record { get; set; } = null!;
}

internal sealed class InventoryPpeCardEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public Guid EmployeeId { get; set; }
    public string Position { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Comment { get; set; } = string.Empty;
    public string IssueType { get; set; } = "planned";
    public string ResponsibleName { get; set; } = string.Empty;
    public string Basis { get; set; } = string.Empty;
    public string Gender { get; set; } = string.Empty;
    public string Height { get; set; } = string.Empty;
    public string ClothingSize { get; set; } = string.Empty;
    public string ShoeSize { get; set; } = string.Empty;
    public string HeadSize { get; set; } = string.Empty;
    public string RespiratorSize { get; set; } = string.Empty;
    public string HandProtectionSize { get; set; } = string.Empty;
    public long Version { get; set; }
    public Guid? NormSetId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public EmployeeEntity Employee { get; set; } = null!;
    public InventoryPpeNormSetEntity? NormSet { get; set; }
    public List<InventoryPpeCardNormRowEntity> NormRows { get; set; } = [];
    public List<InventoryPpeCardLineEntity> Lines { get; set; } = [];
}

internal sealed class InventoryPpeCardLineEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public Guid CardId { get; set; }
    public Guid? CardNormRowId { get; set; }
    public Guid ItemId { get; set; }
    public Guid? WarehouseId { get; set; }
    public decimal Quantity { get; set; }
    public long? UnitPriceMinor { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTimeOffset? IssuedAt { get; set; }
    public DateTimeOffset? DueAt { get; set; }
    public string Comment { get; set; } = string.Empty;
    public string PrintItemName { get; set; } = string.Empty;
    public string NormPoint { get; set; } = string.Empty;
    public string IssuePeriodText { get; set; } = string.Empty;
    public string? QuantityText { get; set; }
    public bool IsSectionTitle { get; set; }
    public string BrandModelArticle { get; set; } = string.Empty;
    public string IssueMethod { get; set; } = string.Empty;
    public string SizeText { get; set; } = string.Empty;
    public DateTimeOffset? ReturnedAt { get; set; }
    public decimal? ReturnedQuantity { get; set; }
    public DateTimeOffset? WriteOffActDate { get; set; }
    public string WriteOffActNumber { get; set; } = string.Empty;
    public InventoryPpeCardEntity Card { get; set; } = null!;
    public InventoryPpeCardNormRowEntity? CardNormRow { get; set; }
    public InventoryItemEntity Item { get; set; } = null!;
    public InventoryWarehouseEntity? Warehouse { get; set; }
    public List<InventoryPpeCardLineEventEntity> Events { get; set; } = [];
    public List<InventoryStockMoveEntity> StockMoves { get; set; } = [];
}

internal sealed class InventoryPpeNormSetEntity
{
    public Guid Id { get; set; }
    public string PositionName { get; set; } = string.Empty;
    public string VersionName { get; set; } = string.Empty;
    public DateOnly? EffectiveFrom { get; set; }
    public DateOnly? EffectiveTo { get; set; }
    public string SourceName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public bool RequiresReview { get; set; }
    public long Version { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public List<InventoryPpeNormRowEntity> Rows { get; set; } = [];
}

internal sealed class InventoryPpeNormRowEntity
{
    public Guid Id { get; set; }
    public Guid NormSetId { get; set; }
    public Guid? ParentRowId { get; set; }
    public string RowType { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public string NormItemName { get; set; } = string.Empty;
    public string NormPoint { get; set; } = string.Empty;
    public string IssuePeriodText { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public string QuantityText { get; set; } = string.Empty;
    public int? LifeMonths { get; set; }
    public InventoryPpeNormSetEntity NormSet { get; set; } = null!;
    public InventoryPpeNormRowEntity? ParentRow { get; set; }
    public List<InventoryPpeNormRowEntity> Children { get; set; } = [];
    public List<InventoryPpeNormCatalogMappingEntity> Mappings { get; set; } = [];
}

internal sealed class InventoryPpeNormCatalogMappingEntity
{
    public Guid Id { get; set; }
    public Guid NormRowId { get; set; }
    public Guid ItemId { get; set; }
    public string BrandModelArticle { get; set; } = string.Empty;
    public long? DefaultUnitPriceMinor { get; set; }
    public bool IsDefault { get; set; }
    public string Comment { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public InventoryPpeNormRowEntity NormRow { get; set; } = null!;
    public InventoryItemEntity Item { get; set; } = null!;
}

internal sealed class InventoryPpeCardNormRowEntity
{
    public Guid Id { get; set; }
    public Guid CardId { get; set; }
    public Guid? SourceNormRowId { get; set; }
    public Guid? ParentRowId { get; set; }
    public Guid? MappedItemId { get; set; }
    public string RowType { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public string NormItemName { get; set; } = string.Empty;
    public string NormPoint { get; set; } = string.Empty;
    public string IssuePeriodText { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public string QuantityText { get; set; } = string.Empty;
    public int? LifeMonths { get; set; }
    public string BrandModelArticle { get; set; } = string.Empty;
    public long? DefaultUnitPriceMinor { get; set; }
    public InventoryPpeCardEntity Card { get; set; } = null!;
    public InventoryPpeNormRowEntity? SourceNormRow { get; set; }
    public InventoryPpeCardNormRowEntity? ParentRow { get; set; }
    public List<InventoryPpeCardNormRowEntity> Children { get; set; } = [];
    public InventoryItemEntity? MappedItem { get; set; }
    public List<InventoryPpeCardLineEntity> Issues { get; set; } = [];
}

internal sealed class InventoryPpeCardLineEventEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public Guid LineId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string FromStatus { get; set; } = string.Empty;
    public string ToStatus { get; set; } = string.Empty;
    public string Comment { get; set; } = string.Empty;
    public string Actor { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public InventoryPpeCardLineEntity Line { get; set; } = null!;
}

internal sealed class InventoryPpeIssueTemplateEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
}

internal sealed class InventoryItemSetEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
    public List<InventoryItemSetItemEntity> Items { get; set; } = [];
}

internal sealed class InventoryItemSetItemEntity
{
    public Guid Id { get; set; }
    public Guid ItemSetId { get; set; }
    public Guid ItemId { get; set; }
    public decimal Quantity { get; set; }
    public InventoryItemSetEntity ItemSet { get; set; } = null!;
    public InventoryItemEntity Item { get; set; } = null!;
}

internal sealed class InventoryPositionNormEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public string PositionName { get; set; } = string.Empty;
    public Guid ItemId { get; set; }
    public string NormItemName { get; set; } = string.Empty;
    public string NormPoint { get; set; } = string.Empty;
    public string IssuePeriodText { get; set; } = string.Empty;
    public string QuantityText { get; set; } = string.Empty;
    public bool IsSectionTitle { get; set; }
    public decimal Quantity { get; set; }
    public int? LifeMonths { get; set; }
    public InventoryItemEntity Item { get; set; } = null!;
}

internal sealed class InventoryPositionItemSetMapEntity
{
    public Guid Id { get; set; }
    public string PositionName { get; set; } = string.Empty;
    public Guid ItemSetId { get; set; }
    public InventoryItemSetEntity ItemSet { get; set; } = null!;
}

internal sealed class InventoryReturnReasonEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
}

internal sealed class InventoryWriteOffReasonEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
}

internal sealed class InventorySystemLogEntity
{
    public Guid Id { get; set; }
    public int? LegacyId { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public Guid? EntityId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public string Actor { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class InventoryExportJobEntity
{
    public Guid Id { get; set; }
    public string ReportId { get; set; } = string.Empty;
    public string Format { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string DownloadName { get; set; } = string.Empty;
    public string PayloadJson { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class InventoryLegacyImportRunEntity
{
    public Guid Id { get; set; }
    public bool DryRun { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public int TablesScanned { get; set; }
    public int RowsRead { get; set; }
    public int RowsInserted { get; set; }
    public int RowsUpdated { get; set; }
    public int RowsSkipped { get; set; }
    public string Error { get; set; } = string.Empty;
    public string StockChecksum { get; set; } = string.Empty;
    public string TablesJson { get; set; } = "[]";
}

internal sealed class InventoryEmployeeLegacyLinkEntity
{
    public Guid Id { get; set; }
    public int LegacyId { get; set; }
    public Guid EmployeeId { get; set; }
    public string SourceKey { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public EmployeeEntity Employee { get; set; } = null!;
}

internal sealed class InventoryUserLegacyLinkEntity
{
    public Guid Id { get; set; }
    public int LegacyId { get; set; }
    public Guid UserId { get; set; }
    public string SourceKey { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public SiteUserEntity User { get; set; } = null!;
}

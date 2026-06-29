namespace Patrol360.Contracts;

public sealed record InventoryOverviewDto(
    int EmployeesTotal,
    int ItemsTotal,
    int CategoriesTotal,
    int UnitsTotal,
    int WarehousesTotal,
    int CriticalStockItems,
    int ActiveIssues,
    int ActiveCustodyRecords,
    int PpeCardsTotal,
    int ReportsReady,
    IReadOnlyList<InventoryAttentionDto> Attention);

public sealed record InventoryAttentionDto(
    string Id,
    string Title,
    string Description,
    string Tone,
    string Target);

public sealed record InventoryListResponseDto<T>(
    IReadOnlyList<T> Rows,
    int Total,
    int Page,
    int PageSize,
    int PageCount);

public sealed record InventoryItemDto(
    Guid Id,
    string Name,
    string Sku,
    Guid? CategoryId,
    string Category,
    Guid? UnitId,
    string Unit,
    decimal Balance,
    decimal StockPhysical,
    decimal StockReserved,
    decimal StockAvailable,
    string StockStatus,
    decimal? MinStockQty,
    string ItemKind,
    string NormItemName,
    string ActualItemName,
    string BrandName,
    string ModelName,
    string Article,
    string ProtectionClass,
    string ClothingSize,
    string HeightSize,
    string ShoeSize,
    string HeadSize,
    string GloveSize,
    string RespiratorSize,
    int? DefaultLifeMonths,
    long? DefaultUnitPriceMinor,
    string TrackingType,
    string Comment,
    bool IsConsumable,
    bool TrackLife,
    bool IsActive,
    string Status);

public sealed record InventoryFacetDto(
    string Id,
    string Name,
    int Count);

public sealed record InventoryItemFacetsDto(
    int Total,
    int Active,
    int Inactive,
    IReadOnlyList<InventoryFacetDto> Categories,
    IReadOnlyList<InventoryFacetDto> Units,
    IReadOnlyList<InventoryFacetDto> TrackingTypes,
    IReadOnlyList<InventoryFacetDto> ItemKinds);

public sealed record InventoryStockBalanceDto(
    Guid ItemId,
    string ItemName,
    Guid WarehouseId,
    string WarehouseName,
    decimal Balance,
    decimal StockPhysical,
    decimal StockReserved,
    decimal StockAvailable,
    string Unit,
    string Status);

public sealed record InventorySettingsDto(
    IReadOnlyList<InventoryReferenceOptionDto> Categories,
    IReadOnlyList<InventoryReferenceOptionDto> Units,
    IReadOnlyList<InventoryReferenceOptionDto> Warehouses,
    IReadOnlyList<InventoryReferenceOptionDto> CustodyCategories,
    IReadOnlyList<InventoryReferenceOptionDto> ReturnReasons,
    IReadOnlyList<InventoryReferenceOptionDto> WriteOffReasons,
    IReadOnlyList<InventoryItemSetDto> ItemSets,
    IReadOnlyList<InventoryPositionNormDto> PositionNorms,
    IReadOnlyList<InventoryReferenceOptionDto> EmployeePositions,
    IReadOnlyList<InventoryReferenceOptionDto> EmployeeDepartments,
    IReadOnlyList<InventoryReferenceOptionDto> EmployeeGroups);

public sealed record InventoryReferenceOptionDto(
    Guid Id,
    string Name,
    string Code,
    bool IsActive);

public sealed record InventoryItemSetDto(
    Guid Id,
    string Name,
    bool IsActive,
    int ItemsCount);

public sealed record InventoryItemSetDetailDto(
    Guid Id,
    string Name,
    bool IsActive,
    IReadOnlyList<InventoryItemSetItemDto> Items);

public sealed record InventoryItemSetItemDto(
    Guid Id,
    decimal Quantity,
    InventoryItemDto Item);

public sealed record InventoryPositionNormDto(
    Guid Id,
    string PositionName,
    Guid ItemId,
    string ItemName,
    decimal Quantity,
    int? LifeMonths,
    string NormItemName = "",
    string NormPoint = "",
    string IssuePeriodText = "",
    string QuantityText = "");

public sealed record CreateInventorySimpleReferenceDto(
    string Name);

public sealed record UpdateInventorySimpleReferenceDto(
    string Name,
    bool IsArchived = false);

public sealed record CreateInventoryItemSetDto(
    string Name);

public sealed record UpdateInventoryItemSetDto(
    string Name,
    bool IsArchived = false);

public sealed record UpsertInventoryItemSetItemsDto(
    IReadOnlyList<UpsertInventoryItemSetItemDto> Items);

public sealed record UpsertInventoryItemSetItemDto(
    Guid ItemId,
    decimal Quantity);

public sealed record UpsertInventoryPositionNormDto(
    string PositionName,
    Guid ItemId,
    decimal Quantity,
    int? LifeMonths = null,
    string? NormItemName = null,
    string? NormPoint = null,
    string? IssuePeriodText = null,
    string? QuantityText = null);

public sealed record CreateInventoryCategoryDto(
    string Name,
    Guid? ParentId = null);

public sealed record UpdateInventoryCategoryDto(
    string Name,
    Guid? ParentId = null,
    bool IsArchived = false);

public sealed record CreateInventoryUnitDto(
    string Name,
    string Symbol);

public sealed record UpdateInventoryUnitDto(
    string Name,
    string Symbol);

public sealed record CreateInventoryWarehouseDto(
    string Name,
    bool IsDefault = false);

public sealed record UpdateInventoryWarehouseDto(
    string Name,
    bool IsDefault = false,
    bool IsArchived = false);

public sealed record UpsertInventoryItemDto(
    string Name,
    string? Sku = null,
    Guid? CategoryId = null,
    Guid? UnitId = null,
    string? ItemKind = null,
    string? NormItemName = null,
    string? ActualItemName = null,
    string? BrandName = null,
    string? ModelName = null,
    string? Article = null,
    string? ProtectionClass = null,
    string? ClothingSize = null,
    string? HeightSize = null,
    string? ShoeSize = null,
    string? HeadSize = null,
    string? GloveSize = null,
    string? RespiratorSize = null,
    int? DefaultLifeMonths = null,
    long? DefaultUnitPriceMinor = null,
    decimal? MinStockQty = null,
    bool IsConsumable = false,
    bool TrackLife = true,
    string? TrackingType = null,
    string? Comment = null,
    bool IsActive = true);

public sealed record InventoryInitialStockDto(
    Guid ItemId,
    Guid WarehouseId,
    decimal Quantity,
    DateTimeOffset? MovedAt = null,
    string? Note = null);

public sealed record CreateInventoryOperationDto(
    string Type,
    Guid ItemId,
    Guid? WarehouseId,
    decimal Quantity,
    Guid? EmployeeId = null,
    DateTimeOffset? MovedAt = null,
    string? Comment = null);

public sealed record InventoryOperationsModuleOptionsDto(
    IReadOnlyList<InventoryEmployeeDto> Employees,
    IReadOnlyList<InventoryItemDto> Items,
    InventorySettingsDto Settings,
    IReadOnlyList<InventoryStockBalanceDto> Stock,
    IReadOnlyList<string> OperationTypes);

public sealed record InventoryCommandResult<T>(
    T? Value,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Value is not null && Errors.Count == 0;
}

public sealed record InventoryDocumentDto(
    Guid Id,
    string Number,
    string Type,
    string EmployeeName,
    string Status,
    DateTime CreatedAt,
    string ItemName = "",
    string WarehouseName = "",
    decimal Quantity = 0,
    string Unit = "",
    string Comment = "");

public sealed record InventoryCustodyRecordDto(
    Guid Id,
    Guid DocumentId,
    string EmployeeName,
    string ItemName,
    string WarehouseName,
    decimal Quantity,
    string Status,
    DateTime IssuedAt,
    DateTime? ClosedAt,
    Guid ItemId,
    Guid WarehouseId,
    string Unit,
    string Comment);

public sealed record InventoryCustodyDocumentDto(
    Guid Id,
    string Number,
    string EmployeeName,
    string Status,
    DateTime CreatedAt,
    int RecordsCount);

public sealed record InventoryCustodyDocumentDetailDto(
    Guid Id,
    string Number,
    Guid EmployeeId,
    string EmployeeName,
    string EmployeePersonnelNo,
    string EmployeeDepartment,
    string Status,
    DateTime CreatedAt,
    DateTime? ClosedAt,
    IReadOnlyList<InventoryCustodyRecordDto> Records,
    IReadOnlyList<InventoryHistoryDto> History);

public sealed record InventoryCustodyModuleOptionsDto(
    IReadOnlyList<InventoryEmployeeDto> Employees,
    IReadOnlyList<InventoryItemDto> Items,
    IReadOnlyList<InventoryReferenceOptionDto> Warehouses,
    IReadOnlyList<InventoryReferenceOptionDto> CustodyCategories,
    IReadOnlyList<string> DocumentStatuses,
    IReadOnlyList<string> RecordStatuses);

public sealed record CreateInventoryCustodyRecordDto(
    Guid EmployeeId,
    Guid ItemId,
    Guid? WarehouseId,
    decimal Quantity,
    string? Comment = null,
    Guid? DocumentId = null);

public sealed record UpdateInventoryStatusDto(
    string Status,
    string? Comment = null);

public sealed record InventoryPpeSummaryDto(
    int Total,
    int Active,
    int Issued,
    int Issuing,
    int NotIssued,
    int Partial,
    int Problem,
    int Returned,
    int WrittenOff,
    int LinesTotal,
    int IssuedLines,
    int NotIssuedLines);

public sealed record InventoryPpeCardsResponseDto(
    IReadOnlyList<InventoryPpeCardDto> Rows,
    int Total,
    int Page,
    int PageSize,
    int PageCount,
    InventoryPpeSummaryDto Summary,
    InventoryPpeSummaryDto FilteredSummary);

public sealed record InventoryPpeCardDto(
    Guid Id,
    Guid EmployeeId,
    string EmployeeName,
    string Position,
    string Status,
    int LinesCount,
    decimal AmountMinor,
    int ZeroPriceLines);

public sealed record InventoryPpeCardDetailDto(
    Guid Id,
    Guid EmployeeId,
    string EmployeeName,
    string EmployeePersonnelNo,
    string EmployeeDepartment,
    string Position,
    string Status,
    DateTime CreatedAt,
    string Comment,
    InventoryPpeEmployeeDetailsDto EmployeeDetails,
    IReadOnlyList<InventoryPpeCardLineDto> Lines);

public sealed record InventoryPpeEmployeeDetailsDto(
    string Gender = "",
    string Height = "",
    string ClothingSize = "",
    string ShoeSize = "",
    string HeadSize = "",
    string RespiratorSize = "",
    string HandProtectionSize = "");

public sealed record InventoryPpeCardLineDto(
    Guid Id,
    Guid ItemId,
    string ItemName,
    Guid? WarehouseId,
    string WarehouseName,
    decimal Quantity,
    string Unit,
    long? UnitPriceMinor,
    decimal AmountMinor,
    string Status,
    DateTime? IssuedAt,
    DateTime? DueAt,
    string ModelDescription,
    string BrandModelArticle,
    string NormPoint,
    string PrintItemName = "",
    string IssuePeriodText = "");

public sealed record InventoryPpeMovementDto(
    Guid CardId,
    Guid LineId,
    Guid EmployeeId,
    string EmployeeName,
    string EmployeePersonnelNo,
    string EmployeeDepartment,
    Guid ItemId,
    string ItemName,
    decimal Quantity,
    string Unit,
    long? UnitPriceMinor,
    decimal AmountMinor,
    string Status,
    DateTime CreatedAt,
    DateTime? IssuedAt,
    DateTime? ReturnedAt,
    DateTime? WrittenOffAt,
    DateTime? DueAt,
    string Comment);

public sealed record InventoryPpeModuleOptionsDto(
    IReadOnlyList<InventoryEmployeeDto> Employees,
    IReadOnlyList<InventoryItemDto> Items,
    InventorySettingsDto Settings,
    IReadOnlyList<string> Statuses);

public sealed record CreateInventoryPpeCardDto(
    Guid EmployeeId,
    string? Comment = null,
    InventoryPpeEmployeeDetailsDto? EmployeeDetails = null);

public sealed record UpsertInventoryPpeCardLineDto(
    Guid ItemId,
    Guid? WarehouseId,
    decimal Quantity,
    long? UnitPriceMinor = null,
    string? Status = null,
    DateTimeOffset? DueAt = null,
    string? Comment = null,
    string? PrintItemName = null,
    string? NormPoint = null,
    string? IssuePeriodText = null,
    DateTimeOffset? IssuedAt = null,
    string? BrandModelArticle = null);

public sealed record InventoryReportDto(
    string Id,
    string Title,
    string Description,
    string Format);

public sealed record InventoryHistoryDto(
    Guid Id,
    string EntityType,
    string Action,
    string Description,
    string Actor,
    DateTime CreatedAt,
    string EmployeeName = "",
    string ItemName = "");

public sealed record InventoryExportJobDto(
    Guid Id,
    string ReportId,
    string Format,
    string Status,
    DateTime CreatedAt,
    string DownloadName);

public sealed record InventoryGeneratedFileDto(
    string DownloadName,
    string ContentType,
    byte[] Content);

public sealed record InventoryLegacyImportRequestDto(
    bool DryRun = false);

public sealed record InventoryLegacyImportTableDto(
    string TableName,
    int SourceRows,
    int InsertedRows,
    int UpdatedRows,
    int SkippedRows,
    string Status,
    string Message);

public sealed record InventoryLegacyImportRunDto(
    Guid Id,
    bool DryRun,
    string Status,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    int TablesScanned,
    int RowsRead,
    int RowsInserted,
    int RowsUpdated,
    int RowsSkipped,
    string Error,
    string StockChecksum,
    IReadOnlyList<InventoryLegacyImportTableDto> Tables);

public sealed record InventoryDbHealthDto(
    DateTime CreatedAt,
    int IssueCount,
    int CriticalCount,
    int WarningCount,
    IReadOnlyList<InventoryDbHealthIssueDto> Issues);

public sealed record InventoryDbHealthIssueDto(
    string Key,
    string Severity,
    string Entity,
    int Count,
    string Title,
    string Description);

public sealed record InventoryEmployeeImportResultDto(
    int RowsRead,
    int InsertedRows,
    int UpdatedRows,
    int SkippedRows,
    IReadOnlyList<string> Errors);

public sealed record InventoryEmployeeImportPreviewDto(
    int RowsRead,
    int NewRows,
    int UpdateRows,
    int SkippedRows,
    IReadOnlyList<string> NewPositions,
    IReadOnlyList<string> NewDepartments,
    IReadOnlyList<string> NewGroups,
    IReadOnlyList<string> Errors,
    IReadOnlyList<InventoryEmployeeImportPreviewRowDto> Rows,
    string PreviewToken = "");

public sealed record InventoryEmployeeImportPreviewRowDto(
    int RowNumber,
    string FullName,
    string PersonnelNo,
    string Position,
    string Department,
    string EmployeeGroup,
    DateOnly? HiredAt,
    DateOnly? BirthDate,
    string ChangeType,
    string Error);

public sealed record InventoryEmployeeDto(
    Guid Id,
    string FullName,
    string PersonnelNo,
    string Position,
    string Department,
    string Status,
    string EmployeeGroup = "",
    DateOnly? HiredAt = null,
    DateOnly? BirthDate = null);

public sealed record InventoryUserDto(
    Guid Id,
    string Login,
    string DisplayName,
    string Status,
    IReadOnlyList<string> Roles);

public sealed record InventorySystemLogDto(
    Guid Id,
    string EntityType,
    Guid? EntityId,
    string Action,
    string Details,
    string Actor,
    DateTime CreatedAt);

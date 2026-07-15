using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IInventoryCatalogQuery
{
    InventoryOverviewDto GetOverview();

    InventoryListResponseDto<InventoryItemDto> GetItems(InventoryListQuery query);

    InventoryItemFacetsDto GetItemFacets();

    InventoryListResponseDto<InventoryStockBalanceDto> GetStock(InventoryListQuery query);

    InventoryListResponseDto<InventoryDocumentDto> GetDocuments(InventoryListQuery query);

    InventorySettingsDto GetSettings();

    InventoryCommandResult<InventoryItemSetDetailDto> GetItemSet(Guid id);

    InventoryCommandResult<IReadOnlyList<InventoryItemSetItemDto>> GetItemSetItems(Guid id);

    InventoryDbHealthDto GetDbHealth();
}

public sealed record InventoryListQuery(
    int Page = 1,
    int PageSize = 25,
    string? Query = null,
    string? Status = null,
    Guid? ItemId = null,
    Guid? CategoryId = null,
    Guid? UnitId = null,
    string? TrackingType = null,
    string? ItemKind = null,
    string? EntityType = null,
    string? Action = null,
    string? Actor = null,
    DateTimeOffset? DateFrom = null,
    DateTimeOffset? DateTo = null,
    string? Department = null,
    string? EmployeeGroup = null,
    string? Role = null,
    string? Position = null,
    string? CardNo = null,
    string? Item = null,
    string? Sort = null,
    string? Direction = null,
    string? PriceState = null,
    bool IncludeLines = true,
    Guid? EmployeeId = null);

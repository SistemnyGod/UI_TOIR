using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IInventoryCatalogCommandService
{
    InventoryCommandResult<InventoryReferenceOptionDto> CreateCategory(CreateInventoryCategoryDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> UpdateCategory(Guid id, UpdateInventoryCategoryDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> CreateUnit(CreateInventoryUnitDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> UpdateUnit(Guid id, UpdateInventoryUnitDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> CreateWarehouse(CreateInventoryWarehouseDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> UpdateWarehouse(Guid id, UpdateInventoryWarehouseDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> CreateCustodyCategory(CreateInventorySimpleReferenceDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> UpdateCustodyCategory(Guid id, UpdateInventorySimpleReferenceDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> CreateReturnReason(CreateInventorySimpleReferenceDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> UpdateReturnReason(Guid id, UpdateInventorySimpleReferenceDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> CreateWriteOffReason(CreateInventorySimpleReferenceDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> UpdateWriteOffReason(Guid id, UpdateInventorySimpleReferenceDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> CreateEmployeeReference(string kind, CreateInventorySimpleReferenceDto request);

    InventoryCommandResult<InventoryReferenceOptionDto> UpdateEmployeeReference(string kind, Guid id, UpdateInventorySimpleReferenceDto request);

    InventoryCommandResult<InventoryItemSetDto> CreateItemSet(CreateInventoryItemSetDto request);

    InventoryCommandResult<InventoryItemSetDto> UpdateItemSet(Guid id, UpdateInventoryItemSetDto request);

    InventoryCommandResult<InventoryItemSetDetailDto> UpdateItemSetItems(Guid id, UpsertInventoryItemSetItemsDto request);

    InventoryCommandResult<InventoryPositionNormDto> UpsertPositionNorm(UpsertInventoryPositionNormDto request);

    InventoryCommandResult<InventoryItemDto> CreateItem(UpsertInventoryItemDto request);

    InventoryCommandResult<InventoryItemDto> UpdateItem(Guid id, UpsertInventoryItemDto request);

    InventoryCommandResult<InventoryStockBalanceDto> SetInitialStock(InventoryInitialStockDto request);

    InventoryCommandResult<InventoryDocumentDto> CreateOperation(CreateInventoryOperationDto request);
}

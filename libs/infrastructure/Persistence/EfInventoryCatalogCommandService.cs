using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfInventoryCatalogCommandService(Patrol360DbContext dbContext) : IInventoryCatalogCommandService
{
    private static readonly HashSet<string> ReservationMoveTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "reservation",
        "reserve",
        "ppe_reserve",
        "ppe_reservation"
    };

    public InventoryCommandResult<InventoryReferenceOptionDto> CreateCategory(CreateInventoryCategoryDto request)
    {
        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите название категории");
        }

        if (request.ParentId is not null && !dbContext.InventoryCategories.Any(category => category.Id == request.ParentId.Value))
        {
            return Failure<InventoryReferenceOptionDto>("parentId", "Родительская категория не найдена");
        }

        if (dbContext.InventoryCategories.Any(category =>
            category.ParentId == request.ParentId &&
            category.Name.ToLower() == name.ToLower() &&
            !category.IsArchived))
        {
            return Failure<InventoryReferenceOptionDto>("name", "Категория с таким названием уже существует");
        }

        var category = new InventoryCategoryEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            ParentId = request.ParentId,
            CreatedAt = DateTimeOffset.UtcNow
        };

        dbContext.InventoryCategories.Add(category);
        dbContext.SaveChanges();

        return Success(ToReference(category));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> UpdateCategory(Guid id, UpdateInventoryCategoryDto request)
    {
        var category = dbContext.InventoryCategories.FirstOrDefault(row => row.Id == id);
        if (category is null)
        {
            return Failure<InventoryReferenceOptionDto>("id", "Категория не найдена");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите название категории");
        }

        if (request.ParentId == id)
        {
            return Failure<InventoryReferenceOptionDto>("parentId", "Категория не может быть родителем самой себя");
        }

        if (request.ParentId is not null && !dbContext.InventoryCategories.Any(row => row.Id == request.ParentId.Value))
        {
            return Failure<InventoryReferenceOptionDto>("parentId", "Родительская категория не найдена");
        }

        if (dbContext.InventoryCategories.Any(row =>
            row.Id != id &&
            row.ParentId == request.ParentId &&
            row.Name.ToLower() == name.ToLower() &&
            !row.IsArchived))
        {
            return Failure<InventoryReferenceOptionDto>("name", "Категория с таким названием уже существует");
        }

        category.Name = name;
        category.ParentId = request.ParentId;
        category.IsArchived = request.IsArchived;
        dbContext.SaveChanges();

        return Success(ToReference(category));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> CreateUnit(CreateInventoryUnitDto request)
    {
        var name = NormalizeRequired(request.Name);
        var symbol = NormalizeRequired(request.Symbol);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите название единицы");
        }

        if (symbol.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("symbol", "Введите обозначение единицы");
        }

        if (dbContext.InventoryUnits.Any(unit => unit.Name.ToLower() == name.ToLower() || unit.Symbol.ToLower() == symbol.ToLower()))
        {
            return Failure<InventoryReferenceOptionDto>("name", "Такая единица измерения уже существует");
        }

        var unitEntity = new InventoryUnitEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            Symbol = symbol
        };

        dbContext.InventoryUnits.Add(unitEntity);
        dbContext.SaveChanges();

        return Success(ToReference(unitEntity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> UpdateUnit(Guid id, UpdateInventoryUnitDto request)
    {
        var unitEntity = dbContext.InventoryUnits.FirstOrDefault(row => row.Id == id);
        if (unitEntity is null)
        {
            return Failure<InventoryReferenceOptionDto>("id", "Единица измерения не найдена");
        }

        var name = NormalizeRequired(request.Name);
        var symbol = NormalizeRequired(request.Symbol);
        if (name.Length == 0 || symbol.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Заполните название и обозначение единицы");
        }

        if (dbContext.InventoryUnits.Any(unit =>
            unit.Id != id &&
            (unit.Name.ToLower() == name.ToLower() || unit.Symbol.ToLower() == symbol.ToLower())))
        {
            return Failure<InventoryReferenceOptionDto>("name", "Такая единица измерения уже существует");
        }

        unitEntity.Name = name;
        unitEntity.Symbol = symbol;
        dbContext.SaveChanges();

        return Success(ToReference(unitEntity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> CreateWarehouse(CreateInventoryWarehouseDto request)
    {
        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите название склада");
        }

        if (dbContext.InventoryWarehouses.Any(warehouse => warehouse.Name.ToLower() == name.ToLower()))
        {
            return Failure<InventoryReferenceOptionDto>("name", "Склад с таким названием уже существует");
        }

        if (request.IsDefault)
        {
            ClearDefaultWarehouse();
        }

        var warehouseEntity = new InventoryWarehouseEntity
        {
            Id = Guid.NewGuid(),
            Name = name,
            IsDefault = request.IsDefault
        };

        dbContext.InventoryWarehouses.Add(warehouseEntity);
        dbContext.SaveChanges();

        return Success(ToReference(warehouseEntity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> UpdateWarehouse(Guid id, UpdateInventoryWarehouseDto request)
    {
        var warehouseEntity = dbContext.InventoryWarehouses.FirstOrDefault(row => row.Id == id);
        if (warehouseEntity is null)
        {
            return Failure<InventoryReferenceOptionDto>("id", "Склад не найден");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите название склада");
        }

        if (dbContext.InventoryWarehouses.Any(warehouse =>
            warehouse.Id != id &&
            warehouse.Name.ToLower() == name.ToLower()))
        {
            return Failure<InventoryReferenceOptionDto>("name", "Склад с таким названием уже существует");
        }

        if (request.IsDefault)
        {
            ClearDefaultWarehouse();
        }

        warehouseEntity.Name = name;
        warehouseEntity.IsDefault = request.IsDefault;
        warehouseEntity.IsArchived = request.IsArchived;
        dbContext.SaveChanges();

        return Success(ToReference(warehouseEntity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> CreateCustodyCategory(CreateInventorySimpleReferenceDto request)
    {
        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите название категории");
        }

        if (dbContext.InventoryCustodyCategories.Any(row => row.Name.ToLower() == name.ToLower() && !row.IsArchived))
        {
            return Failure<InventoryReferenceOptionDto>("name", "Категория с таким названием уже существует");
        }

        var entity = new InventoryCustodyCategoryEntity { Id = Guid.NewGuid(), Name = name };
        dbContext.InventoryCustodyCategories.Add(entity);
        dbContext.SaveChanges();
        return Success(ToReference(entity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> UpdateCustodyCategory(Guid id, UpdateInventorySimpleReferenceDto request)
    {
        var entity = dbContext.InventoryCustodyCategories.FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<InventoryReferenceOptionDto>("id", "Категория не найдена");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите название категории");
        }

        entity.Name = name;
        entity.IsArchived = request.IsArchived;
        dbContext.SaveChanges();
        return Success(ToReference(entity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> CreateReturnReason(CreateInventorySimpleReferenceDto request)
    {
        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите причину возврата");
        }

        var entity = new InventoryReturnReasonEntity { Id = Guid.NewGuid(), Name = name };
        dbContext.InventoryReturnReasons.Add(entity);
        dbContext.SaveChanges();
        return Success(ToReference(entity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> UpdateReturnReason(Guid id, UpdateInventorySimpleReferenceDto request)
    {
        var entity = dbContext.InventoryReturnReasons.FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<InventoryReferenceOptionDto>("id", "Причина возврата не найдена");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите причину возврата");
        }

        entity.Name = name;
        entity.IsArchived = request.IsArchived;
        dbContext.SaveChanges();
        return Success(ToReference(entity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> CreateWriteOffReason(CreateInventorySimpleReferenceDto request)
    {
        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите причину списания");
        }

        var entity = new InventoryWriteOffReasonEntity { Id = Guid.NewGuid(), Name = name };
        dbContext.InventoryWriteOffReasons.Add(entity);
        dbContext.SaveChanges();
        return Success(ToReference(entity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> UpdateWriteOffReason(Guid id, UpdateInventorySimpleReferenceDto request)
    {
        var entity = dbContext.InventoryWriteOffReasons.FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<InventoryReferenceOptionDto>("id", "Причина списания не найдена");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите причину списания");
        }

        entity.Name = name;
        entity.IsArchived = request.IsArchived;
        dbContext.SaveChanges();
        return Success(ToReference(entity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> CreateEmployeeReference(string kind, CreateInventorySimpleReferenceDto request)
    {
        var normalizedKind = NormalizeEmployeeReferenceKind(kind);
        if (normalizedKind.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("kind", "Неподдерживаемый тип справочника сотрудников");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите значение справочника");
        }

        if (dbContext.AccountingEmployeeReferences.Any(row =>
            row.Kind == normalizedKind &&
            row.Name.ToLower() == name.ToLower()))
        {
            return Failure<InventoryReferenceOptionDto>("name", "Такое значение уже есть в справочнике");
        }

        var entity = new AccountingEmployeeReferenceEntity
        {
            Id = Guid.NewGuid(),
            Kind = normalizedKind,
            Name = name,
            CreatedAt = DateTimeOffset.UtcNow
        };

        dbContext.AccountingEmployeeReferences.Add(entity);
        dbContext.SaveChanges();
        return Success(ToReference(entity));
    }

    public InventoryCommandResult<InventoryReferenceOptionDto> UpdateEmployeeReference(string kind, Guid id, UpdateInventorySimpleReferenceDto request)
    {
        var normalizedKind = NormalizeEmployeeReferenceKind(kind);
        if (normalizedKind.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("kind", "Неподдерживаемый тип справочника сотрудников");
        }

        var entity = dbContext.AccountingEmployeeReferences.FirstOrDefault(row => row.Id == id && row.Kind == normalizedKind);
        if (entity is null)
        {
            return Failure<InventoryReferenceOptionDto>("id", "Значение справочника не найдено");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryReferenceOptionDto>("name", "Введите значение справочника");
        }

        if (dbContext.AccountingEmployeeReferences.Any(row =>
            row.Id != id &&
            row.Kind == normalizedKind &&
            row.Name.ToLower() == name.ToLower()))
        {
            return Failure<InventoryReferenceOptionDto>("name", "Такое значение уже есть в справочнике");
        }

        entity.Name = name;
        entity.IsArchived = request.IsArchived;
        dbContext.SaveChanges();
        return Success(ToReference(entity));
    }

    public InventoryCommandResult<InventoryItemSetDto> CreateItemSet(CreateInventoryItemSetDto request)
    {
        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryItemSetDto>("name", "Введите название набора");
        }

        var entity = new InventoryItemSetEntity { Id = Guid.NewGuid(), Name = name };
        dbContext.InventoryItemSets.Add(entity);
        dbContext.SaveChanges();
        return Success(new InventoryItemSetDto(entity.Id, entity.Name, !entity.IsArchived, 0));
    }

    public InventoryCommandResult<InventoryItemSetDto> UpdateItemSet(Guid id, UpdateInventoryItemSetDto request)
    {
        var entity = dbContext.InventoryItemSets.Include(row => row.Items).FirstOrDefault(row => row.Id == id);
        if (entity is null)
        {
            return Failure<InventoryItemSetDto>("id", "Набор не найден");
        }

        var name = NormalizeRequired(request.Name);
        if (name.Length == 0)
        {
            return Failure<InventoryItemSetDto>("name", "Введите название набора");
        }

        entity.Name = name;
        entity.IsArchived = request.IsArchived;
        dbContext.SaveChanges();
        return Success(new InventoryItemSetDto(entity.Id, entity.Name, !entity.IsArchived, entity.Items.Count));
    }

    public InventoryCommandResult<InventoryItemSetDetailDto> UpdateItemSetItems(Guid id, UpsertInventoryItemSetItemsDto request)
    {
        var itemSet = dbContext.InventoryItemSets
            .Include(row => row.Items)
            .FirstOrDefault(row => row.Id == id);

        if (itemSet is null)
        {
            return Failure<InventoryItemSetDetailDto>("id", "Набор не найден");
        }

        var rows = request.Items ?? [];
        if (rows.Any(row => row.ItemId == Guid.Empty))
        {
            return Failure<InventoryItemSetDetailDto>("items", "Выберите номенклатуру для каждой строки набора");
        }

        if (rows.Any(row => row.Quantity <= 0))
        {
            return Failure<InventoryItemSetDetailDto>("quantity", "Количество в наборе должно быть больше нуля");
        }

        if (rows.Select(row => row.ItemId).Distinct().Count() != rows.Count)
        {
            return Failure<InventoryItemSetDetailDto>("items", "Набор содержит дубли номенклатуры");
        }

        var itemIds = rows.Select(row => row.ItemId).ToArray();
        var existingItems = dbContext.InventoryItems
            .Where(item => itemIds.Contains(item.Id))
            .Select(item => item.Id)
            .ToHashSet();

        if (existingItems.Count != itemIds.Length)
        {
            return Failure<InventoryItemSetDetailDto>("items", "Одна или несколько позиций номенклатуры не найдены");
        }

        var requestedByItem = rows.ToDictionary(row => row.ItemId, row => row.Quantity);
        foreach (var existing in itemSet.Items.Where(row => !requestedByItem.ContainsKey(row.ItemId)).ToArray())
        {
            dbContext.InventoryItemSetItems.Remove(existing);
        }

        foreach (var row in rows)
        {
            var existing = itemSet.Items.FirstOrDefault(item => item.ItemId == row.ItemId);
            if (existing is null)
            {
                itemSet.Items.Add(new InventoryItemSetItemEntity
                {
                    Id = Guid.NewGuid(),
                    ItemSetId = itemSet.Id,
                    ItemId = row.ItemId,
                    Quantity = row.Quantity
                });
            }
            else
            {
                existing.Quantity = row.Quantity;
            }
        }

        dbContext.SaveChanges();
        return Success(MapItemSetDetail(LoadItemSet(itemSet.Id)));
    }

    public InventoryCommandResult<InventoryPositionNormDto> UpsertPositionNorm(UpsertInventoryPositionNormDto request)
    {
        var positionName = NormalizeRequired(request.PositionName);
        if (positionName.Length == 0)
        {
            return Failure<InventoryPositionNormDto>("positionName", "Введите должность");
        }

        if (request.Quantity <= 0)
        {
            return Failure<InventoryPositionNormDto>("quantity", "Количество должно быть больше нуля");
        }

        var item = dbContext.InventoryItems.FirstOrDefault(row => row.Id == request.ItemId);
        if (item is null)
        {
            return Failure<InventoryPositionNormDto>("itemId", "Номенклатура не найдена");
        }

        var entity = dbContext.InventoryPositionNorms.FirstOrDefault(row =>
            row.PositionName.ToLower() == positionName.ToLower() &&
            row.ItemId == request.ItemId);
        if (entity is null)
        {
            entity = new InventoryPositionNormEntity { Id = Guid.NewGuid(), PositionName = positionName, ItemId = item.Id };
            dbContext.InventoryPositionNorms.Add(entity);
        }

        entity.Quantity = request.Quantity;
        entity.LifeMonths = request.LifeMonths;
        dbContext.SaveChanges();
        return Success(new InventoryPositionNormDto(entity.Id, entity.PositionName, item.Id, item.Name, entity.Quantity, entity.LifeMonths));
    }

    public InventoryCommandResult<InventoryItemDto> CreateItem(UpsertInventoryItemDto request)
    {
        var validation = ValidateItem(request);
        if (validation is not null)
        {
            return validation;
        }

        var name = NormalizeRequired(request.Name);
        if (dbContext.InventoryItems.Any(item => item.Name.ToLower() == name.ToLower()))
        {
            return Failure<InventoryItemDto>("name", "Позиция с таким названием уже существует");
        }

        var itemEntity = new InventoryItemEntity
        {
            Id = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow
        };

        ApplyItem(itemEntity, request);
        dbContext.InventoryItems.Add(itemEntity);
        dbContext.SaveChanges();

        return Success(MapItem(LoadItem(itemEntity.Id), StockTotals.Empty));
    }

    public InventoryCommandResult<InventoryItemDto> UpdateItem(Guid id, UpsertInventoryItemDto request)
    {
        var itemEntity = dbContext.InventoryItems.FirstOrDefault(item => item.Id == id);
        if (itemEntity is null)
        {
            return Failure<InventoryItemDto>("id", "Позиция не найдена");
        }

        var validation = ValidateItem(request);
        if (validation is not null)
        {
            return validation;
        }

        var name = NormalizeRequired(request.Name);
        if (dbContext.InventoryItems.Any(item => item.Id != id && item.Name.ToLower() == name.ToLower()))
        {
            return Failure<InventoryItemDto>("name", "Позиция с таким названием уже существует");
        }

        ApplyItem(itemEntity, request);
        dbContext.SaveChanges();

        return Success(MapItem(LoadItem(id), GetStockByItem(id)));
    }

    public InventoryCommandResult<InventoryStockBalanceDto> SetInitialStock(InventoryInitialStockDto request)
    {
        if (request.Quantity < 0)
        {
            return Failure<InventoryStockBalanceDto>("quantity", "Остаток не может быть отрицательным");
        }

        var item = dbContext.InventoryItems
            .Include(row => row.Unit)
            .FirstOrDefault(row => row.Id == request.ItemId);
        if (item is null)
        {
            return Failure<InventoryStockBalanceDto>("itemId", "Позиция не найдена");
        }

        var warehouse = dbContext.InventoryWarehouses.FirstOrDefault(row => row.Id == request.WarehouseId);
        if (warehouse is null)
        {
            return Failure<InventoryStockBalanceDto>("warehouseId", "Склад не найден");
        }

        var current = GetStockByItemAndWarehouse(request.ItemId, request.WarehouseId);
        var delta = request.Quantity - current.Physical;
        if (delta != 0)
        {
            dbContext.InventoryStockMoves.Add(new InventoryStockMoveEntity
            {
                Id = Guid.NewGuid(),
                ItemId = item.Id,
                WarehouseId = warehouse.Id,
                QuantityDelta = delta,
                MovedAt = request.MovedAt ?? DateTimeOffset.UtcNow,
                MoveType = "initial_balance",
                ReferenceType = string.IsNullOrWhiteSpace(request.Note) ? "manual" : request.Note.Trim()
            });
            dbContext.SaveChanges();
        }

        var stock = GetStockByItemAndWarehouse(request.ItemId, request.WarehouseId);
        return Success(new InventoryStockBalanceDto(
            item.Id,
            item.Name,
            warehouse.Id,
            warehouse.Name,
            stock.Available,
            stock.Physical,
            stock.Reserved,
            stock.Available,
            item.Unit?.Symbol ?? item.Unit?.Name ?? string.Empty,
            stock.Status));
    }

    public InventoryCommandResult<InventoryDocumentDto> CreateOperation(CreateInventoryOperationDto request)
    {
        var type = NormalizeOperationType(request.Type);
        if (type.Length == 0)
        {
            return Failure<InventoryDocumentDto>("type", "Выберите тип операции");
        }

        if (request.Quantity <= 0)
        {
            return Failure<InventoryDocumentDto>("quantity", "Количество должно быть больше нуля");
        }

        var item = dbContext.InventoryItems
            .Include(row => row.Unit)
            .FirstOrDefault(row => row.Id == request.ItemId);
        if (item is null)
        {
            return Failure<InventoryDocumentDto>("itemId", "Позиция не найдена");
        }

        var warehouse = dbContext.InventoryWarehouses.FirstOrDefault(row => row.Id == request.WarehouseId);
        if (warehouse is null)
        {
            return Failure<InventoryDocumentDto>("warehouseId", "Склад не найден");
        }

        EmployeeEntity? employee = null;
        if (request.EmployeeId is not null)
        {
            employee = dbContext.Employees.FirstOrDefault(row => row.Id == request.EmployeeId.Value);
            if (employee is null)
            {
                return Failure<InventoryDocumentDto>("employeeId", "Сотрудник не найден");
            }
        }

        var quantityDelta = ToQuantityDelta(type, request.Quantity);
        if (quantityDelta < 0)
        {
            var stock = GetStockByItemAndWarehouse(item.Id, warehouse.Id);
            if (stock.Available < Math.Abs(quantityDelta))
            {
                return Failure<InventoryDocumentDto>("quantity", "Недостаточно доступного остатка на складе");
            }
        }

        var documentId = Guid.NewGuid();
        var movedAt = request.MovedAt ?? DateTimeOffset.UtcNow;
        var move = new InventoryStockMoveEntity
        {
            Id = Guid.NewGuid(),
            EmployeeId = employee?.Id,
            ItemId = item.Id,
            MovedAt = movedAt,
            MoveType = type,
            QuantityDelta = quantityDelta,
            ReferenceId = documentId,
            ReferenceType = NormalizeOptional(request.Comment).Length == 0 ? "inventory_operation" : NormalizeOptional(request.Comment),
            WarehouseId = warehouse.Id
        };

        dbContext.InventoryStockMoves.Add(move);
        dbContext.SaveChanges();

        return Success(new InventoryDocumentDto(
            documentId,
            $"INV-{movedAt:yyyyMMdd}-{documentId.ToString("N")[..6].ToUpperInvariant()}",
            type,
            employee?.FullName ?? string.Empty,
            "posted",
            movedAt.UtcDateTime,
            item.Name,
            warehouse.Name,
            quantityDelta,
            item.Unit?.Symbol ?? item.Unit?.Name ?? string.Empty,
            move.ReferenceType));
    }

    private InventoryCommandResult<InventoryItemDto>? ValidateItem(UpsertInventoryItemDto request)
    {
        if (NormalizeRequired(request.Name).Length == 0)
        {
            return Failure<InventoryItemDto>("name", "Введите название позиции");
        }

        if (request.CategoryId is not null && !dbContext.InventoryCategories.Any(category => category.Id == request.CategoryId.Value))
        {
            return Failure<InventoryItemDto>("categoryId", "Категория не найдена");
        }

        if (request.UnitId is not null && !dbContext.InventoryUnits.Any(unit => unit.Id == request.UnitId.Value))
        {
            return Failure<InventoryItemDto>("unitId", "Единица измерения не найдена");
        }

        if (request.DefaultLifeMonths is < 0)
        {
            return Failure<InventoryItemDto>("defaultLifeMonths", "Срок службы не может быть отрицательным");
        }

        if (request.DefaultUnitPriceMinor is < 0)
        {
            return Failure<InventoryItemDto>("defaultUnitPriceMinor", "Цена не может быть отрицательной");
        }

        if (request.MinStockQty is < 0)
        {
            return Failure<InventoryItemDto>("minStockQty", "Минимальный остаток не может быть отрицательным");
        }

        return null;
    }

    private static void ApplyItem(InventoryItemEntity item, UpsertInventoryItemDto request)
    {
        item.Name = NormalizeRequired(request.Name);
        item.Sku = NormalizeOptional(request.Sku);
        item.CategoryId = request.CategoryId;
        item.UnitId = request.UnitId;
        item.ItemKind = NormalizeOptional(request.ItemKind);
        item.NormItemName = NormalizeOptional(request.NormItemName);
        item.ActualItemName = NormalizeOptional(request.ActualItemName);
        item.BrandName = NormalizeOptional(request.BrandName);
        item.ModelName = NormalizeOptional(request.ModelName);
        item.Article = NormalizeOptional(request.Article);
        item.ProtectionClass = NormalizeOptional(request.ProtectionClass);
        item.ClothingSize = NormalizeOptional(request.ClothingSize);
        item.HeightSize = NormalizeOptional(request.HeightSize);
        item.ShoeSize = NormalizeOptional(request.ShoeSize);
        item.HeadSize = NormalizeOptional(request.HeadSize);
        item.GloveSize = NormalizeOptional(request.GloveSize);
        item.RespiratorSize = NormalizeOptional(request.RespiratorSize);
        item.DefaultLifeMonths = request.DefaultLifeMonths;
        item.DefaultUnitPriceMinor = request.DefaultUnitPriceMinor;
        item.MinStockQty = request.MinStockQty;
        item.IsConsumable = request.IsConsumable;
        item.TrackLife = request.TrackLife;
        item.TrackingType = NormalizeOptional(request.TrackingType).Length == 0 ? "quantity" : NormalizeOptional(request.TrackingType);
        item.Comment = NormalizeOptional(request.Comment);
        item.IsActive = request.IsActive;
    }

    private InventoryItemEntity LoadItem(Guid id) =>
        dbContext.InventoryItems
            .AsNoTracking()
            .Include(item => item.Category)
            .Include(item => item.Unit)
            .First(item => item.Id == id);

    private InventoryItemSetEntity LoadItemSet(Guid id) =>
        dbContext.InventoryItemSets
            .AsNoTracking()
            .Include(itemSet => itemSet.Items)
                .ThenInclude(row => row.Item)
                    .ThenInclude(item => item.Category)
            .Include(itemSet => itemSet.Items)
                .ThenInclude(row => row.Item)
                    .ThenInclude(item => item.Unit)
            .First(itemSet => itemSet.Id == id);

    private void ClearDefaultWarehouse()
    {
        foreach (var warehouse in dbContext.InventoryWarehouses.Where(warehouse => warehouse.IsDefault))
        {
            warehouse.IsDefault = false;
        }
    }

    private StockTotals GetStockByItem(Guid itemId) =>
        BuildStockTotals(dbContext.InventoryStockMoves
            .Where(move => move.ItemId == itemId)
            .Select(move => new MoveSummary(move.MoveType, move.QuantityDelta))
            .ToList());

    private StockTotals GetStockByItemAndWarehouse(Guid itemId, Guid warehouseId) =>
        BuildStockTotals(dbContext.InventoryStockMoves
            .Where(move => move.ItemId == itemId && move.WarehouseId == warehouseId)
            .Select(move => new MoveSummary(move.MoveType, move.QuantityDelta))
            .ToList());

    private static StockTotals BuildStockTotals(IEnumerable<MoveSummary> rows)
    {
        var physical = 0m;
        var reserved = 0m;
        var tracked = false;

        foreach (var row in rows)
        {
            tracked = true;
            if (ReservationMoveTypes.Contains(row.MoveType))
            {
                reserved += row.Quantity < 0 ? -row.Quantity : row.Quantity;
            }
            else
            {
                physical += row.Quantity;
            }
        }

        return new StockTotals(physical, Math.Max(0m, reserved), tracked);
    }

    private static InventoryItemDto MapItem(InventoryItemEntity item, StockTotals stock) =>
        new(
            item.Id,
            item.Name,
            item.Sku,
            item.CategoryId,
            item.Category?.Name ?? string.Empty,
            item.UnitId,
            item.Unit?.Symbol ?? item.Unit?.Name ?? string.Empty,
            stock.Available,
            stock.Physical,
            stock.Reserved,
            stock.Available,
            stock.Status,
            item.MinStockQty,
            item.ItemKind,
            item.NormItemName,
            item.ActualItemName,
            item.BrandName,
            item.ModelName,
            item.Article,
            item.ProtectionClass,
            item.ClothingSize,
            item.HeightSize,
            item.ShoeSize,
            item.HeadSize,
            item.GloveSize,
            item.RespiratorSize,
            item.DefaultLifeMonths,
            item.DefaultUnitPriceMinor,
            item.TrackingType,
            item.Comment,
            item.IsConsumable,
            item.TrackLife,
            item.IsActive,
            item.IsActive ? "active" : "inactive");

    private InventoryItemSetDetailDto MapItemSetDetail(InventoryItemSetEntity itemSet)
    {
        var items = itemSet.Items
            .OrderBy(row => row.Item.Name)
            .Select(row => new InventoryItemSetItemDto(
                row.Id,
                row.Quantity,
                MapItem(row.Item, GetStockByItem(row.ItemId))))
            .ToList();

        return new InventoryItemSetDetailDto(itemSet.Id, itemSet.Name, !itemSet.IsArchived, items);
    }

    private static InventoryReferenceOptionDto ToReference(InventoryCategoryEntity category) =>
        new(category.Id, category.Name, string.Empty, !category.IsArchived);

    private static InventoryReferenceOptionDto ToReference(InventoryUnitEntity unit) =>
        new(unit.Id, unit.Name, unit.Symbol, true);

    private static InventoryReferenceOptionDto ToReference(InventoryWarehouseEntity warehouse) =>
        new(warehouse.Id, warehouse.Name, warehouse.IsDefault ? "default" : string.Empty, !warehouse.IsArchived);

    private static InventoryReferenceOptionDto ToReference(InventoryCustodyCategoryEntity category) =>
        new(category.Id, category.Name, string.Empty, !category.IsArchived);

    private static InventoryReferenceOptionDto ToReference(InventoryReturnReasonEntity reason) =>
        new(reason.Id, reason.Name, string.Empty, !reason.IsArchived);

    private static InventoryReferenceOptionDto ToReference(InventoryWriteOffReasonEntity reason) =>
        new(reason.Id, reason.Name, string.Empty, !reason.IsArchived);

    private static InventoryReferenceOptionDto ToReference(AccountingEmployeeReferenceEntity reference) =>
        new(reference.Id, reference.Name, reference.Kind, !reference.IsArchived);

    private static InventoryCommandResult<T> Success<T>(T value) => new(value, EmptyErrors);

    private static InventoryCommandResult<T> Failure<T>(string key, string message) =>
        new(default, new Dictionary<string, string[]> { [key] = [message] });

    private static string NormalizeRequired(string? value) => value?.Trim() ?? string.Empty;

    private static string NormalizeOptional(string? value) => value?.Trim() ?? string.Empty;

    private static string NormalizeEmployeeReferenceKind(string? value)
    {
        var kind = NormalizeOptional(value).ToLowerInvariant();
        return kind is "position" or "department" or "group" ? kind : string.Empty;
    }

    private static string NormalizeOperationType(string? value)
    {
        var type = NormalizeOptional(value).ToLowerInvariant();
        return type is "receipt" or "issue" or "return" or "write_off" ? type : string.Empty;
    }

    private static decimal ToQuantityDelta(string type, decimal quantity) =>
        type is "issue" or "write_off" ? -quantity : quantity;

    private static readonly IReadOnlyDictionary<string, string[]> EmptyErrors =
        new Dictionary<string, string[]>();

    private sealed record MoveSummary(string MoveType, decimal Quantity);

    private sealed record StockTotals(decimal Physical, decimal Reserved, bool IsTracked)
    {
        public static readonly StockTotals Empty = new(0m, 0m, false);

        public decimal Available => Math.Max(0m, Physical - Reserved);

        public string Status
        {
            get
            {
                if (!IsTracked)
                {
                    return "not_tracked";
                }

                if (Available > 0)
                {
                    return "available";
                }

                if (Reserved > 0 && Physical > 0)
                {
                    return "reserved";
                }

                return "not_available";
            }
        }
    }
}

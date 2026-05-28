using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfInventoryCatalogQuery(Patrol360DbContext dbContext) : IInventoryCatalogQuery
{
    private static readonly IReadOnlyDictionary<string, string[]> EmptyErrors = new Dictionary<string, string[]>();

    private static readonly HashSet<string> ReservationMoveTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "reservation",
        "reserve",
        "ppe_reserve",
        "ppe_reservation"
    };

    public InventoryOverviewDto GetOverview()
    {
        var stockByItem = GetStockByItem();
        var items = dbContext.InventoryItems.AsNoTracking().ToList();
        var criticalStockItems = items.Count(item =>
            item.IsActive &&
            item.MinStockQty is not null &&
            stockByItem.GetValueOrDefault(item.Id, StockTotals.Empty).Available < item.MinStockQty.Value);

        return new InventoryOverviewDto(
            EmployeesTotal: dbContext.Employees.Count(),
            ItemsTotal: items.Count,
            CategoriesTotal: dbContext.InventoryCategories.Count(category => !category.IsArchived),
            UnitsTotal: dbContext.InventoryUnits.Count(),
            WarehousesTotal: dbContext.InventoryWarehouses.Count(warehouse => !warehouse.IsArchived),
            CriticalStockItems: criticalStockItems,
            ActiveIssues: 0,
            ActiveCustodyRecords: dbContext.InventoryCustodyRecords.Count(record => record.ArchivedAt == null && record.Status == "in_use"),
            PpeCardsTotal: dbContext.InventoryPpeCards.Count(card => card.ArchivedAt == null),
            ReportsReady: 5,
            Attention: BuildAttention(items, stockByItem));
    }

    public InventoryListResponseDto<InventoryItemDto> GetItems(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var itemsQuery = dbContext.InventoryItems
            .AsNoTracking()
            .Include(item => item.Category)
            .Include(item => item.Unit)
            .AsQueryable();

        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            itemsQuery = itemsQuery.Where(item =>
                item.Name.ToLower().Contains(search) ||
                item.Sku.ToLower().Contains(search) ||
                item.Article.ToLower().Contains(search) ||
                item.ItemKind.ToLower().Contains(search) ||
                item.NormItemName.ToLower().Contains(search) ||
                item.ActualItemName.ToLower().Contains(search) ||
                item.BrandName.ToLower().Contains(search) ||
                item.ModelName.ToLower().Contains(search) ||
                item.ProtectionClass.ToLower().Contains(search) ||
                item.Comment.ToLower().Contains(search));
        }

        if (query.Status is not null)
        {
            var status = query.Status.Trim().ToLowerInvariant();
            if (status is "active" or "inactive")
            {
                itemsQuery = itemsQuery.Where(item => item.IsActive == (status == "active"));
            }
        }

        if (query.CategoryId is not null)
        {
            itemsQuery = itemsQuery.Where(item => item.CategoryId == query.CategoryId.Value);
        }

        if (query.UnitId is not null)
        {
            itemsQuery = itemsQuery.Where(item => item.UnitId == query.UnitId.Value);
        }

        var trackingType = NormalizeQuery(query.TrackingType);
        if (trackingType.Length > 0 && trackingType != "all")
        {
            itemsQuery = itemsQuery.Where(item => item.TrackingType.ToLower() == trackingType);
        }

        var itemKind = NormalizeQuery(query.ItemKind);
        if (itemKind.Length > 0 && itemKind != "all")
        {
            itemsQuery = itemsQuery.Where(item => item.ItemKind.ToLower() == itemKind);
        }

        var total = itemsQuery.Count();
        var items = itemsQuery
            .OrderBy(item => item.Name)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        var stockByItem = GetStockByItem(items.Select(item => item.Id));
        var rows = items
            .Select(item => MapItem(item, stockByItem.GetValueOrDefault(item.Id, StockTotals.Empty)))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryItemFacetsDto GetItemFacets()
    {
        var items = dbContext.InventoryItems
            .AsNoTracking()
            .Include(item => item.Category)
            .Include(item => item.Unit)
            .ToList();

        return new InventoryItemFacetsDto(
            Total: items.Count,
            Active: items.Count(item => item.IsActive),
            Inactive: items.Count(item => !item.IsActive),
            Categories: items
                .Where(item => item.CategoryId is not null)
                .GroupBy(item => new
                {
                    Id = item.CategoryId!.Value.ToString(),
                    Name = item.Category?.Name ?? string.Empty
                })
                .Where(group => group.Key.Name.Length > 0)
                .OrderBy(group => group.Key.Name)
                .Select(group => new InventoryFacetDto(group.Key.Id, group.Key.Name, group.Count()))
                .ToList(),
            Units: items
                .Where(item => item.UnitId is not null)
                .GroupBy(item => new
                {
                    Id = item.UnitId!.Value.ToString(),
                    Name = item.Unit?.Symbol ?? item.Unit?.Name ?? string.Empty
                })
                .Where(group => group.Key.Name.Length > 0)
                .OrderBy(group => group.Key.Name)
                .Select(group => new InventoryFacetDto(group.Key.Id, group.Key.Name, group.Count()))
                .ToList(),
            TrackingTypes: items
                .GroupBy(item => string.IsNullOrWhiteSpace(item.TrackingType) ? "quantity" : item.TrackingType)
                .OrderBy(group => group.Key)
                .Select(group => new InventoryFacetDto(group.Key, group.Key, group.Count()))
                .ToList(),
            ItemKinds: items
                .Where(item => !string.IsNullOrWhiteSpace(item.ItemKind))
                .GroupBy(item => item.ItemKind)
                .OrderBy(group => group.Key)
                .Select(group => new InventoryFacetDto(group.Key, group.Key, group.Count()))
                .ToList());
    }

    public InventoryListResponseDto<InventoryStockBalanceDto> GetStock(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var stockMoveQuery = dbContext.InventoryStockMoves
            .AsNoTracking()
            .Select(move => new
            {
                move.ItemId,
                ItemName = move.Item.Name,
                Unit = move.Item.Unit == null ? string.Empty : move.Item.Unit.Symbol,
                move.WarehouseId,
                WarehouseName = move.Warehouse.Name,
                move.MoveType,
                move.QuantityDelta
            });

        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            stockMoveQuery = stockMoveQuery.Where(move =>
                move.ItemName.ToLower().Contains(search) ||
                move.WarehouseName.ToLower().Contains(search));
        }

        if (query.ItemId is not null)
        {
            stockMoveQuery = stockMoveQuery.Where(move => move.ItemId == query.ItemId.Value);
        }

        var stockMoveRows = stockMoveQuery
            .GroupBy(move => new
            {
                move.ItemId,
                move.ItemName,
                move.Unit,
                move.WarehouseId,
                move.WarehouseName,
                move.MoveType
            })
            .Select(group => new
            {
                group.Key.ItemId,
                group.Key.ItemName,
                group.Key.Unit,
                group.Key.WarehouseId,
                group.Key.WarehouseName,
                group.Key.MoveType,
                Quantity = group.Sum(move => move.QuantityDelta)
            })
            .ToList();

        var balances = stockMoveRows
            .GroupBy(move => new
            {
                move.ItemId,
                move.ItemName,
                move.Unit,
                move.WarehouseId,
                move.WarehouseName
            })
            .Select(group => new
            {
                group.Key.ItemId,
                group.Key.ItemName,
                group.Key.Unit,
                group.Key.WarehouseId,
                group.Key.WarehouseName,
                Stock = BuildStockTotals(group.Select(move => (move.MoveType, move.Quantity)))
            })
            .OrderBy(balance => balance.ItemName)
            .ThenBy(balance => balance.WarehouseName)
            .ToList();

        var total = balances.Count;
        var rows = balances
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .Select(balance => new InventoryStockBalanceDto(
                balance.ItemId,
                balance.ItemName,
                balance.WarehouseId,
                balance.WarehouseName,
                balance.Stock.Available,
                balance.Stock.Physical,
                balance.Stock.Reserved,
                balance.Stock.Available,
                balance.Unit,
                balance.Stock.Status))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryListResponseDto<InventoryDocumentDto> GetDocuments(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var stockMoveQuery = dbContext.InventoryStockMoves
            .AsNoTracking()
            .Include(move => move.Employee)
            .Include(move => move.Item)
                .ThenInclude(item => item.Unit)
            .Include(move => move.Warehouse)
            .AsQueryable();

        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            stockMoveQuery = stockMoveQuery.Where(move =>
                move.Item.Name.ToLower().Contains(search) ||
                move.Warehouse.Name.ToLower().Contains(search) ||
                (move.Employee != null && move.Employee.FullName.ToLower().Contains(search)) ||
                move.MoveType.ToLower().Contains(search));
        }

        if (query.Status is not null)
        {
            var type = query.Status.Trim().ToLowerInvariant();
            if (type.Length > 0)
            {
                stockMoveQuery = stockMoveQuery.Where(move => move.MoveType.ToLower() == type);
            }
        }

        var total = stockMoveQuery.Count();
        var rows = stockMoveQuery
            .OrderByDescending(move => move.MovedAt)
            .ThenByDescending(move => move.Id)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList()
            .Select(MapDocument)
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventorySettingsDto GetSettings() =>
        new(
            Categories: dbContext.InventoryCategories
                .AsNoTracking()
                .Where(category => !category.IsArchived)
                .OrderBy(category => category.Name)
                .Select(category => new InventoryReferenceOptionDto(category.Id, category.Name, string.Empty, true))
                .ToList(),
            Units: dbContext.InventoryUnits
                .AsNoTracking()
                .OrderBy(unit => unit.Name)
                .Select(unit => new InventoryReferenceOptionDto(unit.Id, unit.Name, unit.Symbol, true))
                .ToList(),
            Warehouses: dbContext.InventoryWarehouses
                .AsNoTracking()
                .Where(warehouse => !warehouse.IsArchived)
                .OrderByDescending(warehouse => warehouse.IsDefault)
                .ThenBy(warehouse => warehouse.Name)
                .Select(warehouse => new InventoryReferenceOptionDto(warehouse.Id, warehouse.Name, warehouse.IsDefault ? "default" : string.Empty, true))
                .ToList(),
            CustodyCategories: dbContext.InventoryCustodyCategories
                .AsNoTracking()
                .Where(category => !category.IsArchived)
                .OrderBy(category => category.Name)
                .Select(category => new InventoryReferenceOptionDto(category.Id, category.Name, string.Empty, true))
                .ToList(),
            ReturnReasons: dbContext.InventoryReturnReasons
                .AsNoTracking()
                .Where(reason => !reason.IsArchived)
                .OrderBy(reason => reason.Name)
                .Select(reason => new InventoryReferenceOptionDto(reason.Id, reason.Name, string.Empty, true))
                .ToList(),
            WriteOffReasons: dbContext.InventoryWriteOffReasons
                .AsNoTracking()
                .Where(reason => !reason.IsArchived)
                .OrderBy(reason => reason.Name)
                .Select(reason => new InventoryReferenceOptionDto(reason.Id, reason.Name, string.Empty, true))
                .ToList(),
            ItemSets: dbContext.InventoryItemSets
                .AsNoTracking()
                .Include(itemSet => itemSet.Items)
                .OrderBy(itemSet => itemSet.Name)
                .Select(itemSet => new InventoryItemSetDto(itemSet.Id, itemSet.Name, !itemSet.IsArchived, itemSet.Items.Count))
                .ToList(),
            PositionNorms: dbContext.InventoryPositionNorms
                .AsNoTracking()
                .Include(norm => norm.Item)
                .OrderBy(norm => norm.PositionName)
                .ThenBy(norm => norm.Item.Name)
                .Select(norm => new InventoryPositionNormDto(norm.Id, norm.PositionName, norm.ItemId, norm.Item.Name, norm.Quantity, norm.LifeMonths))
                .ToList(),
            EmployeePositions: GetEmployeeReferenceOptions("position", dbContext.Employees.Select(employee => employee.Position)),
            EmployeeDepartments: GetEmployeeReferenceOptions("department", dbContext.Employees.Select(employee => employee.Department)),
            EmployeeGroups: GetEmployeeReferenceOptions("group", dbContext.Employees.Select(employee => employee.EmployeeGroup)));

    private IReadOnlyList<InventoryReferenceOptionDto> GetEmployeeReferenceOptions(string kind, IQueryable<string> employeeValues)
    {
        var storedReferences = dbContext.AccountingEmployeeReferences
            .AsNoTracking()
            .Where(reference => reference.Kind == kind && !reference.IsArchived)
            .Select(reference => new { reference.Id, reference.Name })
            .ToList();
        var knownNames = storedReferences
            .Select(reference => reference.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var derivedReferences = employeeValues
            .Where(value => value != "")
            .Distinct()
            .ToList()
            .Where(value => !knownNames.Contains(value))
            .Select(value => new InventoryReferenceOptionDto(Guid.Empty, value, "derived", true));

        return storedReferences
            .Select(reference => new InventoryReferenceOptionDto(reference.Id, reference.Name, string.Empty, true))
            .Concat(derivedReferences)
            .OrderBy(reference => reference.Name)
            .ToList();
    }

    public InventoryCommandResult<InventoryItemSetDetailDto> GetItemSet(Guid id)
    {
        var itemSet = dbContext.InventoryItemSets
            .AsNoTracking()
            .Include(row => row.Items)
                .ThenInclude(row => row.Item)
                    .ThenInclude(item => item.Category)
            .Include(row => row.Items)
                .ThenInclude(row => row.Item)
                    .ThenInclude(item => item.Unit)
            .FirstOrDefault(row => row.Id == id && !row.IsArchived);

        if (itemSet is null)
        {
            return Failure<InventoryItemSetDetailDto>("id", "Набор не найден");
        }

        return Success(MapItemSetDetail(itemSet));
    }

    public InventoryCommandResult<IReadOnlyList<InventoryItemSetItemDto>> GetItemSetItems(Guid id)
    {
        var result = GetItemSet(id);
        if (!result.Succeeded || result.Value is null)
        {
            return Failure<IReadOnlyList<InventoryItemSetItemDto>>("id", "Набор не найден");
        }

        return Success(result.Value.Items);
    }

    public InventoryDbHealthDto GetDbHealth()
    {
        var issues = new List<InventoryDbHealthIssueDto>();

        AddIssue(
            issues,
            "legacy.items.synthetic_names",
            "warning",
            "inventory.items",
            dbContext.InventoryItems.AsNoTracking().Count(item => item.Name.StartsWith("Legacy item ")),
            "Синтетические названия номенклатуры",
            "Найдены позиции, созданные старым импортом без исходного названия. Проверьте legacy_id и исходные item-таблицы.");

        AddIssue(
            issues,
            "legacy.categories.synthetic_names",
            "warning",
            "inventory.categories",
            dbContext.InventoryCategories.AsNoTracking().Count(category => category.Name.StartsWith("Legacy category ")),
            "Синтетические категории",
            "Есть категории-заглушки из legacy-import. Лучше заменить их реальными названиями из старой базы.");

        AddIssue(
            issues,
            "legacy.units.synthetic_names",
            "warning",
            "inventory.units",
            dbContext.InventoryUnits.AsNoTracking().Count(unit => unit.Name.StartsWith("Legacy unit ")),
            "Синтетические единицы измерения",
            "Есть единицы измерения-заглушки. Они мешают корректной печати и отчетам.");

        AddIssue(
            issues,
            "legacy.warehouses.synthetic_names",
            "warning",
            "inventory.warehouses",
            dbContext.InventoryWarehouses.AsNoTracking().Count(warehouse => warehouse.Name.StartsWith("Legacy warehouse ")),
            "Синтетические склады",
            "Найдены склады-заглушки из старого импорта. Проверьте mapping складов.");

        AddIssue(
            issues,
            "legacy.employees.synthetic_names",
            "warning",
            "employees",
            dbContext.Employees.AsNoTracking().Count(employee =>
                employee.FullName.StartsWith("Legacy employee ") ||
                employee.PersonnelNo.StartsWith("legacy-")),
            "Синтетические сотрудники",
            "В справочнике сотрудников остались legacy-заглушки. Перед рабочим учетом их нужно сопоставить с реальными сотрудниками.");

        AddIssue(
            issues,
            "legacy.users.synthetic_logins",
            "warning",
            "site_users",
            dbContext.SiteUsers.AsNoTracking().Count(user => user.Login.StartsWith("legacy-user-")),
            "Синтетические пользователи",
            "Найдены legacy-пользователи без исходного логина. Проверьте перенос web_user и роли Inventory.");

        AddIssue(
            issues,
            "legacy.import.failed_runs",
            "critical",
            "inventory.legacy_import_runs",
            dbContext.InventoryLegacyImportRuns.AsNoTracking().Count(run => run.Status == "failed"),
            "Неудачные запуски legacy-import",
            "Есть завершенные с ошибкой импорты. Откройте журнал запусков и исправьте mapping перед повторным переносом.");

        AddIssue(
            issues,
            "stock.negative_balances",
            "critical",
            "inventory.stock_moves",
            dbContext.InventoryStockMoves
                .AsNoTracking()
                .GroupBy(move => new { move.ItemId, move.WarehouseId })
                .Count(group => group.Sum(move => move.QuantityDelta) < 0),
            "Отрицательные остатки",
            "По некоторым парам позиция + склад сумма движений ушла ниже нуля. Это требует сверки выдач, возвратов и начальных остатков.");

        AddIssue(
            issues,
            "stock.zero_quantity_moves",
            "warning",
            "inventory.stock_moves",
            dbContext.InventoryStockMoves.AsNoTracking().Count(move => move.QuantityDelta == 0),
            "Нулевые складские движения",
            "Найдены движения с количеством 0. Обычно это след от некорректного legacy mapping или ручного теста.");

        AddIssue(
            issues,
            "legacy.items.duplicate_ids",
            "critical",
            "inventory.items",
            dbContext.InventoryItems.AsNoTracking().Where(item => item.LegacyId != null).GroupBy(item => item.LegacyId).Count(group => group.Count() > 1),
            "Дубли legacy_id в номенклатуре",
            "Повторный импорт должен обновлять строки по legacy_id, а не создавать дубли.");

        AddIssue(
            issues,
            "legacy.custody_records.duplicate_ids",
            "critical",
            "inventory.custody_records",
            dbContext.InventoryCustodyRecords.AsNoTracking().Where(record => record.LegacyId != null).GroupBy(record => record.LegacyId).Count(group => group.Count() > 1),
            "Дубли legacy_id в записях под ответственность",
            "Проверьте idempotent import по custody-строкам.");

        AddIssue(
            issues,
            "legacy.ppe_cards.duplicate_ids",
            "critical",
            "inventory.ppe_cards",
            dbContext.InventoryPpeCards.AsNoTracking().Where(card => card.LegacyId != null).GroupBy(card => card.LegacyId).Count(group => group.Count() > 1),
            "Дубли legacy_id в карточках СИЗ",
            "Проверьте idempotent import карточек СИЗ.");

        AddIssue(
            issues,
            "legacy.ppe_lines.duplicate_ids",
            "critical",
            "inventory.ppe_card_lines",
            dbContext.InventoryPpeCardLines.AsNoTracking().Where(line => line.LegacyId != null).GroupBy(line => line.LegacyId).Count(group => group.Count() > 1),
            "Дубли legacy_id в строках СИЗ",
            "Проверьте idempotent import строк СИЗ.");

        return new InventoryDbHealthDto(
            DateTime.UtcNow,
            issues.Count,
            issues.Count(issue => issue.Severity == "critical"),
            issues.Count(issue => issue.Severity == "warning"),
            issues);
    }

    private static void AddIssue(
        ICollection<InventoryDbHealthIssueDto> issues,
        string key,
        string severity,
        string entity,
        int count,
        string title,
        string description)
    {
        if (count <= 0)
        {
            return;
        }

        issues.Add(new InventoryDbHealthIssueDto(key, severity, entity, count, title, description));
    }

    private static InventoryDocumentDto MapDocument(InventoryStockMoveEntity move)
    {
        var documentId = move.ReferenceId ?? move.Id;
        return new InventoryDocumentDto(
            documentId,
            $"INV-{move.MovedAt:yyyyMMdd}-{documentId.ToString("N")[..6].ToUpperInvariant()}",
            move.MoveType,
            move.Employee?.FullName ?? string.Empty,
            "posted",
            move.MovedAt.UtcDateTime,
            move.Item.Name,
            move.Warehouse.Name,
            move.QuantityDelta,
            move.Item.Unit?.Symbol ?? move.Item.Unit?.Name ?? string.Empty,
            move.ReferenceType);
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
        var stockByItem = GetStockByItem(itemSet.Items.Select(row => row.ItemId));
        var items = itemSet.Items
            .OrderBy(row => row.Item.Name)
            .Select(row => new InventoryItemSetItemDto(
                row.Id,
                row.Quantity,
                MapItem(row.Item, stockByItem.GetValueOrDefault(row.ItemId, StockTotals.Empty))))
            .ToList();

        return new InventoryItemSetDetailDto(itemSet.Id, itemSet.Name, !itemSet.IsArchived, items);
    }

    private static IReadOnlyList<InventoryAttentionDto> BuildAttention(
        IReadOnlyList<InventoryItemEntity> items,
        IReadOnlyDictionary<Guid, StockTotals> stockByItem) =>
        items
            .Where(item => item.IsActive && item.MinStockQty is not null)
            .Select(item => new
            {
                Item = item,
                Stock = stockByItem.GetValueOrDefault(item.Id, StockTotals.Empty)
            })
            .Where(item => item.Stock.Available < item.Item.MinStockQty)
            .OrderBy(item => item.Stock.Available)
            .Take(5)
            .Select(item => new InventoryAttentionDto(
                item.Item.Id.ToString(),
                item.Item.Name,
                $"Available stock {item.Stock.Available:0.###} is below minimum {item.Item.MinStockQty:0.###}",
                "warning",
                "inventory-items"))
            .ToList();

    private Dictionary<Guid, StockTotals> GetStockByItem(IEnumerable<Guid>? itemIds = null)
    {
        var stockMoves = dbContext.InventoryStockMoves.AsNoTracking();
        if (itemIds is not null)
        {
            var ids = itemIds.ToArray();
            stockMoves = stockMoves.Where(move => ids.Contains(move.ItemId));
        }

        return stockMoves
            .GroupBy(move => new { move.ItemId, move.MoveType })
            .Select(group => new
            {
                group.Key.ItemId,
                group.Key.MoveType,
                Quantity = group.Sum(move => move.QuantityDelta)
            })
            .ToList()
            .GroupBy(move => move.ItemId)
            .ToDictionary(
                group => group.Key,
                group => BuildStockTotals(group.Select(move => (move.MoveType, move.Quantity))));
    }

    private static StockTotals BuildStockTotals(IEnumerable<(string MoveType, decimal Quantity)> rows)
    {
        var physical = 0m;
        var reserved = 0m;
        var isTracked = false;

        foreach (var row in rows)
        {
            isTracked = true;
            if (ReservationMoveTypes.Contains(row.MoveType))
            {
                reserved += row.Quantity < 0 ? -row.Quantity : row.Quantity;
            }
            else
            {
                physical += row.Quantity;
            }
        }

        return new StockTotals(physical, Math.Max(0m, reserved), isTracked);
    }

    private static InventoryListResponseDto<T> ToListResponse<T>(
        IReadOnlyList<T> rows,
        int total,
        InventoryPaging paging) =>
        new(
            Rows: rows,
            Total: total,
            Page: paging.Page,
            PageSize: paging.PageSize,
            PageCount: total == 0 ? 0 : (int)Math.Ceiling(total / (double)paging.PageSize));

    private static InventoryPaging NormalizePaging(InventoryListQuery query) =>
        new(Math.Max(1, query.Page), Math.Clamp(query.PageSize, 1, 100));

    private static string NormalizeQuery(string? query) => query?.Trim().ToLowerInvariant() ?? string.Empty;

    private static InventoryCommandResult<T> Success<T>(T value) => new(value, EmptyErrors);

    private static InventoryCommandResult<T> Failure<T>(string key, string message) =>
        new(default, new Dictionary<string, string[]> { [key] = [message] });

    private sealed record InventoryPaging(int Page, int PageSize);

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

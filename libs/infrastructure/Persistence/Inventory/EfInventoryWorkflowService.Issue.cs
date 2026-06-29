using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService
{

    public InventoryPpeCardsResponseDto GetPpeCards(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var baseQuery = dbContext.InventoryPpeCards
            .AsNoTracking()
            .Where(card => card.ArchivedAt == null);

        var rowsQuery = ApplyPpeCardFilters(baseQuery, query);
        var total = rowsQuery.Count();
        var rows = ApplyPpeCardSort(rowsQuery, query)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .Select(card => new InventoryPpeCardDto(
                card.Id,
                card.EmployeeId,
                card.Employee.FullName,
                card.Position,
                card.Status,
                card.Lines.Count(line => line.Status != "archived"),
                card.Lines
                    .Where(line => line.Status != "archived")
                    .Sum(line => (decimal)(line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor ?? 0) * line.Quantity),
                card.Lines.Count(line =>
                    line.Status != "archived" &&
                    (line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor ?? 0) == 0)))
            .ToList();

        return new InventoryPpeCardsResponseDto(
            rows,
            total,
            paging.Page,
            paging.PageSize,
            total == 0 ? 0 : (int)Math.Ceiling(total / (double)paging.PageSize),
            BuildPpeSummary(baseQuery),
            BuildPpeSummary(rowsQuery));
    }

    public InventoryCommandResult<InventoryPpeCardDetailDto> GetPpeCard(Guid id)
    {
        var card = LoadPpeCard(id);
        return card is null
            ? Failure<InventoryPpeCardDetailDto>("id", "PPE card not found")
            : Success(MapPpeCardDetail(card));
    }

    public InventoryCommandResult<InventoryPpeCardDetailDto> CreatePpeCard(CreateInventoryPpeCardDto request)
    {
        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null)
        {
            return Failure<InventoryPpeCardDetailDto>("employeeId", "Employee not found");
        }

        var now = DateTimeOffset.UtcNow;
        var card = new InventoryPpeCardEntity
        {
            Id = Guid.NewGuid(),
            EmployeeId = employee.Id,
            Position = employee.Position,
            Status = "active",
            Comment = NormalizeOptional(request.Comment),
            CreatedAt = now
        };
        ApplyPpeEmployeeDetails(card, request.EmployeeDetails);

        dbContext.InventoryPpeCards.Add(card);
        AddSystemLog("ppe_card", card.Id, "created", employee.FullName, now);
        dbContext.SaveChanges();

        return Success(MapPpeCardDetail(LoadPpeCard(card.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardDetailDto> UpdatePpeCard(Guid id, CreateInventoryPpeCardDto request)
    {
        var card = dbContext.InventoryPpeCards.FirstOrDefault(row => row.Id == id && row.ArchivedAt == null);
        if (card is null)
        {
            return Failure<InventoryPpeCardDetailDto>("id", "PPE card not found");
        }

        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null)
        {
            return Failure<InventoryPpeCardDetailDto>("employeeId", "Employee not found");
        }

        card.EmployeeId = employee.Id;
        card.Position = employee.Position;
        card.Comment = NormalizeOptional(request.Comment);
        ApplyPpeEmployeeDetails(card, request.EmployeeDetails);
        AddSystemLog("ppe_card", card.Id, "updated", employee.FullName, DateTimeOffset.UtcNow);
        dbContext.SaveChanges();

        return Success(MapPpeCardDetail(LoadPpeCard(card.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardDetailDto> ArchivePpeCard(Guid id)
    {
        var card = dbContext.InventoryPpeCards.FirstOrDefault(row => row.Id == id && row.ArchivedAt == null);
        if (card is null)
        {
            return Failure<InventoryPpeCardDetailDto>("id", "PPE card not found");
        }

        card.ArchivedAt = DateTimeOffset.UtcNow;
        card.Status = "archived";
        AddSystemLog("ppe_card", card.Id, "archived", "PPE card archived", card.ArchivedAt.Value);
        dbContext.SaveChanges();

        return Success(MapPpeCardDetail(LoadPpeCard(card.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardLineDto> AddPpeCardLine(Guid cardId, UpsertInventoryPpeCardLineDto request)
    {
        var card = dbContext.InventoryPpeCards.FirstOrDefault(row => row.Id == cardId && row.ArchivedAt == null);
        if (card is null)
        {
            return Failure<InventoryPpeCardLineDto>("cardId", "PPE card not found");
        }

        var validation = ValidatePpeLine(request);
        if (validation is not null)
        {
            return validation;
        }

        var item = dbContext.InventoryItems.First(row => row.Id == request.ItemId);
        var line = new InventoryPpeCardLineEntity
        {
            Id = Guid.NewGuid(),
            CardId = card.Id,
            ItemId = request.ItemId,
            WarehouseId = request.WarehouseId,
            Quantity = request.Quantity,
            UnitPriceMinor = NormalizeUnitPriceMinor(request.UnitPriceMinor, request.ItemId),
            Status = NormalizePpeStatus(request.Status) is { Length: > 0 } status ? status : PpeIssueStatusCatalog.NotIssued,
            DueAt = request.DueAt,
            Comment = NormalizeOptional(request.Comment),
            PrintItemName = NormalizePrintField(request.PrintItemName, item.NormItemName ?? item.Name, 600),
            NormPoint = NormalizePrintField(request.NormPoint, DefaultPpeNormPoint, 240),
            IssuePeriodText = NormalizePrintField(request.IssuePeriodText, DefaultIssuePeriodText(item.DefaultLifeMonths), 160),
            BrandModelArticle = NormalizePrintField(request.BrandModelArticle, PpeModelDescription(item), 600)
        };
        if (IsPpeSignatureLineStatus(line.Status))
        {
            line.IssuedAt = request.IssuedAt ?? DateTimeOffset.UtcNow;
        }

        var now = DateTimeOffset.UtcNow;
        dbContext.InventoryPpeCardLines.Add(line);
        AddPpeEvent(line.Id, "created", string.Empty, line.Status, line.Comment, now);
        AddPpeLineSystemLog(line, "norm_added", "Добавлена строка нормы СИЗ", now);
        AddPpeLineSystemLog(line, "nomenclature_selected", "Выбрана складская номенклатура", now);
        if (!string.IsNullOrWhiteSpace(line.BrandModelArticle))
        {
            AddPpeLineSystemLog(line, "brand_model_changed", "Указана модель / марка / артикул", now);
        }

        if (IsPpeSignatureLineStatus(line.Status))
        {
            AddPpeLineSystemLog(line, "issued", "Создан факт выдачи", now);
        }

        AddPpeStockMoveIfNeeded(line, string.Empty, line.Status, now);
        dbContext.SaveChanges();

        return Success(MapPpeCardLine(LoadPpeLine(line.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardLineDto> UpdatePpeCardLine(Guid cardId, Guid lineId, UpsertInventoryPpeCardLineDto request)
    {
        var line = dbContext.InventoryPpeCardLines.FirstOrDefault(row => row.Id == lineId && row.CardId == cardId && row.Status != "archived");
        if (line is null)
        {
            return Failure<InventoryPpeCardLineDto>("lineId", "PPE card line not found");
        }

        var validation = ValidatePpeLine(request);
        if (validation is not null)
        {
            return validation;
        }

        if (!PpeIssueStatusCatalog.IsDraftEditableStatus(line.Status)
            && (line.ItemId != request.ItemId
                || line.Quantity != request.Quantity))
        {
            return Failure<InventoryPpeCardLineDto>(
                "status",
                "Issued PPE line cannot change item or quantity. Archive or create a new line instead.");
        }

        var oldItemId = line.ItemId;
        var oldBrandModelArticle = line.BrandModelArticle;
        var oldPrintItemName = line.PrintItemName;
        var item = dbContext.InventoryItems.First(row => row.Id == request.ItemId);
        line.ItemId = request.ItemId;
        line.WarehouseId = request.WarehouseId;
        line.Quantity = request.Quantity;
        line.UnitPriceMinor = NormalizeUnitPriceMinor(request.UnitPriceMinor, request.ItemId);
        line.DueAt = request.DueAt;
        line.Comment = NormalizeOptional(request.Comment);
        line.PrintItemName = NormalizePrintField(request.PrintItemName, item.NormItemName ?? item.Name, 600);
        line.NormPoint = NormalizePrintField(request.NormPoint, DefaultPpeNormPoint, 240);
        line.IssuePeriodText = NormalizePrintField(request.IssuePeriodText, DefaultIssuePeriodText(item.DefaultLifeMonths), 160);
        line.BrandModelArticle = NormalizePrintField(request.BrandModelArticle, PpeModelDescription(item), 600);
        if (IsPpeSignatureLineStatus(NormalizePpeStatus(request.Status)))
        {
            line.IssuedAt = request.IssuedAt ?? line.IssuedAt ?? DateTimeOffset.UtcNow;
        }
        else if (request.IssuedAt is not null)
        {
            line.IssuedAt = request.IssuedAt;
        }
        var now = DateTimeOffset.UtcNow;
        if (!string.Equals(oldPrintItemName, line.PrintItemName, StringComparison.Ordinal))
        {
            AddPpeLineSystemLog(line, "norm_changed", $"Норма изменена: {oldPrintItemName} -> {line.PrintItemName}", now);
        }

        if (oldItemId != line.ItemId)
        {
            AddPpeLineSystemLog(line, "nomenclature_selected", "Изменена складская номенклатура", now);
        }

        if (!string.Equals(oldBrandModelArticle, line.BrandModelArticle, StringComparison.Ordinal))
        {
            AddPpeLineSystemLog(line, "brand_model_changed", $"Модель / марка изменена: {oldBrandModelArticle} -> {line.BrandModelArticle}", now);
        }

        AddPpeLineSystemLog(line, "line_updated", line.Comment, now);
        dbContext.SaveChanges();

        return Success(MapPpeCardLine(LoadPpeLine(line.Id)!));
    }

    private InventoryPpeCardEntity? LoadPpeCard(Guid id) =>
        dbContext.InventoryPpeCards
            .AsNoTracking()
            .Include(card => card.Employee)
            .Include(card => card.Lines)
                .ThenInclude(line => line.Item)
                    .ThenInclude(item => item.Unit)
            .Include(card => card.Lines)
                .ThenInclude(line => line.Warehouse)
            .FirstOrDefault(card => card.Id == id && card.ArchivedAt == null);

    private InventoryPpeCardLineEntity? LoadPpeLine(Guid id) =>
        dbContext.InventoryPpeCardLines
            .AsNoTracking()
            .Include(line => line.Item)
                .ThenInclude(item => item.Unit)
            .Include(line => line.Warehouse)
            .FirstOrDefault(line => line.Id == id);

    private static InventoryPpeCardDto MapPpeCard(InventoryPpeCardEntity card)
    {
        var lines = card.Lines.Where(line => line.Status != "archived").ToList();
        return new(
            card.Id,
            card.EmployeeId,
            card.Employee.FullName,
            card.Position,
            card.Status,
            lines.Count,
            lines.Sum(line => (line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor ?? 0) * line.Quantity),
            lines.Count(line => (line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor ?? 0) == 0));
    }
    private static IQueryable<InventoryPpeCardEntity> ApplyPpeCardFilters(
        IQueryable<InventoryPpeCardEntity> query,
        InventoryListQuery filters)
    {
        var search = NormalizeQuery(filters.Query);
        if (search.Length > 0)
        {
            query = query.Where(card =>
                card.Employee.FullName.ToLower().Contains(search) ||
                card.Employee.PersonnelNo.ToLower().Contains(search) ||
                card.Position.ToLower().Contains(search) ||
                card.Employee.Department.ToLower().Contains(search) ||
                card.Status.ToLower().Contains(search) ||
                card.Lines.Any(line => line.Status != "archived" && line.Item.Name.ToLower().Contains(search)));
        }

        var status = NormalizeStatus(filters.Status);
        if (status.Length > 0 && status != "all")
        {
            if (status == "problem")
            {
                var now = DateTimeOffset.UtcNow;
                query = query.Where(card =>
                    card.Status == "warning" ||
                    card.Status == "overdue" ||
                    card.Status == "lost" ||
                    card.Lines.Any(line => line.Status != "archived" && (line.Status == "lost" || (line.Status == "issued" && line.DueAt != null && line.DueAt < now))));
            }
            else
            {
                query = query.Where(card => card.Status == status || card.Lines.Any(line => line.Status != "archived" && line.Status == status));
            }
        }

        var department = NormalizeQuery(filters.Department);
        if (department.Length > 0 && department != "all")
        {
            query = query.Where(card => card.Employee.Department.ToLower().Contains(department));
        }

        var position = NormalizeQuery(filters.Position);
        if (position.Length > 0 && position != "all")
        {
            query = query.Where(card => card.Position.ToLower().Contains(position));
        }

        var item = NormalizeQuery(filters.Item);
        if (item.Length > 0 && item != "all")
        {
            query = query.Where(card => card.Lines.Any(line => line.Status != "archived" && (
                line.Item.Name.ToLower().Contains(item) ||
                line.Item.Article.ToLower().Contains(item) ||
                line.Item.Sku.ToLower().Contains(item))));
        }

        var cardNo = NormalizeQuery(filters.CardNo).Replace("сиз-", string.Empty).Replace("ppe-", string.Empty);
        if (cardNo.Length > 0)
        {
            if (Guid.TryParse(cardNo, out var cardId))
            {
                query = query.Where(card => card.Id == cardId);
            }
            else if (int.TryParse(cardNo, out var legacyId))
            {
                query = query.Where(card => card.LegacyId == legacyId);
            }
            else
            {
                query = query.Where(card => false);
            }
        }

        if (filters.DateFrom is not null)
        {
            query = query.Where(card => card.CreatedAt >= filters.DateFrom.Value);
        }

        if (filters.DateTo is not null)
        {
            query = query.Where(card => card.CreatedAt <= filters.DateTo.Value);
        }

        var priceState = NormalizeStatus(filters.PriceState);
        if (priceState is "missing" or "zero" or "no_price")
        {
            query = query.Where(card => card.Lines.Any(line =>
                line.Status != "archived" &&
                (line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor ?? 0) == 0));
        }
        else if (priceState is "priced" or "with_price")
        {
            query = query.Where(card =>
                card.Lines.Any(line => line.Status != "archived") &&
                !card.Lines.Any(line =>
                    line.Status != "archived" &&
                    (line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor ?? 0) == 0));
        }

        return query;
    }

    private static IQueryable<InventoryPpeCardEntity> ApplyPpeCardSort(
        IQueryable<InventoryPpeCardEntity> query,
        InventoryListQuery filters)
    {
        var descending = string.Equals(filters.Direction, "desc", StringComparison.OrdinalIgnoreCase);
        return NormalizeStatus(filters.Sort) switch
        {
            "date" => descending ? query.OrderByDescending(card => card.CreatedAt) : query.OrderBy(card => card.CreatedAt),
            "employee" => descending ? query.OrderByDescending(card => card.Employee.FullName) : query.OrderBy(card => card.Employee.FullName),
            "position" => descending ? query.OrderByDescending(card => card.Position) : query.OrderBy(card => card.Position),
            "status" => descending ? query.OrderByDescending(card => card.Status) : query.OrderBy(card => card.Status),
            "lines" => descending ? query.OrderByDescending(card => card.Lines.Count(line => line.Status != "archived")) : query.OrderBy(card => card.Lines.Count(line => line.Status != "archived")),
            _ => query.OrderBy(card => card.Employee.FullName).ThenByDescending(card => card.CreatedAt)
        };
    }

    private static InventoryPpeSummaryDto BuildPpeSummary(IQueryable<InventoryPpeCardEntity> query)
    {
        var now = DateTimeOffset.UtcNow;
        return new InventoryPpeSummaryDto(
            query.Count(),
            query.Count(card => card.Status == "active"),
            query.Count(card => card.Status == "issued" || card.Lines.Any(line => line.Status != "archived" && line.Status == "issued")),
            query.Count(card => card.Status == "issuing" || card.Lines.Any(line => line.Status != "archived" && line.Status == "issuing")),
            query.Count(card => card.Status == "not_issued" || card.Lines.Any(line => line.Status != "archived" && line.Status == "not_issued")),
            query.Count(card => card.Status == "partial" || card.Lines.Any(line => line.Status != "archived" && line.Status == "partial")),
            query.Count(card =>
                card.Status == "warning" ||
                card.Status == "overdue" ||
                card.Status == "lost" ||
                card.Lines.Any(line => line.Status != "archived" && (line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor ?? 0) == 0) ||
                card.Lines.Any(line => line.Status != "archived" && (line.Status == "lost" || (line.Status == "issued" && line.DueAt != null && line.DueAt < now)))),
            query.Count(card => card.Status == "returned" || card.Lines.Any(line => line.Status != "archived" && line.Status == "returned")),
            query.Count(card => card.Status == "written_off" || card.Lines.Any(line => line.Status != "archived" && line.Status == "written_off")),
            query.SelectMany(card => card.Lines).Count(line => line.Status != "archived"),
            query.SelectMany(card => card.Lines).Count(line => line.Status != "archived" && line.Status == "issued"),
            query.SelectMany(card => card.Lines).Count(line => line.Status != "archived" && line.Status == "not_issued"));
    }

    private static InventoryPpeCardDetailDto MapPpeCardDetail(InventoryPpeCardEntity card) =>
        new(
            card.Id,
            card.EmployeeId,
            card.Employee.FullName,
            card.Employee.PersonnelNo,
            card.Employee.Department,
            card.Position,
            card.Status,
            card.CreatedAt.UtcDateTime,
            card.Comment,
            new InventoryPpeEmployeeDetailsDto(
                card.Gender,
                card.Height,
                card.ClothingSize,
                card.ShoeSize,
                card.HeadSize,
                card.RespiratorSize,
                card.HandProtectionSize),
            card.Lines.Where(line => line.Status != "archived").OrderBy(line => line.Item.Name).Select(MapPpeCardLine).ToList());

    private static InventoryPpeCardLineDto MapPpeCardLine(InventoryPpeCardLineEntity line) =>
        new(
            line.Id,
            line.ItemId,
            line.Item.Name,
            line.WarehouseId,
            line.Warehouse?.Name ?? string.Empty,
            line.Quantity,
            line.Item.Unit?.Symbol ?? line.Item.Unit?.Name ?? string.Empty,
            line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor,
            (line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor ?? 0) * line.Quantity,
            line.Status,
            line.IssuedAt?.UtcDateTime,
            line.DueAt?.UtcDateTime,
            PpeModelDescription(line.Item),
            string.IsNullOrWhiteSpace(line.BrandModelArticle) ? PpeModelDescription(line.Item) : line.BrandModelArticle,
            string.IsNullOrWhiteSpace(line.NormPoint)
                ? DefaultPpeNormPoint
                : line.NormPoint,
            string.IsNullOrWhiteSpace(line.PrintItemName) ? line.Item.NormItemName ?? line.Item.Name : line.PrintItemName,
            string.IsNullOrWhiteSpace(line.IssuePeriodText) ? DefaultIssuePeriodText(line.Item.DefaultLifeMonths) : line.IssuePeriodText);
}

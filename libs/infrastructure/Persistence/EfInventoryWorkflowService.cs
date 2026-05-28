using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfInventoryWorkflowService(Patrol360DbContext dbContext) : IInventoryWorkflowService
{
    private const string Actor = "system";

    private static readonly IReadOnlyList<InventoryReportDto> ReportDefinitions =
    [
        new("stock", "Остатки", "Текущие остатки по складам и номенклатуре", "xlsx"),
        new("moves", "Движения", "Приход, выдача, возвраты и списания", "xlsx"),
        new("ppe", "СИЗ", "Карточки СИЗ, строки и статусы выдачи", "pdf/docx/xlsx"),
        new("custody", "Под запись", "Акты и личная ответственность сотрудников", "pdf/xlsx"),
        new("history", "История операций", "Единый журнал операций Inventory", "xlsx"),
        new("employees", "Сотрудники учета", "Сотрудники, должности, подразделения и группы", "xlsx"),
        new("system_log", "Системный журнал", "Аудит импорта, печати, настроек и операций", "xlsx")
    ];

    private static readonly HashSet<string> ReservationMoveTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "reservation",
        "reserve",
        "ppe_reserve",
        "ppe_reservation"
    };

    public InventoryListResponseDto<InventoryCustodyRecordDto> GetCustodyRecords(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.InventoryCustodyRecords
            .AsNoTracking()
            .Include(record => record.Document)
            .Include(record => record.Employee)
            .Include(record => record.Item)
            .Include(record => record.Warehouse)
            .Where(record => record.ArchivedAt == null);

        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            rowsQuery = rowsQuery.Where(record =>
                record.Employee.FullName.ToLower().Contains(search) ||
                record.Item.Name.ToLower().Contains(search) ||
                record.Warehouse.Name.ToLower().Contains(search) ||
                record.Status.ToLower().Contains(search));
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            var status = NormalizeStatus(query.Status);
            rowsQuery = rowsQuery.Where(record => record.Status == status);
        }

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderByDescending(record => record.IssuedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList()
            .Select(MapCustodyRecord)
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryCustodyRecordDto> CreateCustodyRecord(CreateInventoryCustodyRecordDto request)
    {
        if (request.Quantity <= 0)
        {
            return Failure<InventoryCustodyRecordDto>("quantity", "Quantity must be greater than zero");
        }

        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null)
        {
            return Failure<InventoryCustodyRecordDto>("employeeId", "Employee not found");
        }

        var item = dbContext.InventoryItems.FirstOrDefault(row => row.Id == request.ItemId);
        if (item is null)
        {
            return Failure<InventoryCustodyRecordDto>("itemId", "Item not found");
        }

        var warehouse = dbContext.InventoryWarehouses.FirstOrDefault(row => row.Id == request.WarehouseId && !row.IsArchived);
        if (warehouse is null)
        {
            return Failure<InventoryCustodyRecordDto>("warehouseId", "Warehouse not found");
        }

        if (GetAvailableStock(item.Id, warehouse.Id) < request.Quantity)
        {
            return Failure<InventoryCustodyRecordDto>("quantity", "Not enough stock in warehouse");
        }

        var now = DateTimeOffset.UtcNow;
        var document = request.DocumentId is null
            ? CreateCustodyDocument(employee, now)
            : dbContext.InventoryCustodyDocuments.FirstOrDefault(row => row.Id == request.DocumentId.Value);

        if (document is null || document.ArchivedAt is not null)
        {
            return Failure<InventoryCustodyRecordDto>("documentId", "Custody document not found");
        }

        if (document.Status == "closed")
        {
            return Failure<InventoryCustodyRecordDto>("documentId", "Custody document is closed");
        }

        var record = new InventoryCustodyRecordEntity
        {
            Id = Guid.NewGuid(),
            DocumentId = document.Id,
            EmployeeId = employee.Id,
            ItemId = item.Id,
            WarehouseId = warehouse.Id,
            Quantity = request.Quantity,
            Status = "in_use",
            Comment = NormalizeOptional(request.Comment),
            IssuedAt = now
        };

        dbContext.InventoryCustodyRecords.Add(record);
        dbContext.InventoryStockMoves.Add(new InventoryStockMoveEntity
        {
            Id = Guid.NewGuid(),
            ItemId = item.Id,
            WarehouseId = warehouse.Id,
            EmployeeId = employee.Id,
            QuantityDelta = -request.Quantity,
            MovedAt = now,
            MoveType = "custody_issue",
            ReferenceType = "custody",
            ReferenceId = document.Id,
            CustodyRecordId = record.Id
        });
        AddCustodyEvent(record.Id, "created", string.Empty, "in_use", record.Comment, now);
        AddSystemLog("custody_record", record.Id, "created", $"{employee.FullName}: {item.Name} x {request.Quantity}", now);
        dbContext.SaveChanges();

        return Success(MapCustodyRecord(LoadCustodyRecord(record.Id)));
    }

    public InventoryCommandResult<InventoryCustodyRecordDto> UpdateCustodyRecordStatus(Guid id, UpdateInventoryStatusDto request)
    {
        var record = dbContext.InventoryCustodyRecords
            .Include(row => row.Document)
            .FirstOrDefault(row => row.Id == id && row.ArchivedAt == null);
        if (record is null)
        {
            return Failure<InventoryCustodyRecordDto>("id", "Custody record not found");
        }

        if (record.Document.Status == "closed" && request.Status is not "in_use")
        {
            return Failure<InventoryCustodyRecordDto>("documentId", "Custody document is closed");
        }

        var nextStatus = NormalizeCustodyStatus(request.Status);
        if (nextStatus.Length == 0)
        {
            return Failure<InventoryCustodyRecordDto>("status", "Unsupported custody status");
        }

        var oldStatus = record.Status;
        if (oldStatus == nextStatus)
        {
            return Success(MapCustodyRecord(LoadCustodyRecord(record.Id)));
        }

        var now = DateTimeOffset.UtcNow;
        record.Status = nextStatus;
        record.ClosedAt = nextStatus == "in_use" ? null : now;
        if (oldStatus == "in_use" && nextStatus == "returned")
        {
            dbContext.InventoryStockMoves.Add(new InventoryStockMoveEntity
            {
                Id = Guid.NewGuid(),
                ItemId = record.ItemId,
                WarehouseId = record.WarehouseId,
                EmployeeId = record.EmployeeId,
                QuantityDelta = record.Quantity,
                MovedAt = now,
                MoveType = "custody_return",
                ReferenceType = "custody",
                ReferenceId = record.DocumentId,
                CustodyRecordId = record.Id
            });
        }

        AddCustodyEvent(record.Id, "status_changed", oldStatus, nextStatus, request.Comment, now);
        AddSystemLog("custody_record", record.Id, "status_changed", $"{oldStatus} -> {nextStatus}", now);
        dbContext.SaveChanges();

        return Success(MapCustodyRecord(LoadCustodyRecord(record.Id)));
    }

    public InventoryCommandResult<InventoryCustodyRecordDto> ArchiveCustodyRecord(Guid id)
    {
        var record = dbContext.InventoryCustodyRecords.FirstOrDefault(row => row.Id == id && row.ArchivedAt == null);
        if (record is null)
        {
            return Failure<InventoryCustodyRecordDto>("id", "Custody record not found");
        }

        record.ArchivedAt = DateTimeOffset.UtcNow;
        AddSystemLog("custody_record", record.Id, "archived", "Custody record archived", record.ArchivedAt.Value);
        dbContext.SaveChanges();

        return Success(MapCustodyRecord(LoadCustodyRecord(record.Id)));
    }

    public InventoryListResponseDto<InventoryCustodyDocumentDto> GetCustodyDocuments(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.InventoryCustodyDocuments
            .AsNoTracking()
            .Include(document => document.Employee)
            .Include(document => document.Records)
            .Where(document => document.ArchivedAt == null);

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderByDescending(document => document.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList()
            .Select(MapCustodyDocument)
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryCustodyDocumentDetailDto> GetCustodyDocument(Guid id)
    {
        var document = dbContext.InventoryCustodyDocuments
            .AsNoTracking()
            .Include(row => row.Employee)
            .Include(row => row.Records)
                .ThenInclude(record => record.Employee)
            .Include(row => row.Records)
                .ThenInclude(record => record.Item)
            .Include(row => row.Records)
                .ThenInclude(record => record.Warehouse)
            .FirstOrDefault(row => row.Id == id);
        if (document is null)
        {
            return Failure<InventoryCustodyDocumentDetailDto>("id", "Custody document not found");
        }

        var recordIds = document.Records.Select(row => row.Id).ToArray();
        var historyRows = dbContext.InventoryCustodyRecordEvents
            .AsNoTracking()
            .Where(row => recordIds.Contains(row.RecordId))
            .OrderByDescending(row => row.CreatedAt)
            .ToList();
        var history = historyRows
            .Select(row => new InventoryHistoryDto(row.Id, "custody_record", row.EventType, $"{row.FromStatus} -> {row.ToStatus}", row.Actor, row.CreatedAt.UtcDateTime))
            .ToList();

        return Success(new InventoryCustodyDocumentDetailDto(
            document.Id,
            document.Number,
            document.EmployeeId,
            document.Employee.FullName,
            document.Employee.PersonnelNo,
            document.Employee.Department,
            document.Status,
            document.CreatedAt.UtcDateTime,
            document.ClosedAt?.UtcDateTime,
            document.Records
                .Where(row => row.ArchivedAt == null)
                .OrderBy(row => row.IssuedAt)
                .Select(MapCustodyRecord)
                .ToList(),
            history));
    }

    public InventoryListResponseDto<InventoryHistoryDto> GetCustodyRecordHistory(Guid id, InventoryListQuery query) =>
        GetCustodyHistoryFromEvents(query, eventQuery => eventQuery.Where(row => row.RecordId == id));

    public InventoryListResponseDto<InventoryHistoryDto> GetCustodyDocumentHistory(Guid id, InventoryListQuery query)
    {
        var recordIds = dbContext.InventoryCustodyRecords
            .Where(row => row.DocumentId == id)
            .Select(row => row.Id)
            .ToArray();

        return GetCustodyHistoryFromEvents(query, eventQuery => eventQuery.Where(row => recordIds.Contains(row.RecordId)));
    }

    public InventoryCommandResult<InventoryCustodyDocumentDto> CloseCustodyDocument(Guid id) => ChangeCustodyDocumentStatus(id, "closed");

    public InventoryCommandResult<InventoryCustodyDocumentDto> OpenCustodyDocument(Guid id) => ChangeCustodyDocumentStatus(id, "open");

    public InventoryCommandResult<InventoryCustodyDocumentDto> ArchiveCustodyDocument(Guid id)
    {
        var document = dbContext.InventoryCustodyDocuments
            .Include(row => row.Employee)
            .Include(row => row.Records)
            .FirstOrDefault(row => row.Id == id && row.ArchivedAt == null);
        if (document is null)
        {
            return Failure<InventoryCustodyDocumentDto>("id", "Custody document not found");
        }

        document.ArchivedAt = DateTimeOffset.UtcNow;
        document.Status = "archived";
        AddSystemLog("custody_document", document.Id, "archived", document.Number, document.ArchivedAt.Value);
        dbContext.SaveChanges();

        return Success(MapCustodyDocument(document));
    }

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
                card.Lines.Count(line => line.Status != "archived")))
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

        var line = new InventoryPpeCardLineEntity
        {
            Id = Guid.NewGuid(),
            CardId = card.Id,
            ItemId = request.ItemId,
            WarehouseId = null,
            Quantity = request.Quantity,
            Status = NormalizePpeStatus(request.Status) is { Length: > 0 } status ? status : "not_issued",
            DueAt = request.DueAt,
            Comment = NormalizeOptional(request.Comment)
        };

        dbContext.InventoryPpeCardLines.Add(line);
        AddPpeEvent(line.Id, "created", string.Empty, line.Status, line.Comment, DateTimeOffset.UtcNow);
        AddSystemLog("ppe_card_line", line.Id, "created", $"Card {card.Id}", DateTimeOffset.UtcNow);
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

        if (line.Status is not "not_issued" and not "issuing"
            && (line.ItemId != request.ItemId
                || line.Quantity != request.Quantity))
        {
            return Failure<InventoryPpeCardLineDto>(
                "status",
                "Issued PPE line cannot change item or quantity. Archive or create a new line instead.");
        }

        line.ItemId = request.ItemId;
        line.WarehouseId = null;
        line.Quantity = request.Quantity;
        line.DueAt = request.DueAt;
        line.Comment = NormalizeOptional(request.Comment);
        AddSystemLog("ppe_card_line", line.Id, "updated", line.Comment, DateTimeOffset.UtcNow);
        dbContext.SaveChanges();

        return Success(MapPpeCardLine(LoadPpeLine(line.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardLineDto> UpdatePpeCardLineStatus(Guid cardId, Guid lineId, UpdateInventoryStatusDto request)
    {
        var line = dbContext.InventoryPpeCardLines
            .Include(row => row.Card)
            .FirstOrDefault(row => row.Id == lineId && row.CardId == cardId && row.Status != "archived");
        if (line is null)
        {
            return Failure<InventoryPpeCardLineDto>("lineId", "PPE card line not found");
        }

        var nextStatus = NormalizePpeStatus(request.Status);
        if (nextStatus.Length == 0)
        {
            return Failure<InventoryPpeCardLineDto>("status", "Unsupported PPE status");
        }

        var oldStatus = line.Status;
        if (oldStatus == nextStatus)
        {
            return Success(MapPpeCardLine(LoadPpeLine(line.Id)!));
        }

        if (!IsAllowedPpeLineStatusTransition(oldStatus, nextStatus))
        {
            return Failure<InventoryPpeCardLineDto>(
                "status",
                $"Unsupported PPE line status transition: {oldStatus} -> {nextStatus}");
        }

        var now = DateTimeOffset.UtcNow;
        if (nextStatus == "issued" && oldStatus != "issued")
        {
            line.IssuedAt = now;
        }

        line.Status = nextStatus;
        AddPpeEvent(line.Id, "status_changed", oldStatus, nextStatus, request.Comment, now);
        AddSystemLog("ppe_card_line", line.Id, "status_changed", $"{oldStatus} -> {nextStatus}", now);
        dbContext.SaveChanges();

        return Success(MapPpeCardLine(LoadPpeLine(line.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardLineDto> ArchivePpeCardLine(Guid cardId, Guid lineId)
    {
        var line = dbContext.InventoryPpeCardLines
            .Include(row => row.StockMoves)
            .FirstOrDefault(row => row.Id == lineId && row.CardId == cardId && row.Status != "archived");
        if (line is null)
        {
            return Failure<InventoryPpeCardLineDto>("lineId", "PPE card line not found");
        }

        if (line.Status == "issued")
        {
            return Failure<InventoryPpeCardLineDto>(
                "status",
                "Issued PPE line cannot be archived. Return or write off the line first.");
        }

        var oldStatus = line.Status;
        var now = DateTimeOffset.UtcNow;
        line.Status = "archived";
        AddPpeEvent(line.Id, "archived", oldStatus, "archived", "PPE card line archived", now);
        AddSystemLog("ppe_card_line", line.Id, "archived", $"Card {cardId}", now);
        dbContext.SaveChanges();

        return Success(MapPpeCardLine(LoadPpeLine(line.Id)!));
    }

    public InventoryListResponseDto<InventoryHistoryDto> GetPpeCardHistory(Guid cardId, InventoryListQuery query)
    {
        var lineIds = dbContext.InventoryPpeCardLines
            .Where(line => line.CardId == cardId)
            .Select(line => line.Id)
            .ToArray();

        return GetHistoryFromEvents(query, eventQuery => eventQuery.Where(row => lineIds.Contains(row.LineId)));
    }

    public InventoryListResponseDto<InventoryHistoryDto> GetPpeCardLinesHistory(Guid cardId, InventoryListQuery query) =>
        GetPpeCardHistory(cardId, query);

    public InventoryListResponseDto<InventoryHistoryDto> GetPpeCardLineHistory(Guid cardId, Guid lineId, InventoryListQuery query) =>
        GetHistoryFromEvents(query, eventQuery => eventQuery.Where(row => row.LineId == lineId && row.Line.CardId == cardId));

    public InventoryListResponseDto<InventoryPpeMovementDto> GetPpeMovements(InventoryListQuery query, Guid? employeeId = null, Guid? itemId = null)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.InventoryPpeCardLines
            .AsNoTracking()
            .Include(line => line.Card)
                .ThenInclude(card => card.Employee)
            .Include(line => line.Item)
                .ThenInclude(item => item.Unit)
            .Where(line => line.Status != "archived" && line.Card.ArchivedAt == null);

        if (employeeId is not null)
        {
            rowsQuery = rowsQuery.Where(line => line.Card.EmployeeId == employeeId.Value);
        }

        if (itemId is not null)
        {
            rowsQuery = rowsQuery.Where(line => line.ItemId == itemId.Value);
        }

        var status = NormalizePpeStatus(query.Status);
        if (status.Length > 0)
        {
            rowsQuery = rowsQuery.Where(line => line.Status == status);
        }

        if (query.DateFrom is not null)
        {
            rowsQuery = rowsQuery.Where(line =>
                line.IssuedAt >= query.DateFrom.Value ||
                (line.IssuedAt == null && line.Card.CreatedAt >= query.DateFrom.Value));
        }

        if (query.DateTo is not null)
        {
            rowsQuery = rowsQuery.Where(line =>
                line.IssuedAt <= query.DateTo.Value ||
                (line.IssuedAt == null && line.Card.CreatedAt <= query.DateTo.Value));
        }

        var total = rowsQuery.Count();
        var lineEntities = rowsQuery
            .OrderByDescending(line => line.IssuedAt ?? line.Card.CreatedAt)
            .ThenBy(line => line.Item.Name)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();

        var lineIds = lineEntities.Select(line => line.Id).ToArray();
        var closingEvents = dbContext.InventoryPpeCardLineEvents
            .AsNoTracking()
            .Where(ev => lineIds.Contains(ev.LineId) && (ev.ToStatus == "returned" || ev.ToStatus == "written_off"))
            .GroupBy(ev => new { ev.LineId, ev.ToStatus })
            .Select(group => new { group.Key.LineId, group.Key.ToStatus, ClosedAt = group.Max(ev => ev.CreatedAt) })
            .ToList();
        var returnedAt = closingEvents
            .Where(ev => ev.ToStatus == "returned")
            .ToDictionary(ev => ev.LineId, ev => (DateTime?)ev.ClosedAt.UtcDateTime);
        var writtenOffAt = closingEvents
            .Where(ev => ev.ToStatus == "written_off")
            .ToDictionary(ev => ev.LineId, ev => (DateTime?)ev.ClosedAt.UtcDateTime);

        var rows = lineEntities
            .Select(line => MapPpeMovement(line, returnedAt, writtenOffAt))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryListResponseDto<InventoryHistoryDto> GetHistory(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.InventorySystemLogs.AsNoTracking().AsQueryable();
        rowsQuery = ApplySystemLogFilters(rowsQuery, query);

        var total = rowsQuery.Count();
        var rowEntities = rowsQuery
            .OrderByDescending(row => row.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        var rows = rowEntities
            .Select(row => new InventoryHistoryDto(row.Id, row.EntityType, row.Action, row.Details, row.Actor, row.CreatedAt.UtcDateTime))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryListResponseDto<InventoryReportDto> GetReports(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var search = NormalizeQuery(query.Query);
        var filtered = ReportDefinitions
            .Where(report => search.Length == 0 ||
                report.Title.ToLowerInvariant().Contains(search) ||
                report.Description.ToLowerInvariant().Contains(search) ||
                report.Id.Contains(search, StringComparison.OrdinalIgnoreCase))
            .ToList();

        var rows = filtered
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();

        return ToListResponse(rows, filtered.Count, paging);
    }

    public InventoryCommandResult<InventoryExportJobDto> ExportReport(string reportId, string format)
    {
        var normalizedReportId = NormalizeOptional(reportId).ToLowerInvariant();
        var report = ReportDefinitions.FirstOrDefault(row => row.Id == normalizedReportId);
        if (report is null)
        {
            return Failure<InventoryExportJobDto>("reportId", "Report not found");
        }

        var normalizedFormat = NormalizeOptional(format).ToLowerInvariant();
        if (normalizedFormat.Length == 0)
        {
            normalizedFormat = report.Format.Split('/')[0];
        }

        var now = DateTimeOffset.UtcNow;
        var export = new InventoryExportJobEntity
        {
            Id = Guid.NewGuid(),
            ReportId = report.Id,
            Format = normalizedFormat,
            Status = "completed",
            DownloadName = $"inventory-{report.Id}-{now:yyyyMMddHHmmss}.{normalizedFormat}",
            PayloadJson = "{\"status\":\"completed\"}",
            CreatedAt = now
        };

        dbContext.InventoryExportJobs.Add(export);
        AddSystemLog("export_job", export.Id, "created", export.DownloadName, now);
        dbContext.SaveChanges();

        return Success(MapExport(export));
    }

    public InventoryCommandResult<InventoryExportJobDto> GetExport(Guid exportId)
    {
        var export = dbContext.InventoryExportJobs.AsNoTracking().FirstOrDefault(row => row.Id == exportId);
        return export is null
            ? Failure<InventoryExportJobDto>("exportId", "Export job not found")
            : Success(MapExport(export));
    }

    public InventoryListResponseDto<InventorySystemLogDto> GetSystemLog(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.InventorySystemLogs.AsNoTracking().AsQueryable();
        rowsQuery = ApplySystemLogFilters(rowsQuery, query);

        var total = rowsQuery.Count();
        var rowEntities = rowsQuery
            .OrderByDescending(row => row.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        var rows = rowEntities
            .Select(row => new InventorySystemLogDto(
                row.Id,
                row.EntityType,
                row.EntityId,
                row.Action,
                row.Details,
                row.Actor,
                row.CreatedAt.UtcDateTime))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryListResponseDto<InventoryEmployeeDto> GetEmployees(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.Employees.AsNoTracking().AsQueryable();
        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            rowsQuery = rowsQuery.Where(row =>
                row.FullName.ToLower().Contains(search) ||
                row.PersonnelNo.ToLower().Contains(search) ||
                row.Position.ToLower().Contains(search) ||
                row.Department.ToLower().Contains(search) ||
                row.EmployeeGroup.ToLower().Contains(search));
        }

        var requestedStatus = NormalizeOptional(query.Status);
        if (requestedStatus.Length > 0 && !string.Equals(requestedStatus, "all", StringComparison.OrdinalIgnoreCase))
        {
            var status = NormalizeInventoryEmployeeStatus(requestedStatus);
            rowsQuery = ApplyInventoryEmployeeStatusFilter(rowsQuery, status);
        }

        var department = NormalizeOptional(query.Department).ToLowerInvariant();
        if (department.Length > 0 && department != "all")
        {
            rowsQuery = rowsQuery.Where(row => row.Department.ToLower() == department);
        }

        var employeeGroup = NormalizeOptional(query.EmployeeGroup).ToLowerInvariant();
        if (employeeGroup.Length > 0 && employeeGroup != "all")
        {
            rowsQuery = rowsQuery.Where(row => row.EmployeeGroup.ToLower() == employeeGroup);
        }

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderBy(row => row.FullName)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .Select(row => MapEmployee(row))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryEmployeeImportPreviewDto> PreviewEmployeesImport(Stream source, string fileName)
    {
        IReadOnlyList<Dictionary<string, string>> rows;
        try
        {
            rows = fileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)
                ? ReadEmployeeRowsFromXlsx(source)
                : ReadEmployeeRowsFromDelimitedText(source);
        }
        catch (InvalidDataException ex)
        {
            return Failure<InventoryEmployeeImportPreviewDto>("file", ex.Message);
        }

        return Success(BuildEmployeeImportPreview(rows));
    }

    public InventoryCommandResult<InventoryEmployeeImportResultDto> ImportEmployees(Stream source, string fileName, string previewToken)
    {
        IReadOnlyList<Dictionary<string, string>> rows;
        try
        {
            rows = fileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)
                ? ReadEmployeeRowsFromXlsx(source)
                : ReadEmployeeRowsFromDelimitedText(source);
        }
        catch (InvalidDataException ex)
        {
            return Failure<InventoryEmployeeImportResultDto>("file", ex.Message);
        }

        var preview = BuildEmployeeImportPreview(rows);
        var now = DateTimeOffset.UtcNow;
        var existingEmployees = dbContext.Employees.ToList();

        foreach (var row in preview.Rows.Where(row => row.Error.Length == 0))
        {
            UpsertEmployeeReference("position", row.Position, now);
            UpsertEmployeeReference("department", row.Department, now);
            UpsertEmployeeReference("group", row.EmployeeGroup, now);
            var normalizedFullName = NormalizeFullName(row.FullName);
            var existing = existingEmployees.FirstOrDefault(employee =>
                string.Equals(employee.PersonnelNo, row.PersonnelNo, StringComparison.OrdinalIgnoreCase)
                || NormalizeFullName(employee.FullName) == normalizedFullName);
            if (existing is null)
            {
                var employee = new EmployeeEntity
                {
                    Id = Guid.NewGuid(),
                    FullName = row.FullName,
                    PersonnelNo = row.PersonnelNo,
                    Position = row.Position,
                    Department = row.Department,
                    EmployeeGroup = row.EmployeeGroup,
                    HiredAt = row.HiredAt,
                    BirthDate = row.BirthDate,
                    Status = "active",
                    Shift = string.Empty,
                    HasMobileAccount = false,
                    LastSeenAt = now
                };
                dbContext.Employees.Add(employee);
                existingEmployees.Add(employee);
            }
            else
            {
                existing.FullName = row.FullName;
                existing.PersonnelNo = row.PersonnelNo;
                existing.Position = row.Position;
                existing.Department = row.Department;
                existing.EmployeeGroup = row.EmployeeGroup;
                existing.HiredAt = row.HiredAt;
                existing.BirthDate = row.BirthDate;
                if (NormalizeInventoryEmployeeStatus(existing.Status) == "archived")
                {
                    existing.Status = "active";
                }
            }
        }

        AddSystemLog("employee", Guid.Empty, "import", $"{fileName}: inserted={preview.NewRows}, updated={preview.UpdateRows}, skipped={preview.SkippedRows}", now);
        dbContext.SaveChanges();

        return Success(new InventoryEmployeeImportResultDto(preview.RowsRead, preview.NewRows, preview.UpdateRows, preview.SkippedRows, preview.Errors));
    }

    public InventoryCommandResult<InventoryEmployeeDto> ArchiveEmployee(Guid id)
    {
        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == id);
        if (employee is null)
        {
            return Failure<InventoryEmployeeDto>("id", "Employee not found");
        }

        employee.Status = "archived";
        AddSystemLog("employee", employee.Id, "archived", employee.FullName, DateTimeOffset.UtcNow);
        dbContext.SaveChanges();

        return Success(MapEmployee(employee));
    }

    public InventoryListResponseDto<InventoryUserDto> GetUsers(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.SiteUsers
            .AsNoTracking()
            .Include(user => user.Roles)
                .ThenInclude(role => role.Role)
            .AsQueryable();

        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            rowsQuery = rowsQuery.Where(user =>
                user.Login.ToLower().Contains(search) ||
                user.DisplayName.ToLower().Contains(search) ||
                user.Status.ToLower().Contains(search) ||
                user.Roles.Any(role => role.Role.Code.ToLower().Contains(search)));
        }

        var status = NormalizeOptional(query.Status).ToLowerInvariant();
        if (status.Length > 0 && status != "all")
        {
            rowsQuery = rowsQuery.Where(user => user.Status.ToLower() == status);
        }

        var roleCode = NormalizeOptional(query.Role).ToLowerInvariant();
        if (roleCode.Length > 0 && roleCode != "all")
        {
            rowsQuery = rowsQuery.Where(user => user.Roles.Any(role => role.Role.Code.ToLower() == roleCode));
        }

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderBy(user => user.Login)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList()
            .Select(user => new InventoryUserDto(
                user.Id,
                user.Login,
                user.DisplayName,
                user.Status,
                user.Roles.Select(role => role.Role.Code).OrderBy(role => role).ToList()))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryUserDto> DisableUser(Guid id)
    {
        var user = dbContext.SiteUsers
            .Include(row => row.Roles)
            .ThenInclude(role => role.Role)
            .FirstOrDefault(row => row.Id == id);
        if (user is null)
        {
            return Failure<InventoryUserDto>("id", "User not found");
        }

        user.Status = "disabled";
        AddSystemLog("site_user", user.Id, "disabled", user.Login, DateTimeOffset.UtcNow);
        dbContext.SaveChanges();

        return Success(new InventoryUserDto(
            user.Id,
            user.Login,
            user.DisplayName,
            user.Status,
            user.Roles.Select(role => role.Role.Code).OrderBy(role => role).ToList()));
    }

    private InventoryEmployeeImportPreviewDto BuildEmployeeImportPreview(IReadOnlyList<Dictionary<string, string>> rows)
    {
        var existingEmployees = dbContext.Employees
            .AsNoTracking()
            .Select(employee => new { employee.PersonnelNo, employee.FullName })
            .ToList();
        var existingPersonnel = existingEmployees
            .Select(employee => employee.PersonnelNo)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var existingFullNames = existingEmployees
            .GroupBy(employee => NormalizeFullName(employee.FullName))
            .Where(group => group.Key.Length > 0)
            .ToDictionary(group => group.Key, group => group.First().PersonnelNo, StringComparer.OrdinalIgnoreCase);
        var existingNamesByPersonnel = existingEmployees
            .GroupBy(employee => employee.PersonnelNo, StringComparer.OrdinalIgnoreCase)
            .Where(group => !string.IsNullOrWhiteSpace(group.Key))
            .ToDictionary(group => group.Key, group => NormalizeFullName(group.First().FullName), StringComparer.OrdinalIgnoreCase);
        var existingPositions = dbContext.AccountingEmployeeReferences
            .AsNoTracking()
            .Where(reference => reference.Kind == "position")
            .Select(reference => reference.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var existingDepartments = dbContext.AccountingEmployeeReferences
            .AsNoTracking()
            .Where(reference => reference.Kind == "department")
            .Select(reference => reference.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var existingGroups = dbContext.AccountingEmployeeReferences
            .AsNoTracking()
            .Where(reference => reference.Kind == "group")
            .Select(reference => reference.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var seenPersonnel = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenFullNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var previewRows = new List<InventoryEmployeeImportPreviewRowDto>();
        var errors = new List<string>();
        var newPositions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var newDepartments = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var newGroups = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var (row, index) in rows.Select((row, index) => (row, index + 2)))
        {
            var fullName = ReadField(row, "фио", "сотрудник", "full_name", "name");
            var personnelNo = ReadField(row, "табельный", "табельный номер", "personnelno", "personnel_no", "code");
            var position = ReadField(row, "должность", "position", "role");
            var department = ReadField(row, "подразделение", "отдел", "department");
            var employeeGroup = NormalizeEmployeeGroup(ReadField(row, "группа", "организация", "employee_group", "company"));
            var hiredAt = ParseDateOnly(ReadField(row, "дата приема", "дата приёма", "hired_at", "hire_date"));
            var birthDate = ParseDateOnly(ReadField(row, "дата рождения", "birth_date"));
            var normalizedFullName = NormalizeFullName(fullName);
            var error = string.Empty;

            if (string.IsNullOrWhiteSpace(fullName))
            {
                error = "Не заполнено ФИО сотрудника";
            }
            else if (string.IsNullOrWhiteSpace(personnelNo))
            {
                personnelNo = $"INV-{StableToken(fullName)}";
            }

            if (error.Length == 0 && !seenFullNames.Add(normalizedFullName))
            {
                error = $"Дублируется ФИО {fullName} в импортируемом файле";
            }

            if (error.Length == 0 && !seenPersonnel.Add(personnelNo))
            {
                error = $"Дублируется табельный номер {personnelNo} в импортируемом файле";
            }

            if (error.Length == 0
                && existingNamesByPersonnel.TryGetValue(personnelNo, out var nameForPersonnel)
                && existingFullNames.TryGetValue(normalizedFullName, out var personnelForName)
                && !string.Equals(nameForPersonnel, normalizedFullName, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(personnelForName, personnelNo, StringComparison.OrdinalIgnoreCase))
            {
                error = $"ФИО {fullName} и табельный номер {personnelNo} относятся к разным сотрудникам";
            }

            if (error.Length > 0)
            {
                errors.Add($"Строка {index}: {error}");
            }
            else
            {
                if (!string.IsNullOrWhiteSpace(position) && !existingPositions.Contains(position))
                {
                    newPositions.Add(position);
                }

                if (!string.IsNullOrWhiteSpace(department) && !existingDepartments.Contains(department))
                {
                    newDepartments.Add(department);
                }

                if (!string.IsNullOrWhiteSpace(employeeGroup) && !existingGroups.Contains(employeeGroup))
                {
                    newGroups.Add(employeeGroup);
                }
            }

            previewRows.Add(new InventoryEmployeeImportPreviewRowDto(
                index,
                fullName,
                personnelNo,
                position,
                department,
                employeeGroup,
                hiredAt,
                birthDate,
                error.Length > 0
                    ? "error"
                    : existingPersonnel.Contains(personnelNo) || existingFullNames.ContainsKey(normalizedFullName)
                        ? "update"
                        : "create",
                error));
        }

        return new InventoryEmployeeImportPreviewDto(
            rows.Count,
            previewRows.Count(row => row.ChangeType == "create"),
            previewRows.Count(row => row.ChangeType == "update"),
            previewRows.Count(row => row.ChangeType == "error"),
            newPositions.OrderBy(value => value).ToList(),
            newDepartments.OrderBy(value => value).ToList(),
            newGroups.OrderBy(value => value).ToList(),
            errors,
            previewRows);
    }

    private InventoryCommandResult<InventoryCustodyDocumentDto> ChangeCustodyDocumentStatus(Guid id, string status)
    {
        var document = dbContext.InventoryCustodyDocuments
            .Include(row => row.Employee)
            .Include(row => row.Records)
            .FirstOrDefault(row => row.Id == id && row.ArchivedAt == null);
        if (document is null)
        {
            return Failure<InventoryCustodyDocumentDto>("id", "Custody document not found");
        }

        document.Status = status;
        document.ClosedAt = status == "closed" ? DateTimeOffset.UtcNow : null;
        AddSystemLog("custody_document", document.Id, status, document.Number, DateTimeOffset.UtcNow);
        dbContext.SaveChanges();

        return Success(MapCustodyDocument(document));
    }

    private InventoryCustodyDocumentEntity CreateCustodyDocument(EmployeeEntity employee, DateTimeOffset now)
    {
        var document = new InventoryCustodyDocumentEntity
        {
            Id = Guid.NewGuid(),
            EmployeeId = employee.Id,
            Number = $"CST-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}",
            Status = "open",
            CreatedAt = now
        };
        dbContext.InventoryCustodyDocuments.Add(document);
        return document;
    }

    private InventoryCommandResult<InventoryPpeCardLineDto>? ValidatePpeLine(UpsertInventoryPpeCardLineDto request)
    {
        if (request.Quantity <= 0)
        {
            return Failure<InventoryPpeCardLineDto>("quantity", "Quantity must be greater than zero");
        }

        if (!dbContext.InventoryItems.Any(row => row.Id == request.ItemId))
        {
            return Failure<InventoryPpeCardLineDto>("itemId", "Item not found");
        }

        return null;
    }

    private decimal GetAvailableStock(Guid itemId, Guid warehouseId)
    {
        var physical = 0m;
        var reserved = 0m;

        foreach (var move in dbContext.InventoryStockMoves
            .Where(row => row.ItemId == itemId && row.WarehouseId == warehouseId)
            .Select(row => new { row.MoveType, row.QuantityDelta }))
        {
            if (ReservationMoveTypes.Contains(move.MoveType))
            {
                reserved += move.QuantityDelta < 0 ? -move.QuantityDelta : move.QuantityDelta;
            }
            else
            {
                physical += move.QuantityDelta;
            }
        }

        return Math.Max(0m, physical - reserved);
    }

    private InventoryCustodyRecordEntity LoadCustodyRecord(Guid id) =>
        dbContext.InventoryCustodyRecords
            .AsNoTracking()
            .Include(record => record.Document)
            .Include(record => record.Employee)
            .Include(record => record.Item)
            .Include(record => record.Warehouse)
            .First(record => record.Id == id);

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

    private static InventoryCustodyRecordDto MapCustodyRecord(InventoryCustodyRecordEntity record) =>
        new(
            record.Id,
            record.DocumentId,
            record.Employee.FullName,
            record.Item.Name,
            record.Warehouse.Name,
            record.Quantity,
            record.Status,
            record.IssuedAt.UtcDateTime,
            record.ClosedAt?.UtcDateTime,
            record.ItemId,
            record.WarehouseId,
            record.Item.Unit?.Symbol ?? record.Item.Unit?.Name ?? string.Empty,
            record.Comment ?? string.Empty);

    private static InventoryCustodyDocumentDto MapCustodyDocument(InventoryCustodyDocumentEntity document) =>
        new(
            document.Id,
            document.Number,
            document.Employee.FullName,
            document.Status,
            document.CreatedAt.UtcDateTime,
            document.Records.Count(record => record.ArchivedAt == null));

    private static InventoryPpeCardDto MapPpeCard(InventoryPpeCardEntity card) =>
        new(card.Id, card.EmployeeId, card.Employee.FullName, card.Position, card.Status, card.Lines.Count);
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
            line.Item.DefaultUnitPriceMinor,
            (line.Item.DefaultUnitPriceMinor ?? 0) * line.Quantity,
            line.Status,
            line.IssuedAt?.UtcDateTime,
            line.DueAt?.UtcDateTime,
            string.Join(" / ", new[] { line.Item.BrandName, line.Item.ModelName, line.Item.Article, line.Item.ProtectionClass }.Where(part => !string.IsNullOrWhiteSpace(part))),
            line.Item.NormItemName ?? string.Empty);

    private static InventoryPpeMovementDto MapPpeMovement(
        InventoryPpeCardLineEntity line,
        IReadOnlyDictionary<Guid, DateTime?> returnedAt,
        IReadOnlyDictionary<Guid, DateTime?> writtenOffAt) =>
        new(
            line.CardId,
            line.Id,
            line.Card.EmployeeId,
            line.Card.Employee.FullName,
            line.Card.Employee.PersonnelNo,
            line.Card.Employee.Department,
            line.ItemId,
            line.Item.Name,
            line.Quantity,
            line.Item.Unit?.Symbol ?? line.Item.Unit?.Name ?? string.Empty,
            line.Item.DefaultUnitPriceMinor,
            (line.Item.DefaultUnitPriceMinor ?? 0) * line.Quantity,
            line.Status,
            line.Card.CreatedAt.UtcDateTime,
            line.IssuedAt?.UtcDateTime,
            returnedAt.GetValueOrDefault(line.Id),
            writtenOffAt.GetValueOrDefault(line.Id),
            line.DueAt?.UtcDateTime,
            line.Comment);

    private static InventoryEmployeeDto MapEmployee(EmployeeEntity employee) =>
        new(
            employee.Id,
            employee.FullName,
            employee.PersonnelNo,
            employee.Position,
            employee.Department,
            NormalizeInventoryEmployeeStatus(employee.Status),
            employee.EmployeeGroup,
            employee.HiredAt,
            employee.BirthDate);

    private static InventoryExportJobDto MapExport(InventoryExportJobEntity export) =>
        new(export.Id, export.ReportId, export.Format, export.Status, export.CreatedAt.UtcDateTime, export.DownloadName);

    private InventoryListResponseDto<InventoryHistoryDto> GetHistoryFromEvents(
        InventoryListQuery query,
        Func<IQueryable<InventoryPpeCardLineEventEntity>, IQueryable<InventoryPpeCardLineEventEntity>> filter)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = filter(dbContext.InventoryPpeCardLineEvents.AsNoTracking());
        var total = rowsQuery.Count();
        var rowEntities = rowsQuery
            .OrderByDescending(row => row.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        var rows = rowEntities
            .Select(row => new InventoryHistoryDto(row.Id, "ppe_card_line", row.EventType, $"{row.FromStatus} -> {row.ToStatus}", row.Actor, row.CreatedAt.UtcDateTime))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    private InventoryListResponseDto<InventoryHistoryDto> GetCustodyHistoryFromEvents(
        InventoryListQuery query,
        Func<IQueryable<InventoryCustodyRecordEventEntity>, IQueryable<InventoryCustodyRecordEventEntity>> filter)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = filter(dbContext.InventoryCustodyRecordEvents.AsNoTracking());
        var total = rowsQuery.Count();
        var rowEntities = rowsQuery
            .OrderByDescending(row => row.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        var rows = rowEntities
            .Select(row => new InventoryHistoryDto(row.Id, "custody_record", row.EventType, $"{row.FromStatus} -> {row.ToStatus}", row.Actor, row.CreatedAt.UtcDateTime))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

    private void AddCustodyEvent(Guid recordId, string eventType, string fromStatus, string toStatus, string? comment, DateTimeOffset now) =>
        dbContext.InventoryCustodyRecordEvents.Add(new InventoryCustodyRecordEventEntity
        {
            Id = Guid.NewGuid(),
            RecordId = recordId,
            EventType = eventType,
            FromStatus = fromStatus,
            ToStatus = toStatus,
            Comment = NormalizeOptional(comment),
            Actor = Actor,
            CreatedAt = now
        });

    private void AddPpeEvent(Guid lineId, string eventType, string fromStatus, string toStatus, string? comment, DateTimeOffset now) =>
        dbContext.InventoryPpeCardLineEvents.Add(new InventoryPpeCardLineEventEntity
        {
            Id = Guid.NewGuid(),
            LineId = lineId,
            EventType = eventType,
            FromStatus = fromStatus,
            ToStatus = toStatus,
            Comment = NormalizeOptional(comment),
            Actor = Actor,
            CreatedAt = now
        });

    private void AddSystemLog(string entityType, Guid entityId, string action, string details, DateTimeOffset now) =>
        dbContext.InventorySystemLogs.Add(new InventorySystemLogEntity
        {
            Id = Guid.NewGuid(),
            EntityType = entityType,
            EntityId = entityId,
            Action = action,
            Details = details,
            Actor = Actor,
            CreatedAt = now
        });

    private static IQueryable<InventorySystemLogEntity> ApplySystemLogFilters(
        IQueryable<InventorySystemLogEntity> rowsQuery,
        InventoryListQuery query)
    {
        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            rowsQuery = rowsQuery.Where(row =>
                row.EntityType.ToLower().Contains(search) ||
                row.Action.ToLower().Contains(search) ||
                row.Details.ToLower().Contains(search) ||
                row.Actor.ToLower().Contains(search));
        }

        var entityType = NormalizeOptional(query.EntityType).ToLowerInvariant();
        if (entityType.Length > 0 && entityType != "all")
        {
            rowsQuery = rowsQuery.Where(row => row.EntityType.ToLower() == entityType);
        }

        var action = NormalizeOptional(query.Action).ToLowerInvariant();
        if (action.Length > 0 && action != "all")
        {
            rowsQuery = rowsQuery.Where(row => row.Action.ToLower() == action);
        }

        var actor = NormalizeOptional(query.Actor).ToLowerInvariant();
        if (actor.Length > 0 && actor != "all")
        {
            rowsQuery = rowsQuery.Where(row => row.Actor.ToLower().Contains(actor));
        }

        if (query.DateFrom.HasValue)
        {
            rowsQuery = rowsQuery.Where(row => row.CreatedAt >= query.DateFrom.Value);
        }

        if (query.DateTo.HasValue)
        {
            rowsQuery = rowsQuery.Where(row => row.CreatedAt <= query.DateTo.Value);
        }

        return rowsQuery;
    }

    private static InventoryListResponseDto<T> ToListResponse<T>(IReadOnlyList<T> rows, int total, InventoryPaging paging) =>
        new(rows, total, paging.Page, paging.PageSize, total == 0 ? 0 : (int)Math.Ceiling(total / (double)paging.PageSize));

    private static InventoryPaging NormalizePaging(InventoryListQuery query) =>
        new(Math.Max(1, query.Page), Math.Clamp(query.PageSize, 1, 100));

    private static string NormalizeQuery(string? query) => query?.Trim().ToLowerInvariant() ?? string.Empty;

    private static string NormalizeOptional(string? value) => value?.Trim() ?? string.Empty;

    private static string NormalizeStatus(string? status) => NormalizeOptional(status).ToLowerInvariant();

    private static string NormalizeFullName(string? value) =>
        string.Join(' ', (value ?? string.Empty)
            .Trim()
            .ToUpperInvariant()
            .Split([' ', '\t', '\r', '\n'], StringSplitOptions.RemoveEmptyEntries));

    private static IQueryable<EmployeeEntity> ApplyInventoryEmployeeStatusFilter(IQueryable<EmployeeEntity> query, string status)
    {
        if (status == "archived")
        {
            return query.Where(row =>
                row.Status.ToLower() == "archived" ||
                row.Status.ToLower() == "archive" ||
                row.Status.ToLower().Contains("архив"));
        }

        if (status == "inactive" || status == "disabled")
        {
            return query.Where(row =>
                row.Status.ToLower() == status ||
                row.Status.ToLower() == "inactive" ||
                row.Status.ToLower() == "disabled" ||
                row.Status.ToLower().Contains("неактив"));
        }

        return query.Where(row =>
            row.Status == null ||
            (
                row.Status.ToLower() != "archived" &&
                row.Status.ToLower() != "archive" &&
                row.Status.ToLower() != "inactive" &&
                row.Status.ToLower() != "disabled" &&
                !row.Status.ToLower().Contains("архив") &&
                !row.Status.ToLower().Contains("неактив")
            ));
    }

    private static string NormalizeInventoryEmployeeStatus(string? status)
    {
        var value = NormalizeStatus(status);
        if (value is "archived" or "archive" or "inactive" or "disabled")
        {
            return value is "archive" ? "archived" : value;
        }

        if (value.Contains("архив", StringComparison.OrdinalIgnoreCase))
        {
            return "archived";
        }

        if (value.Contains("неактив", StringComparison.OrdinalIgnoreCase))
        {
            return "inactive";
        }

        return "active";
    }

    private static IReadOnlyList<Dictionary<string, string>> ReadEmployeeRowsFromDelimitedText(Stream source)
    {
        using var reader = new StreamReader(source, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        var lines = reader.ReadToEnd()
            .Split(["\r\n", "\n"], StringSplitOptions.None)
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .ToList();
        if (lines.Count == 0)
        {
            return [];
        }

        var separator = lines[0].Contains(';') ? ';' : ',';
        var headers = lines[0].Split(separator).Select(NormalizeHeader).ToList();
        return lines
            .Skip(1)
            .Select(line => line.Split(separator))
            .Select(cells => headers
                .Select((header, index) => new { header, value = index < cells.Length ? cells[index].Trim() : string.Empty })
                .Where(cell => cell.header.Length > 0)
                .ToDictionary(cell => cell.header, cell => cell.value, StringComparer.OrdinalIgnoreCase))
            .Where(row => row.Count > 0)
            .ToList();
    }

    private static IReadOnlyList<Dictionary<string, string>> ReadEmployeeRowsFromXlsx(Stream source)
    {
        using var archive = new ZipArchive(source, ZipArchiveMode.Read, leaveOpen: true);
        var sheetEntry = archive.GetEntry("xl/worksheets/sheet1.xml")
            ?? throw new InvalidDataException("XLSX sheet1.xml was not found");
        var sharedStrings = ReadSharedStrings(archive);

        using var sheetStream = sheetEntry.Open();
        var sheet = XDocument.Load(sheetStream);
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var rowElements = sheet.Descendants(ns + "row").ToList();
        if (rowElements.Count == 0)
        {
            return [];
        }

        var parsedRows = rowElements.Select(row => ReadXlsxRow(row, ns, sharedStrings)).ToList();
        var headerIndex = parsedRows.FindIndex(row =>
            row.Any(cell => NormalizeHeader(cell).Contains("сотрудник", StringComparison.OrdinalIgnoreCase)) &&
            row.Any(cell => NormalizeHeader(cell).Contains("табель", StringComparison.OrdinalIgnoreCase)));
        if (headerIndex < 0)
        {
            throw new InvalidDataException("XLSX header row with employee and personnel number columns was not found");
        }

        var headers = parsedRows[headerIndex].Select(NormalizeHeader).ToList();
        var rows = new List<Dictionary<string, string>>();
        var currentDepartment = string.Empty;
        var employeeGroup = string.Empty;
        foreach (var cells in parsedRows)
        {
            var organization = ReadOrganizationName(cells);
            if (!string.IsNullOrWhiteSpace(organization))
            {
                employeeGroup = NormalizeEmployeeGroup(organization);
            }

            var department = ReadDepartmentRow(cells);
            if (!string.IsNullOrWhiteSpace(department))
            {
                currentDepartment = department;
                continue;
            }

            var row = headers
                .Select((header, index) => new { header, value = index < cells.Count ? cells[index].Trim() : string.Empty })
                .Where(cell => cell.header.Length > 0)
                .ToDictionary(cell => cell.header, cell => cell.value, StringComparer.OrdinalIgnoreCase);
            if (!row.ContainsKey(NormalizeHeader("подразделение")) && !string.IsNullOrWhiteSpace(currentDepartment))
            {
                row[NormalizeHeader("подразделение")] = currentDepartment;
            }

            if (!row.ContainsKey(NormalizeHeader("группа")) && !string.IsNullOrWhiteSpace(employeeGroup))
            {
                row[NormalizeHeader("группа")] = employeeGroup;
            }

            if (!string.IsNullOrWhiteSpace(ReadField(row, "фио", "сотрудник", "full_name", "name")))
            {
                rows.Add(row);
            }
        }

        return rows;
    }

    private static List<string> ReadSharedStrings(ZipArchive archive)
    {
        var entry = archive.GetEntry("xl/sharedStrings.xml");
        if (entry is null)
        {
            return [];
        }

        using var stream = entry.Open();
        var document = XDocument.Load(stream);
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        return document.Descendants(ns + "si")
            .Select(item => string.Concat(item.Descendants(ns + "t").Select(text => text.Value)))
            .ToList();
    }

    private static List<string> ReadXlsxRow(XElement rowElement, XNamespace ns, IReadOnlyList<string> sharedStrings)
    {
        var cells = new SortedDictionary<int, string>();
        foreach (var cell in rowElement.Elements(ns + "c"))
        {
            var reference = cell.Attribute("r")?.Value ?? string.Empty;
            var index = ColumnIndex(reference);
            var raw = cell.Element(ns + "v")?.Value ?? cell.Element(ns + "is")?.Element(ns + "t")?.Value ?? string.Empty;
            var value = raw;
            if (cell.Attribute("t")?.Value == "s" && int.TryParse(raw, out var sharedIndex) && sharedIndex >= 0 && sharedIndex < sharedStrings.Count)
            {
                value = sharedStrings[sharedIndex];
            }

            cells[index] = value;
        }

        return cells.Count == 0
            ? []
            : Enumerable.Range(0, cells.Keys.Max() + 1).Select(index => cells.TryGetValue(index, out var value) ? value : string.Empty).ToList();
    }

    private static int ColumnIndex(string cellReference)
    {
        var index = 0;
        foreach (var character in cellReference.TakeWhile(char.IsLetter))
        {
            index = (index * 26) + (char.ToUpperInvariant(character) - 'A' + 1);
        }

        return Math.Max(0, index - 1);
    }

    private static string NormalizeHeader(string header) => header.Trim().ToLowerInvariant().Replace("ё", "е");

    private static string ReadOrganizationName(IReadOnlyList<string> cells)
    {
        for (var index = 0; index < cells.Count - 1; index += 1)
        {
            if (NormalizeHeader(cells[index]) == NormalizeHeader("организация"))
            {
                return cells.Skip(index + 1).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? string.Empty;
            }
        }

        return string.Empty;
    }

    private static string ReadDepartmentRow(IReadOnlyList<string> cells)
    {
        var nonEmpty = cells
            .Select((value, index) => new { index, value = value.Trim() })
            .Where(cell => cell.value.Length > 0)
            .ToList();

        if (nonEmpty.Count != 1 || nonEmpty[0].index != 0)
        {
            return string.Empty;
        }

        var value = nonEmpty[0].value;
        if (int.TryParse(value, out _) ||
            NormalizeHeader(value) is "штатные сотрудники" or "отбор:" or "организация" or "всего сотрудников" or "подразделение")
        {
            return string.Empty;
        }

        return value;
    }

    private static DateOnly? ParseDateOnly(string value)
    {
        var normalized = value.Trim();
        if (normalized.Length == 0)
        {
            return null;
        }

        if (DateOnly.TryParseExact(normalized, "dd.MM.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var exactDate) ||
            DateOnly.TryParseExact(normalized, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out exactDate))
        {
            return exactDate;
        }

        if (double.TryParse(normalized, NumberStyles.Float, CultureInfo.InvariantCulture, out var serial))
        {
            return DateOnly.FromDateTime(new DateTime(1899, 12, 30).AddDays(serial));
        }

        return DateOnly.TryParse(normalized, CultureInfo.GetCultureInfo("ru-RU"), DateTimeStyles.None, out var parsedDate)
            ? parsedDate
            : null;
    }

    private static string NormalizeEmployeeGroup(string value)
    {
        var normalized = value.Trim();
        if (normalized.Contains("экология", StringComparison.OrdinalIgnoreCase))
        {
            return "Атом Экология";
        }

        if (normalized.Contains("атом", StringComparison.OrdinalIgnoreCase))
        {
            return "Атом";
        }

        return normalized;
    }

    private void UpsertEmployeeReference(string kind, string name, DateTimeOffset now)
    {
        var normalized = name.Trim();
        if (normalized.Length == 0)
        {
            return;
        }

        var local = dbContext.AccountingEmployeeReferences.Local.FirstOrDefault(reference =>
            reference.Kind == kind && reference.Name.Equals(normalized, StringComparison.OrdinalIgnoreCase));
        if (local is not null)
        {
            local.IsArchived = false;
            return;
        }

        var existing = dbContext.AccountingEmployeeReferences.FirstOrDefault(reference =>
            reference.Kind == kind && reference.Name.ToLower() == normalized.ToLower());
        if (existing is not null)
        {
            if (existing.IsArchived)
            {
                existing.IsArchived = false;
            }

            return;
        }

        dbContext.AccountingEmployeeReferences.Add(new AccountingEmployeeReferenceEntity
        {
            Id = Guid.NewGuid(),
            Kind = kind,
            Name = normalized,
            CreatedAt = now
        });
    }

    private static string ReadField(IReadOnlyDictionary<string, string> row, params string[] names)
    {
        foreach (var name in names.Select(NormalizeHeader))
        {
            if (row.TryGetValue(name, out var value))
            {
                return value.Trim();
            }
        }

        return string.Empty;
    }

    private static string StableToken(string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value.Trim().ToLowerInvariant());
        var hash = System.Security.Cryptography.SHA256.HashData(bytes);
        return Convert.ToHexString(hash)[..8];
    }

    private static string NormalizeCustodyStatus(string? status)
    {
        var value = NormalizeStatus(status);
        return value is "in_use" or "returned" or "written_off" or "lost"
            ? value
            : value == "write_off"
                ? "written_off"
                : string.Empty;
    }

    private static string NormalizePpeStatus(string? status)
    {
        var value = NormalizeStatus(status);
        return value is "not_issued" or "issuing" or "issued" or "partial" or "returned" or "reissued" or "lost" or "written_off"
            ? value
            : value == "write_off"
                ? "written_off"
                : string.Empty;
    }

    private static bool IsAllowedPpeLineStatusTransition(string oldStatus, string nextStatus) =>
        oldStatus switch
        {
            "not_issued" or "issuing" or "partial" => nextStatus is "not_issued" or "issuing" or "partial" or "issued",
            "issued" => nextStatus is "returned" or "written_off" or "lost",
            "returned" or "written_off" or "lost" or "archived" => false,
            _ => nextStatus is "not_issued" or "issuing" or "issued" or "partial"
        };

    private static InventoryCommandResult<T> Success<T>(T value) => new(value, EmptyErrors);

    private static InventoryCommandResult<T> Failure<T>(string key, string message) =>
        new(default, new Dictionary<string, string[]> { [key] = [message] });

    private static readonly IReadOnlyDictionary<string, string[]> EmptyErrors =
        new Dictionary<string, string[]>();

    private sealed record InventoryPaging(int Page, int PageSize);
}

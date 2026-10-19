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

    public InventoryCommandResult<InventoryPpeCardLineDto> UpdatePpeCardLineStatus(Guid cardId, Guid lineId, UpdateInventoryStatusDto request)
        => ExecuteLegacyPpeWrite(() => UpdatePpeCardLineStatusCore(cardId, lineId, request));

    private InventoryCommandResult<InventoryPpeCardLineDto> UpdatePpeCardLineStatusCore(Guid cardId, Guid lineId, UpdateInventoryStatusDto request)
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

        if (line.IssueDocumentId.HasValue
            && IsPpeSignatureLineStatus(nextStatus)
            && !PpeIssueStatusCatalog.IsClosedStatus(nextStatus))
        {
            return Failure<InventoryPpeCardLineDto>(
                "status",
                "Строка СИЗ из подтверждённого документа выдачи не может быть переоткрыта.");
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

        if (IsPpeSectionTitle(line.PrintItemName) && IsPpeSignatureLineStatus(nextStatus))
        {
            return Failure<InventoryPpeCardLineDto>("status", "PPE section title cannot be issued.");
        }

        if (nextStatus is "returned" or "written_off")
            return ApplyPpeLineAction(cardId, lineId, new ApplyInventoryPpeLineActionDto(nextStatus, DateTimeOffset.UtcNow, Comment: request.Comment));

        var now = DateTimeOffset.UtcNow;
        if (IsPpeSignatureLineStatus(nextStatus) && !IsPpeSignatureLineStatus(oldStatus))
        {
            var validated = ValidateLegacyPpeIssuance(cardId, [new(line.CardNormRowId ?? Guid.Empty, line.ItemId,
                line.IssuedAt ?? now, line.Quantity, line.UnitPriceMinor, line.SizeText, line.IssueMethod)], line.Id);
            if (!validated.Succeeded) return new(null, validated.Errors);
            StampLegacyPpeFact(line, validated.Value!);
            line.Card.Version += 1;
        }
        if (line.IssueDocumentId is null
            && IsPpeSignatureLineStatus(nextStatus)
            && !IsPpeSignatureLineStatus(oldStatus))
        {
            line.IssuedAt ??= now;
        }
        else if (line.IssueDocumentId is null && PpeIssueStatusCatalog.IsClosedStatus(nextStatus))
        {
            // A closed PPE line must not keep a stale active issued date in reports.
            line.IssuedAt ??= now;
        }

        line.Status = nextStatus;
        var eventType = ToPpeHistoryAction(oldStatus, nextStatus);
        AddPpeEvent(line.Id, eventType, oldStatus, nextStatus, request.Comment, now);
        AddPpeLineSystemLog(line, eventType, request.Comment, now);
        dbContext.SaveChanges();

        return Success(MapPpeCardLine(LoadPpeLine(line.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardLineDto> ApplyPpeLineAction(Guid cardId, Guid lineId, ApplyInventoryPpeLineActionDto request)
    {
        var action = NormalizeStatus(request.Action);
        if (action is not ("returned" or "written_off" or "defective"))
        {
            return Failure<InventoryPpeCardLineDto>("action", "Unsupported PPE line action");
        }

        var line = dbContext.InventoryPpeCardLines.Include(row => row.Card)
            .FirstOrDefault(row => row.Id == lineId && row.CardId == cardId && row.Status != "archived");
        if (line is null) return Failure<InventoryPpeCardLineDto>("lineId", "PPE card line not found");
        if (request.ExpectedVersion is not null && line.Card.Version != request.ExpectedVersion)
        {
            return Failure<InventoryPpeCardLineDto>("conflict", "PPE card was changed by another user");
        }

        var oldStatus = line.Status;
        var remaining = line.Quantity - (line.ReturnedQuantity ?? 0m);
        if (remaining <= 0 || (PpeIssueStatusCatalog.IsClosedStatus(oldStatus) && !(oldStatus == "returned" && remaining > 0)))
            return Failure<InventoryPpeCardLineDto>("status", "Позиция уже полностью возвращена, списана или закрыта");
        if (!IsPpeSignatureLineStatus(oldStatus))
            return Failure<InventoryPpeCardLineDto>("status", "Действие доступно только для ранее выданной позиции");
        if (action == "returned")
        {
            var quantity = request.Quantity ?? remaining;
            if (quantity <= 0 || quantity > remaining)
                return Failure<InventoryPpeCardLineDto>("quantity", $"Количество возврата должно быть положительным и не превышать остаток {remaining}");
            line.ReturnedAt = request.OccurredAt.ToUniversalTime();
            line.ReturnedQuantity = (line.ReturnedQuantity ?? 0m) + quantity;
            line.Status = line.ReturnedQuantity == line.Quantity ? "returned" : "issued";
        }
        else if (action == "written_off")
        {
            line.WriteOffActDate = (request.WriteOffActDate ?? request.OccurredAt).ToUniversalTime();
            line.WriteOffActNumber = NormalizeOptional(request.WriteOffActNumber);
            line.Status = "written_off";
        }
        else line.Status = "defective";
        line.Card.Version += 1;
        var details = action == "returned" ? $"{request.Comment} Возвращено всего {line.ReturnedQuantity} из {line.Quantity}." : request.Comment;
        AddPpeEvent(line.Id, action, oldStatus, line.Status, details, request.OccurredAt.ToUniversalTime());
        AddPpeLineSystemLog(line, action, details, request.OccurredAt.ToUniversalTime());
        try { dbContext.SaveChanges(); }
        catch (DbUpdateConcurrencyException)
        {
            dbContext.ChangeTracker.Clear();
            return Failure<InventoryPpeCardLineDto>("conflict", "PPE card was changed by another user");
        }

        return Success(MapPpeCardLine(LoadPpeLine(lineId)!));
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

        if (line.IssueDocumentId.HasValue)
        {
            return Failure<InventoryPpeCardLineDto>(
                "lineId",
                "Строка СИЗ из подтверждённого документа выдачи защищена от архивирования.");
        }

        if (IsPpeSignatureLineStatus(line.Status) && !PpeIssueStatusCatalog.IsClosedStatus(line.Status))
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
            .Where(ev => lineIds.Contains(ev.LineId) &&
                (ev.ToStatus == PpeIssueStatusCatalog.Returned || ev.ToStatus == PpeIssueStatusCatalog.WrittenOff))
            .GroupBy(ev => new { ev.LineId, ev.ToStatus })
            .Select(group => new { group.Key.LineId, group.Key.ToStatus, ClosedAt = group.Max(ev => ev.CreatedAt) })
            .ToList();
        var returnedAt = closingEvents
            .Where(ev => ev.ToStatus == PpeIssueStatusCatalog.Returned)
            .ToDictionary(ev => ev.LineId, ev => (DateTime?)ev.ClosedAt.UtcDateTime);
        var writtenOffAt = closingEvents
            .Where(ev => ev.ToStatus == PpeIssueStatusCatalog.WrittenOff)
            .ToDictionary(ev => ev.LineId, ev => (DateTime?)ev.ClosedAt.UtcDateTime);

        var rows = lineEntities
            .Select(line => MapPpeMovement(line, returnedAt, writtenOffAt))
            .ToList();

        return ToListResponse(rows, total, paging);
    }

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
            line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor,
            (line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor ?? 0) * line.Quantity,
            line.Status,
            line.Card.CreatedAt.UtcDateTime,
            line.IssuedAt?.UtcDateTime,
            returnedAt.GetValueOrDefault(line.Id),
            writtenOffAt.GetValueOrDefault(line.Id),
            line.DueAt?.UtcDateTime,
            line.Comment);
}

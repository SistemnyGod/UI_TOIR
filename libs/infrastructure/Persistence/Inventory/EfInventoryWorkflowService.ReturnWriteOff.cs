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

        if (IsPpeSectionTitle(line.PrintItemName) && IsPpeSignatureLineStatus(nextStatus))
        {
            return Failure<InventoryPpeCardLineDto>("status", "PPE section title cannot be issued.");
        }

        var stockValidation = ValidatePpeStatusStockTransition(line, oldStatus, nextStatus);
        if (stockValidation is not null)
        {
            return stockValidation;
        }

        var now = DateTimeOffset.UtcNow;
        if (IsPpeSignatureLineStatus(nextStatus) && !IsPpeSignatureLineStatus(oldStatus))
        {
            line.IssuedAt ??= now;
        }
        else if (PpeIssueStatusCatalog.IsClosedStatus(nextStatus))
        {
            // A closed PPE line must not keep a stale active issued date in reports.
            line.IssuedAt ??= now;
        }

        line.Status = nextStatus;
        AddPpeStockMoveIfNeeded(line, oldStatus, nextStatus, now);
        var eventType = ToPpeHistoryAction(oldStatus, nextStatus);
        AddPpeEvent(line.Id, eventType, oldStatus, nextStatus, request.Comment, now);
        AddPpeLineSystemLog(line, eventType, request.Comment, now);
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

        if (line.Status == PpeIssueStatusCatalog.Issued)
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

    private void AddPpeStockMoveIfNeeded(
        InventoryPpeCardLineEntity line,
        string oldStatus,
        string nextStatus,
        DateTimeOffset now)
    {
        if (line.WarehouseId is null)
        {
            return;
        }

        string moveType;
        decimal quantityDelta;
        if (IsPpeSignatureLineStatus(nextStatus) && !IsPpeSignatureLineStatus(oldStatus))
        {
            moveType = "ppe_issue";
            quantityDelta = -line.Quantity;
        }
        else if (IsPpeSignatureLineStatus(oldStatus) && nextStatus == PpeIssueStatusCatalog.Returned)
        {
            moveType = "ppe_return";
            quantityDelta = line.Quantity;
        }
        else if (IsPpeSignatureLineStatus(oldStatus) && nextStatus == PpeIssueStatusCatalog.WrittenOff)
        {
            moveType = "ppe_write_off";
            quantityDelta = 0;
        }
        else
        {
            return;
        }

        var alreadyRecorded = dbContext.InventoryStockMoves.Any(move =>
            move.PpeCardLineId == line.Id &&
            move.MoveType == moveType);
        if (alreadyRecorded)
        {
            return;
        }

        var documentId = moveType == "ppe_issue"
            ? line.CardId
            : Guid.NewGuid();

        dbContext.InventoryStockMoves.Add(new InventoryStockMoveEntity
        {
            Id = Guid.NewGuid(),
            ItemId = line.ItemId,
            WarehouseId = line.WarehouseId.Value,
            EmployeeId = line.Card?.EmployeeId ?? dbContext.InventoryPpeCards
                .Where(card => card.Id == line.CardId)
                .Select(card => card.EmployeeId)
                .First(),
            QuantityDelta = quantityDelta,
            MovedAt = now,
            MoveType = moveType,
            ReferenceType = moveType == "ppe_issue" ? "ppe_card_line" : moveType,
            ReferenceId = documentId,
            PpeCardLineId = line.Id
        });
    }

    private decimal GetAvailableStock(Guid itemId, Guid warehouseId)
    {
        var physical = 0m;
        var reserved = 0m;

        foreach (var move in dbContext.InventoryStockMoves
            .Where(row => row.ItemId == itemId && row.WarehouseId == warehouseId)
            .Select(row => new { row.MoveType, row.QuantityDelta }))
        {
            if (IsAccountingOnlyMoveType(move.MoveType))
            {
                continue;
            }

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

    private static bool IsAccountingOnlyMoveType(string moveType) =>
        moveType is "ppe_issue" or "ppe_return" or "ppe_write_off" or "custody_issue" or "custody_return";

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

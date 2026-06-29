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

    private InventoryListResponseDto<InventoryHistoryDto> GetHistoryFromEvents(
        InventoryListQuery query,
        Func<IQueryable<InventoryPpeCardLineEventEntity>, IQueryable<InventoryPpeCardLineEventEntity>> filter)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = filter(dbContext.InventoryPpeCardLineEvents
            .AsNoTracking()
            .Include(row => row.Line)
                .ThenInclude(line => line.Card)
                    .ThenInclude(card => card.Employee)
            .Include(row => row.Line)
                .ThenInclude(line => line.Item));
        var total = rowsQuery.Count();
        var rowEntities = rowsQuery
            .OrderByDescending(row => row.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList();
        var rows = rowEntities
            .Select(row => new InventoryHistoryDto(
                row.Id,
                "ppe_card_line",
                row.EventType,
                BuildPpeEventDescription(row),
                row.Actor,
                row.CreatedAt.UtcDateTime,
                row.Line.Card.Employee.FullName,
                PpeLinePrintName(row.Line)))
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
            .Select(row => new InventoryHistoryDto(
                row.Id,
                "custody_record",
                ToCustodyHistoryAction(row),
                BuildCustodyEventDescription(row),
                row.Actor,
                row.CreatedAt.UtcDateTime))
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

    private static string ToCustodyHistoryAction(InventoryCustodyRecordEventEntity row) =>
        row.EventType == "status_changed" && !string.IsNullOrWhiteSpace(row.ToStatus)
            ? row.ToStatus
            : row.EventType;

    private static string BuildCustodyEventDescription(InventoryCustodyRecordEventEntity row)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(row.FromStatus) || !string.IsNullOrWhiteSpace(row.ToStatus))
        {
            parts.Add($"Статус: {row.FromStatus} -> {row.ToStatus}");
        }

        if (!string.IsNullOrWhiteSpace(row.Comment))
        {
            parts.Add($"Комментарий: {row.Comment}");
        }

        return parts.Count == 0 ? "Событие под запись" : string.Join("; ", parts);
    }

    private static string BuildPpeEventDescription(InventoryPpeCardLineEventEntity row)
    {
        var line = row.Line;
        var parts = new List<string>
        {
            $"Сотрудник: {line.Card.Employee.FullName}",
            $"СИЗ: {PpeLinePrintName(line)}",
            $"Номенклатура: {line.Item.Name}"
        };
        if (!string.IsNullOrWhiteSpace(line.BrandModelArticle))
        {
            parts.Add($"Модель/марка: {line.BrandModelArticle}");
        }

        if (!string.IsNullOrWhiteSpace(row.FromStatus) || !string.IsNullOrWhiteSpace(row.ToStatus))
        {
            parts.Add($"Статус: {PpeIssueStatusCatalog.Label(row.FromStatus)} -> {PpeIssueStatusCatalog.Label(row.ToStatus)}");
        }

        if (!string.IsNullOrWhiteSpace(row.Comment))
        {
            parts.Add($"Комментарий: {row.Comment}");
        }

        return string.Join("; ", parts);
    }

    private string BuildPpeLineLogDetails(InventoryPpeCardLineEntity line, string? details)
    {
        var item = line.Item ?? dbContext.InventoryItems.AsNoTracking().First(row => row.Id == line.ItemId);
        var employeeName = line.Card?.Employee?.FullName ?? dbContext.InventoryPpeCards
            .AsNoTracking()
            .Where(card => card.Id == line.CardId)
            .Select(card => card.Employee.FullName)
            .FirstOrDefault() ?? string.Empty;
        var parts = new List<string>
        {
            $"Сотрудник: {employeeName}",
            $"СИЗ: {PpeLinePrintName(line)}",
            $"Номенклатура: {item.Name}"
        };
        if (!string.IsNullOrWhiteSpace(line.BrandModelArticle))
        {
            parts.Add($"Модель/марка: {line.BrandModelArticle}");
        }

        if (!string.IsNullOrWhiteSpace(details))
        {
            parts.Add($"Детали: {details}");
        }

        return string.Join("; ", parts);
    }

    private static string PpeLinePrintName(InventoryPpeCardLineEntity line) =>
        string.IsNullOrWhiteSpace(line.PrintItemName)
            ? (string.IsNullOrWhiteSpace(line.Item?.NormItemName) ? line.Item?.Name ?? string.Empty : line.Item.NormItemName)
            : line.PrintItemName;

    private static string ToPpeHistoryAction(string oldStatus, string nextStatus)
    {
        if (IsPpeSignatureLineStatus(nextStatus) && !IsPpeSignatureLineStatus(oldStatus))
        {
            return "issued";
        }

        return nextStatus switch
        {
            PpeIssueStatusCatalog.Returned => "returned",
            PpeIssueStatusCatalog.WrittenOff => "written_off",
            _ => "status_changed"
        };
    }

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

    private void AddPpeLineSystemLog(InventoryPpeCardLineEntity line, string action, string? details, DateTimeOffset now) =>
        AddSystemLog("ppe_card_line", line.Id, action, BuildPpeLineLogDetails(line, details), now);

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
}

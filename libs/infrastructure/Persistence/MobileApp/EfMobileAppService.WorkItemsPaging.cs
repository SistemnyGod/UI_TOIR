using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    private sealed record WorkItemPageKey(DateTimeOffset UpdatedAt, string Kind, Guid Id);

    public MobileWorkItemPageDto? GetWorkItemsPage(string accessToken, string scope, Guid? employeeId, string? cursor, int pageSize)
    {
        if (scope is not ("active" or "history")) throw new ArgumentException("Неизвестный раздел работ.");
        if (pageSize is < 1 or > 100) throw new ArgumentException("Размер страницы должен быть от 1 до 100.");

        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null) return null;
        TouchSession(session);
        var boundEmployeeIds = GetBoundEmployeeIds(session.MobileAccount);
        var after = ParseCursor(cursor);

        var sessionKeys = dbContext.EmuWorkSessions.AsNoTracking()
            .Where(row => row.DeletedAt == null)
            .Where(row => scope == "history" ? row.CompletedAt != null : row.CompletedAt == null)
            .Where(row => scope != "history" || row.Employees.Any(employee => boundEmployeeIds.Contains(employee.EmployeeId)))
            .Where(row => employeeId == null || row.Employees.Any(employee => employee.EmployeeId == employeeId.Value))
            .Select(row => new { UpdatedAt = row.UpdatedAt, Kind = "workSession", Id = row.Id });

        var candidates = sessionKeys;
        if (scope != "history")
        {
            var planKeys = dbContext.EmuWorkPlanTasks.AsNoTracking()
                .Where(row => row.ApprovalStatus == "Согласовано" && row.Status == "Запланировано")
                .Where(row => employeeId == null || row.Employees.Any(employee => employee.EmployeeId == employeeId.Value))
                .Where(row => !dbContext.EmuWorkSessions.Any(sessionRow => sessionRow.DeletedAt == null && sessionRow.PlanTaskId == row.Id))
                .Select(row => new { UpdatedAt = row.UpdatedAt, Kind = "planTask", Id = row.Id });
            candidates = candidates.Concat(planKeys);
        }
        if (after is not null)
        {
            var cursorUpdatedAt = after.Value.UpdatedAt;
            var cursorKind = after.Value.Kind;
            var cursorId = after.Value.Id;
            if (cursorKind is not ("planTask" or "workSession"))
                throw new ArgumentException("Курсор истории работ некорректен.");
            // Keep the cursor comparison in SQL. StringComparison.Ordinal is
            // not translated consistently by PostgreSQL providers. The two
            // known kinds have a fixed order: planTask, then workSession.
            candidates = cursorKind == "planTask"
                ? candidates.Where(item => item.UpdatedAt < cursorUpdatedAt
                    || item.UpdatedAt == cursorUpdatedAt && ((item.Kind == "planTask" && item.Id.CompareTo(cursorId) > 0) || item.Kind == "workSession"))
                : candidates.Where(item => item.UpdatedAt < cursorUpdatedAt
                    || item.UpdatedAt == cursorUpdatedAt && item.Kind == "workSession" && item.Id.CompareTo(cursorId) > 0);
        }

        var keys = candidates.OrderByDescending(item => item.UpdatedAt).ThenBy(item => item.Kind).ThenBy(item => item.Id)
            .Take(pageSize + 1)
            .AsEnumerable()
            .Select(item => new WorkItemPageKey(item.UpdatedAt, item.Kind, item.Id))
            .ToArray();
        var pageKeys = keys.Take(pageSize).ToArray();
        var sessionIds = pageKeys.Where(item => item.Kind == "workSession").Select(item => item.Id).ToArray();
        var planIds = pageKeys.Where(item => item.Kind == "planTask").Select(item => item.Id).ToArray();

        var sessionRows = sessionIds.Length == 0 ? [] : dbContext.EmuWorkSessions.AsNoTracking()
            .Include(row => row.Section).Include(row => row.Employees).Where(row => sessionIds.Contains(row.Id)).ToArray();
        var attachmentsByWorkTaskId = sessionIds.Length == 0
            ? new Dictionary<Guid, IReadOnlyList<MobileUploadedFileEntity>>()
            : dbContext.MobileUploadedFiles.AsNoTracking()
                .Where(file => file.LinkedAt != null && file.MobileAccountId == session.MobileAccountId && file.WorkTaskId != null && sessionIds.Contains(file.WorkTaskId.Value))
                .AsEnumerable().GroupBy(file => file.WorkTaskId!.Value)
                .ToDictionary(group => group.Key, group => (IReadOnlyList<MobileUploadedFileEntity>)group.OrderBy(file => file.UploadedAt).ToArray());
        var planRows = planIds.Length == 0 ? [] : dbContext.EmuWorkPlanTasks.AsNoTracking()
            .Include(row => row.Section).Include(row => row.Employees).ThenInclude(row => row.Employee)
            .Where(row => planIds.Contains(row.Id)).ToArray();
        var mobilePlanTaskIds = planIds.Length == 0 ? new HashSet<Guid>() : dbContext.EmuWorkAuditEvents.AsNoTracking()
            .Where(row => row.PlanTaskId != null && planIds.Contains(row.PlanTaskId.Value) && row.Actor.StartsWith("mobile:"))
            .Select(row => row.PlanTaskId!.Value).ToHashSet();

        var itemByKey = sessionRows.Select(row => MapMobileWorkSessionItem(row, boundEmployeeIds, attachmentsByWorkTaskId.GetValueOrDefault(row.Id, [])))
            .Concat(planRows.Select(row => MapMobilePlanItem(row, boundEmployeeIds, mobilePlanTaskIds.Contains(row.Id))))
            .ToDictionary(item => (item.Kind, item.ItemId));
        IReadOnlyList<MobileWorkItemDto> items = pageKeys.Select(key => itemByKey[(key.Kind, key.Id)]).ToArray();
        var next = keys.Length > pageSize ? EncodeCursor(pageKeys[^1]) : null;
        dbContext.SaveChanges();
        return new MobileWorkItemPageDto(items, next);
    }

    private static string EncodeCursor(WorkItemPageKey item) => $"{item.UpdatedAt.UtcDateTime.Ticks}:{item.Kind}:{item.Id:D}";

    private static (DateTimeOffset UpdatedAt, string Kind, Guid Id)? ParseCursor(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return null;
        var parts = cursor.Split(':', 3);
        if (parts.Length != 3 || !long.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var ticks)
            || !Guid.TryParse(parts[2], out var id)) throw new ArgumentException("Курсор истории работ некорректен.");
        return (new DateTimeOffset(ticks, TimeSpan.Zero), parts[1], id);
    }
}

using System.Text;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfMobileAppService
{
    public MobilePatrolReportPageDto? GetPatrolReports(string accessToken, int page, int pageSize, string? cursor = null)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null) return null;
        var employees = GetBoundEmployeeIds(session.MobileAccount);
        page = Math.Clamp(page, 1, 100000);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = dbContext.Assignments.AsNoTracking().Where(item => employees.Contains(item.EmployeeId)
            && item.Status == AssignmentStatusValues.Completed);
        var total = query.Count();
        var hasCursor = !string.IsNullOrWhiteSpace(cursor);
        if (hasCursor && !TryReadCursor(cursor, out _, out _))
            throw new ArgumentException("Некорректный курсор истории отчётов.", nameof(cursor));
        if (TryReadCursor(cursor, out var cursorFinishedAt, out var cursorId))
        {
            query = query.Where(item =>
                ((item.FinishedAt ?? DateTimeOffset.MinValue) < cursorFinishedAt ||
                 ((item.FinishedAt ?? DateTimeOffset.MinValue) == cursorFinishedAt && item.Id.CompareTo(cursorId) > 0)));
        }
        var orderedQuery = query.OrderByDescending(item => item.FinishedAt ?? DateTimeOffset.MinValue).ThenBy(item => item.Id);
        var pagedQuery = !hasCursor ? orderedQuery.Skip((page - 1) * pageSize) : orderedQuery;
        var candidates = pagedQuery
            .Take(pageSize + 1)
            .Select(item => new MobilePatrolReportDto(item.Id, item.Route == null ? "" : item.Route.Name,
                item.PatrolRequest == null ? "" : item.PatrolRequest.EmployeeName, item.FinishedAt)).ToArray();
        var items = candidates.Take(pageSize).ToArray();
        return new(items, total, page, pageSize)
        {
            NextCursor = candidates.Length > pageSize
                ? WriteCursor(items[^1].CompletedAt ?? DateTimeOffset.MinValue, items[^1].AssignmentId)
                : null
        };
    }

    public IReadOnlyList<MobilePatrolReportPointDto>? GetPatrolReportPoints(string accessToken, Guid assignmentId)
    {
        var session = FindActiveSession(accessToken);
        if (session?.MobileAccount is null) return null;
        var employees = GetBoundEmployeeIds(session.MobileAccount);
        if (!dbContext.Assignments.Any(item => item.Id == assignmentId && employees.Contains(item.EmployeeId)
            && item.Status == AssignmentStatusValues.Completed)) return null;
        return dbContext.PatrolResults.AsNoTracking().Where(item => item.AssignmentId == assignmentId)
            .OrderBy(item => item.ActualAt).ThenBy(item => item.Id)
            .Select(item => new MobilePatrolReportPointDto(item.Id, item.PointName, item.Status, item.Comment, item.Photos, item.ActualAt)).ToArray();
    }

    private static bool TryReadCursor(string? cursor, out DateTimeOffset completedAt, out Guid assignmentId)
    {
        completedAt = default;
        assignmentId = default;
        if (string.IsNullOrWhiteSpace(cursor) || cursor.Length > 256) return false;
        try
        {
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|', 2);
            return parts.Length == 2
                && DateTimeOffset.TryParseExact(parts[0], "O", CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out completedAt)
                && Guid.TryParse(parts[1], out assignmentId);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static string WriteCursor(DateTimeOffset completedAt, Guid assignmentId) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes($"{completedAt:O}|{assignmentId:D}"));
}

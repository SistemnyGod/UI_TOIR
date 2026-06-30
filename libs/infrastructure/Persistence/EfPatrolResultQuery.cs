using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
using System.Text;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfPatrolResultQuery(Patrol360DbContext dbContext) : IPatrolResultQuery
{
    private const int DefaultPage = 1;
    private const int DefaultPageSize = 100;
    private const int MaxPageSize = 500;
    private const int MaxExportRows = 5000;

    public IReadOnlyList<ResultListItemDto> GetResults(ResultFilterDto filter, int page = DefaultPage, int pageSize = DefaultPageSize)
    {
        var paging = NormalizePaging(page, pageSize);
        var pageGroups = GetResultPageGroups(filter, paging);
        if (pageGroups.Count == 0)
        {
            return [];
        }

        var assignmentIds = pageGroups
            .Where(group => group.AssignmentId is not null)
            .Select(group => group.AssignmentId!.Value)
            .ToArray();
        var standaloneResultIds = pageGroups
            .Where(group => group.AssignmentId is null && group.ResultId is not null)
            .Select(group => group.ResultId!.Value)
            .ToArray();
        var groupOrder = pageGroups
            .Select((group, index) => new { Key = BuildResultGroupKey(group.AssignmentId, group.ResultId), Index = index })
            .ToDictionary(group => group.Key, group => group.Index);

        return dbContext.PatrolResults
            .AsNoTracking()
            .Include(result => result.Assignment)
            .Where(result =>
                (result.AssignmentId.HasValue && assignmentIds.Contains(result.AssignmentId.Value))
                || (!result.AssignmentId.HasValue && standaloneResultIds.Contains(result.Id)))
            .ToList()
            .OrderBy(result => groupOrder[BuildResultGroupKey(result.AssignmentId, result.Id)])
            .ThenBy(result => result.ActualAt)
            .ThenBy(result => result.Id)
            .Select(MapListItem)
            .ToList();
    }

    public ResultDetailDto? GetResult(Guid id)
    {
        var result = dbContext.PatrolResults
            .AsNoTracking()
            .Include(item => item.Issues)
            .Include(item => item.Attachments)
            .Include(item => item.Assignment)
            .FirstOrDefault(item => item.Id == id);

        return result is null ? null : MapDetail(result);
    }

    public ResultExportFileDto ExportResults(ResultFilterDto filter)
    {
        var rows = ApplyFilter(dbContext.PatrolResults.AsNoTracking(), filter)
            .OrderByDescending(result => result.ActualAt)
            .Take(MaxExportRows + 1)
            .Include(result => result.RoutePoint)
            .Include(result => result.Attachments)
            .ToList();
        var truncated = rows.Count > MaxExportRows;
        if (truncated)
        {
            rows.RemoveAt(rows.Count - 1);
        }

        var builder = new StringBuilder();
        builder.AppendLine("AssignmentId;Status;Point;Employee;Route;Territory;Shift;PlannedAt;ActualAt;Deviation;Photos;IssueType;Severity;Comment;RoutePointId;RoutePointSequence;RoutePointType;NfcCode;RequiresPhoto;PhotoStatus;AttachmentCount");

        foreach (var row in rows)
        {
            var attachmentCount = row.Attachments.Count;
            var photoCount = Math.Max(row.Photos, attachmentCount);
            var requiresPhoto = row.RoutePoint?.RequiresPhoto ?? false;
            builder.AppendLine(string.Join(';', [
                EscapeCsv(row.AssignmentId?.ToString() ?? string.Empty),
                EscapeCsv(row.Status),
                EscapeCsv(row.PointName),
                EscapeCsv(row.EmployeeName),
                EscapeCsv(row.RouteName),
                EscapeCsv(row.Territory),
                EscapeCsv(row.Shift),
                EscapeCsv(row.PlannedAt.ToString("O")),
                EscapeCsv(row.ActualAt.ToString("O")),
                EscapeCsv(row.Deviation),
                photoCount.ToString(),
                EscapeCsv(row.IssueType),
                EscapeCsv(row.Severity),
                EscapeCsv(row.Comment),
                EscapeCsv(row.RoutePointId?.ToString() ?? string.Empty),
                row.RoutePoint?.SequenceNo.ToString() ?? string.Empty,
                EscapeCsv(row.RoutePoint?.Type ?? string.Empty),
                EscapeCsv(row.RoutePoint?.NfcCode ?? row.RoutePoint?.Tag ?? string.Empty),
                requiresPhoto ? "true" : "false",
                EscapeCsv(GetPhotoStatus(requiresPhoto, photoCount)),
                attachmentCount.ToString()
            ]));
        }

        var fileName = $"patrol-results-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.csv";
        return new ResultExportFileDto(
            Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(builder.ToString())).ToArray(),
            "text/csv; charset=utf-8",
            fileName,
            truncated,
            rows.Count,
            MaxExportRows);
    }

    public ResultAttachmentFileDto? GetAttachmentFile(Guid resultId, Guid attachmentId)
    {
        var attachment = dbContext.PatrolResultAttachments
            .AsNoTracking()
            .FirstOrDefault(item => item.PatrolResultId == resultId && item.Id == attachmentId);

        if (attachment is null)
        {
            return null;
        }

        var safeFileName = Path.GetFileName(attachment.FileName);
        if (string.IsNullOrWhiteSpace(safeFileName))
        {
            return null;
        }

        var storageDirectory = Path.Combine(AppContext.BaseDirectory, "mobile-files");
        var fullPath = Path.GetFullPath(Path.Combine(storageDirectory, safeFileName));
        var storageRoot = Path.GetFullPath(storageDirectory);
        if (!fullPath.StartsWith(storageRoot, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
        {
            return null;
        }

        var contentType = string.IsNullOrWhiteSpace(attachment.ContentType)
            ? "application/octet-stream"
            : attachment.ContentType;

        return new ResultAttachmentFileDto(fullPath, contentType, safeFileName);
    }

    private static IQueryable<PatrolResultEntity> ApplyFilter(
        IQueryable<PatrolResultEntity> query,
        ResultFilterDto filter)
    {
        if (!string.IsNullOrWhiteSpace(filter.Status))
        {
            var statusValues = GetStatusFilterValues(filter.Status);
            query = query.Where(result => statusValues.Contains(result.Status));
        }

        if (filter.RouteId is not null)
        {
            query = query.Where(result => result.RouteId == filter.RouteId.Value);
        }

        if (filter.EmployeeId is not null)
        {
            query = query.Where(result => result.EmployeeId == filter.EmployeeId.Value);
        }

        if (filter.DateFrom is not null)
        {
            var from = new DateTimeOffset(filter.DateFrom.Value.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            query = query.Where(result => result.ActualAt >= from);
        }

        if (filter.DateTo is not null)
        {
            var to = new DateTimeOffset(filter.DateTo.Value.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            query = query.Where(result => result.ActualAt < to);
        }

        if (filter.AssignmentId is not null)
        {
            query = query.Where(result => result.AssignmentId == filter.AssignmentId.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter.Query))
        {
            var search = filter.Query.Trim().ToLowerInvariant();
            query = query.Where(result =>
                (result.PointName ?? string.Empty).ToLower().Contains(search)
                || (result.EmployeeName ?? string.Empty).ToLower().Contains(search)
                || (result.RouteName ?? string.Empty).ToLower().Contains(search)
                || (result.Territory ?? string.Empty).ToLower().Contains(search)
                || (result.Shift ?? string.Empty).ToLower().Contains(search)
                || (result.Comment ?? string.Empty).ToLower().Contains(search)
                || (result.IssueType ?? string.Empty).ToLower().Contains(search)
                || (result.Severity ?? string.Empty).ToLower().Contains(search));
        }

        if (filter.HasPhotos is true)
        {
            query = query.Where(result => result.Photos > 0 || result.Attachments.Any());
        }
        else if (filter.HasPhotos is false)
        {
            query = query.Where(result => result.Photos == 0 && !result.Attachments.Any());
        }

        return query;
    }

    private static string BuildResultFilterSql(ResultFilterDto filter, List<object> parameters)
    {
        var where = new StringBuilder("WHERE TRUE");

        if (!string.IsNullOrWhiteSpace(filter.Status))
        {
            var statusValues = GetStatusFilterValues(filter.Status)
                .Select(value => AddSqlParameter(parameters, value));
            where.Append(" AND status IN (").Append(string.Join(", ", statusValues)).Append(')');
        }

        if (filter.RouteId is not null)
        {
            where.Append(" AND route_id = ").Append(AddSqlParameter(parameters, filter.RouteId.Value));
        }

        if (filter.EmployeeId is not null)
        {
            where.Append(" AND employee_id = ").Append(AddSqlParameter(parameters, filter.EmployeeId.Value));
        }

        if (filter.DateFrom is not null)
        {
            var from = new DateTimeOffset(filter.DateFrom.Value.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            where.Append(" AND actual_at >= ").Append(AddSqlParameter(parameters, from));
        }

        if (filter.DateTo is not null)
        {
            var to = new DateTimeOffset(filter.DateTo.Value.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            where.Append(" AND actual_at < ").Append(AddSqlParameter(parameters, to));
        }

        if (filter.AssignmentId is not null)
        {
            where.Append(" AND assignment_id = ").Append(AddSqlParameter(parameters, filter.AssignmentId.Value));
        }

        if (!string.IsNullOrWhiteSpace(filter.Query))
        {
            var search = $"%{filter.Query.Trim().ToLowerInvariant()}%";
            var parameter = AddSqlParameter(parameters, search);
            where
                .Append(" AND (LOWER(COALESCE(point_name, '')) LIKE ").Append(parameter)
                .Append(" OR LOWER(COALESCE(employee_name, '')) LIKE ").Append(parameter)
                .Append(" OR LOWER(COALESCE(route_name, '')) LIKE ").Append(parameter)
                .Append(" OR LOWER(COALESCE(territory, '')) LIKE ").Append(parameter)
                .Append(" OR LOWER(COALESCE(shift, '')) LIKE ").Append(parameter)
                .Append(" OR LOWER(COALESCE(comment, '')) LIKE ").Append(parameter)
                .Append(" OR LOWER(COALESCE(issue_type, '')) LIKE ").Append(parameter)
                .Append(" OR LOWER(COALESCE(severity, '')) LIKE ").Append(parameter)
                .Append(')');
        }

        return where.ToString();
    }

    private static string AddSqlParameter(List<object> parameters, object value)
    {
        parameters.Add(value);
        return "{" + (parameters.Count - 1) + "}";
    }

    private static IReadOnlyList<string> GetStatusFilterValues(string status)
    {
        var value = status.Trim();
        if (value.Equals("issue", StringComparison.OrdinalIgnoreCase)
            || value.Contains("Замеч", StringComparison.OrdinalIgnoreCase))
        {
            return ["issue", "Замечание"];
        }

        if (value.Equals("late", StringComparison.OrdinalIgnoreCase)
            || value.Contains("Просроч", StringComparison.OrdinalIgnoreCase))
        {
            return ["late", "Просрочено"];
        }

        if (value.Equals("ok", StringComparison.OrdinalIgnoreCase)
            || value.Equals("completed", StringComparison.OrdinalIgnoreCase)
            || value.Equals("confirmed", StringComparison.OrdinalIgnoreCase)
            || value.Contains("Подтвержден", StringComparison.OrdinalIgnoreCase))
        {
            return ["ok", "Подтверждено"];
        }

        if (value.Equals("unconfirmed", StringComparison.OrdinalIgnoreCase)
            || value.Contains("Не подтвержден", StringComparison.OrdinalIgnoreCase))
        {
            return ["unconfirmed", "Не подтверждено"];
        }

        if (value.Equals("skipped", StringComparison.OrdinalIgnoreCase))
        {
            return ["skipped"];
        }

        if (value.Equals("manual", StringComparison.OrdinalIgnoreCase))
        {
            return ["manual"];
        }

        return [value];
    }

    private IReadOnlyList<ResultPageGroup> GetResultPageGroups(
        ResultFilterDto filter,
        PatrolPaging paging)
    {
        var parameters = new List<object>();
        var whereClause = BuildResultFilterSql(filter, parameters);
        var assignmentPhotoFilter = BuildAssignmentPhotoFilterSql(filter);
        var standalonePhotoFilter = BuildStandalonePhotoFilterSql(filter);
        var offset = AddSqlParameter(parameters, (paging.Page - 1) * paging.PageSize);
        var limit = AddSqlParameter(parameters, paging.PageSize);
        var sql = $"""
            WITH filtered AS (
                SELECT assignment_id, id, actual_at, photos
                FROM patrol_results
                {whereClause}
            ),
            page_groups AS (
                SELECT
                    assignment_id AS "AssignmentId",
                    NULL::uuid AS "ResultId",
                    MAX(actual_at) AS "LastActualAt",
                    assignment_id AS "SortId"
                FROM filtered
                WHERE assignment_id IS NOT NULL
                GROUP BY assignment_id
                {assignmentPhotoFilter}
                UNION ALL
                SELECT
                    NULL::uuid AS "AssignmentId",
                    id AS "ResultId",
                    actual_at AS "LastActualAt",
                    id AS "SortId"
                FROM filtered
                WHERE assignment_id IS NULL
                {standalonePhotoFilter}
            )
            SELECT "AssignmentId", "ResultId", "LastActualAt"
            FROM page_groups
            ORDER BY "LastActualAt" DESC, "SortId" DESC
            OFFSET {offset}
            LIMIT {limit}
            """;

        return dbContext.Database
            .SqlQueryRaw<ResultPageGroup>(sql, parameters.ToArray())
            .ToList();
    }

    private static string BuildAssignmentPhotoFilterSql(ResultFilterDto filter) =>
        filter.HasPhotos switch
        {
            true => "HAVING SUM(CASE WHEN photos > 0 THEN 1 ELSE 0 END) > 0",
            false => "HAVING COALESCE(SUM(photos), 0) = 0",
            _ => string.Empty
        };

    private static string BuildStandalonePhotoFilterSql(ResultFilterDto filter) =>
        filter.HasPhotos switch
        {
            true => "AND photos > 0",
            false => "AND photos = 0",
            _ => string.Empty
        };

    private static ResultListItemDto MapListItem(PatrolResultEntity result) =>
        new(
            result.Id,
            result.AssignmentId,
            result.Status,
            result.RoutePointId,
            result.PointName,
            result.EmployeeId,
            result.EmployeeName,
            result.RouteId,
            result.RouteName,
            result.Territory,
            result.Shift,
            result.PlannedAt,
            result.ActualAt,
            result.Assignment?.StartedAt,
            result.Assignment?.FinishedAt,
            result.Deviation,
            result.Comment,
            result.Photos,
            result.IssueType,
            result.Severity);

    private static ResultDetailDto MapDetail(PatrolResultEntity result)
    {
        var issues = result.Issues
            .OrderBy(issue => issue.CreatedAt)
            .Select(issue => new IssueDto(issue.Id, issue.Type, issue.Severity, issue.Message, issue.CreatedAt))
            .ToList();
        var attachments = result.Attachments
            .OrderBy(attachment => attachment.CreatedAt)
            .Select(attachment => new AttachmentMetadataDto(
                attachment.Id,
                attachment.FileName,
                attachment.ContentType,
                attachment.SizeBytes,
                attachment.CreatedAt))
            .ToList();

        var chronology = new List<string>
        {
            $"Плановое время: {result.PlannedAt:dd.MM.yyyy HH:mm}",
            $"Фактическое время: {result.ActualAt:dd.MM.yyyy HH:mm}",
            result.Comment
        };

        chronology.AddRange(issues.Select(issue => issue.Message));

        return new ResultDetailDto(
            result.Id,
            result.AssignmentId,
            result.Status,
            result.RoutePointId,
            result.PointName,
            result.EmployeeId,
            result.EmployeeName,
            result.RouteId,
            result.RouteName,
            result.Territory,
            result.Shift,
            result.PlannedAt,
            result.ActualAt,
            result.Assignment?.StartedAt,
            result.Assignment?.FinishedAt,
            result.Deviation,
            result.Comment,
            Math.Max(result.Photos, attachments.Count),
            result.IssueType,
            result.Severity,
            issues,
            attachments,
            chronology);
    }

    private static string EscapeCsv(string value) =>
        $"\"{value.Replace("\"", "\"\"")}\"";

    private static string GetPhotoStatus(bool requiresPhoto, int photoCount)
    {
        if (photoCount > 0)
        {
            return requiresPhoto ? "provided" : "attached";
        }

        return requiresPhoto ? "missing" : "not_required";
    }

    private static PatrolPaging NormalizePaging(int page, int pageSize)
    {
        var normalizedPageSize = pageSize <= 0 ? DefaultPageSize : Math.Min(pageSize, MaxPageSize);
        var maxPage = Math.Max(DefaultPage, int.MaxValue / normalizedPageSize);
        var normalizedPage = page <= 0 ? DefaultPage : Math.Min(page, maxPage);
        return new PatrolPaging(normalizedPage, normalizedPageSize);
    }

    private sealed record PatrolPaging(int Page, int PageSize);

    private sealed class ResultPageGroup
    {
        public Guid? AssignmentId { get; set; }

        public Guid? ResultId { get; set; }

        public DateTimeOffset LastActualAt { get; set; }
    }

    private static string BuildResultGroupKey(Guid? assignmentId, Guid? resultId) =>
        (assignmentId ?? resultId ?? Guid.Empty).ToString("N");
}

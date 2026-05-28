using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;
using System.Text;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfPatrolResultQuery(Patrol360DbContext dbContext) : IPatrolResultQuery
{
    public IReadOnlyList<ResultListItemDto> GetResults(ResultFilterDto filter)
    {
        var query = ApplyFilter(dbContext.PatrolResults.AsNoTracking(), filter);

        return query
            .OrderByDescending(result => result.ActualAt)
            .Select(result => new ResultListItemDto(
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
                result.Deviation,
                result.Comment,
                result.Photos,
                result.IssueType,
                result.Severity))
            .ToList();
    }

    public ResultDetailDto? GetResult(Guid id)
    {
        var result = dbContext.PatrolResults
            .AsNoTracking()
            .Include(item => item.Issues)
            .Include(item => item.Attachments)
            .FirstOrDefault(item => item.Id == id);

        return result is null ? null : MapDetail(result);
    }

    public ResultExportFileDto ExportResults(ResultFilterDto filter)
    {
        var rows = GetResults(filter);
        var builder = new StringBuilder();
        builder.AppendLine("AssignmentId;Status;Point;Employee;Route;Territory;Shift;PlannedAt;ActualAt;Deviation;Photos;IssueType;Severity;Comment");

        foreach (var row in rows)
        {
            builder.AppendLine(string.Join(';', [
                EscapeCsv(row.AssignmentId?.ToString() ?? string.Empty),
                EscapeCsv(row.Status),
                EscapeCsv(row.Point),
                EscapeCsv(row.Employee),
                EscapeCsv(row.Route),
                EscapeCsv(row.Territory),
                EscapeCsv(row.Shift),
                EscapeCsv(row.PlannedAt.ToString("O")),
                EscapeCsv(row.ActualAt.ToString("O")),
                EscapeCsv(row.Deviation),
                row.Photos.ToString(),
                EscapeCsv(row.IssueType),
                EscapeCsv(row.Severity),
                EscapeCsv(row.Comment)
            ]));
        }

        var fileName = $"patrol-results-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.csv";
        return new ResultExportFileDto(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(builder.ToString())).ToArray(), "text/csv; charset=utf-8", fileName);
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
            query = query.Where(result => result.Status == filter.Status);
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

        return query;
    }

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
}

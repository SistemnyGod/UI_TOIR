using System.Data;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService
{
    // Filter immutable snapshot fields in PostgreSQL: later employee edits must not rewrite history.
    private IQueryable<PpeIssueDocumentEntity> JournalQuery(PpeIssueJournalQuery filter)
    {
        var employeeId = filter.EmployeeId ?? Guid.Empty;
        var hasEmployee = filter.EmployeeId.HasValue;
        var search = (filter.Query ?? "").Trim();
        var department = filter.Department ?? "";
        var from = filter.From?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "";
        var to = filter.To?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "";
        var query = dbContext.Set<PpeIssueDocumentEntity>().FromSqlInterpolated($"""
            SELECT * FROM inventory.ppe_issue_documents
            WHERE (NOT {hasEmployee} OR employee_id = {employeeId})
              AND ({search} = '' OR strpos(lower(concat(content_json->'employee'->>'fullName', ' ', content_json->'employee'->>'personnelNo')), lower({search})) > 0)
              AND ({department} = '' OR content_json->'employee'->>'department' = {department})
              AND ({from} = '' OR content_json->>'documentDate' >= {from})
              AND ({to} = '' OR content_json->>'documentDate' <= {to})
            """).AsNoTracking();
        if (filter.Status == "overdue")
        {
            var overdue = OverdueDocumentIds();
            query = query.Where(x => x.Status == "confirmed" && overdue.Contains(x.Id));
        }
        else if (!string.IsNullOrWhiteSpace(filter.Status)) query = query.Where(x => x.Status == filter.Status);
        return query;
    }

    private IQueryable<Guid> OverdueDocumentIds()
    {
        var now = DateTimeOffset.UtcNow;
        return dbContext.InventoryPpeCardLines.AsNoTracking()
            .Where(x => x.IssueDocumentId.HasValue && x.DueAt < now
                && (x.Status == "issued" || x.Status == "reissued" || x.Status == "replacement"
                    || (x.Status == "returned" && x.ReturnedQuantity.HasValue && x.ReturnedQuantity < x.Quantity))
                && (x.ReturnedQuantity ?? 0) < x.Quantity)
            .Select(x => x.IssueDocumentId!.Value).Distinct();
    }

    public PpeIssueJournalPage GetIssueJournal(PpeIssueJournalQuery filter)
    {
        using var transaction = dbContext.Database.BeginTransaction(IsolationLevel.RepeatableRead);
        var query = JournalQuery(filter);
        var overdue = OverdueDocumentIds();
        var counts = query.GroupBy(x => 1).Select(group => new PpeIssueJournalSummary(
            group.Count(), group.Count(x => x.Status == "confirmed"), group.Count(x => x.Status == "draft"),
            group.Count(x => x.Status == "cancelled"), group.Count(x => x.Status == "confirmed" && overdue.Contains(x.Id))))
            .SingleOrDefault() ?? new(0, 0, 0, 0, 0);
        var size = Math.Clamp(filter.PageSize, 1, 100);
        var pages = Math.Max(1, (int)Math.Ceiling((double)counts.Total / size));
        var page = Math.Clamp(filter.Page, 1, pages);
        var documents = query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Skip((page - 1) * size).Take(size).ToList();
        var items = JournalSummaries(documents);
        var departments = dbContext.Database.SqlQuery<string>($"""
            SELECT DISTINCT content_json->'employee'->>'department' AS "Value"
            FROM inventory.ppe_issue_documents
            WHERE coalesce(content_json->'employee'->>'department', '') <> ''
            """).OrderBy(x => x).ToList();
        transaction.Commit();
        return new(items, counts.Total, page, size, pages, counts, departments);
    }

    private IReadOnlyList<PpeIssueDocumentSummaryDto> JournalSummaries(IReadOnlyList<PpeIssueDocumentEntity> documents)
    {
        var ids = documents.Select(x => x.Id).ToArray();
        var overdue = ids.Length == 0 ? [] : OverdueDocumentIds().Where(x => ids.Contains(x)).ToHashSet();
        return documents.Select(x =>
        {
            var content = ReadDocument(x);
            var validation = JsonSerializer.Deserialize<PpeDocumentValidationDto>(x.ValidationJson, DocumentJson)!;
            return new PpeIssueDocumentSummaryDto(x.Id, x.Version, x.Status, x.EmployeeId,
                content.Employee.FullName, content.DocumentDate, content.Lines.Count, validation.TotalMinor,
                content.Employee.Department, content.Employee.PersonnelNo, x.Status == "confirmed" && overdue.Contains(x.Id));
        }).ToList();
    }

    public InventoryGeneratedFileDto ExportIssueJournal(PpeIssueJournalQuery filter)
    {
        using var transaction = dbContext.Database.BeginTransaction(IsolationLevel.RepeatableRead);
        var query = JournalQuery(filter).OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id);
        var csv = new StringBuilder("\uFEFFСотрудник;Табельный номер;Подразделение;Дата;Статус;Позиций;Стоимость;Просрочка\r\n");
        // Bounded batches: export every matching document without loading all snapshots together.
        for (var offset = 0; ; offset += 500)
        {
            var documents = query.Skip(offset).Take(500).ToList();
            if (documents.Count == 0) break;
            foreach (var row in JournalSummaries(documents))
                csv.AppendLine(string.Join(";", new[] { row.EmployeeName, row.PersonnelNo, row.Department,
                    row.DocumentDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    row.Status == "confirmed" ? "Выдано" : row.Status == "draft" ? "Выдаётся" : "Отменено",
                    row.LinesCount.ToString(CultureInfo.InvariantCulture),
                    row.TotalMinor.HasValue ? (row.TotalMinor.Value / 100m).ToString(CultureInfo.InvariantCulture) : "",
                    row.HasOverdue ? "Да" : "Нет" }.Select(CsvCell)));
        }
        transaction.Commit();
        return new("ppe-issues.csv", "text/csv;charset=utf-8", Encoding.UTF8.GetBytes(csv.ToString()));
    }

    private static string CsvCell(string value)
    {
        if (value.TrimStart().StartsWith('=') || value.TrimStart().StartsWith('+')
            || value.TrimStart().StartsWith('-') || value.TrimStart().StartsWith('@')
            || value.StartsWith('\t') || value.StartsWith('\r')) value = "'" + value;
        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }
}

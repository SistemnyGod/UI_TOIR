namespace Patrol360.Contracts;

public sealed record PpeIssueJournalQuery(
    Guid? EmployeeId = null, string? Query = null, string? Department = null,
    DateOnly? From = null, DateOnly? To = null, string? Status = null,
    int Page = 1, int PageSize = 10);

public sealed record PpeIssueJournalSummary(int Total, int Confirmed, int Draft, int Cancelled, int Overdue);
public sealed record PpeIssueJournalPage(
    IReadOnlyList<PpeIssueDocumentSummaryDto> Items, int Total, int Page, int PageSize, int PageCount,
    PpeIssueJournalSummary Summary, IReadOnlyList<string> Departments);

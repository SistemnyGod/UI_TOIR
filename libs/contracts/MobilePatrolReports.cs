namespace Patrol360.Contracts;

public sealed record MobilePatrolReportDto(Guid AssignmentId, string RouteName, string EmployeeName, DateTimeOffset? CompletedAt);
public sealed record MobilePatrolReportPageDto(IReadOnlyList<MobilePatrolReportDto> Items, int Total, int Page, int PageSize)
{
    // Opaque cursor for a stable next page. Page fields remain for older mobile clients.
    public string? NextCursor { get; init; }
}
public sealed record MobilePatrolReportPointDto(Guid Id, string PointName, string Status, string Comment, int Photos, DateTimeOffset ActualAt);

namespace Patrol360.Contracts;

public sealed record DashboardSummaryDto(
    int ActivePatrols,
    int DelayedPatrols,
    int Issues,
    int CompletedToday,
    int ShiftCoveragePercent,
    int CompletedPoints,
    int TotalPoints,
    int OnlineEmployees,
    int TotalEmployees);

public sealed record AssignmentDto(
    Guid Id,
    Guid PatrolRequestId,
    Guid EmployeeId,
    string EmployeeName,
    Guid RouteId,
    string RouteName,
    string Shift,
    string Status,
    DateTimeOffset PlannedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    int ProgressPercent,
    string Eta);

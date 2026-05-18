namespace Patrol360.Contracts;

public sealed record DashboardSummaryDto(
    int ActivePatrols,
    int DelayedPatrols,
    int Issues,
    int ShiftCoveragePercent,
    int CompletedPoints,
    int TotalPoints,
    int OnlineEmployees,
    int TotalEmployees);

public sealed record AssignmentDto(
    Guid Id,
    string EmployeeName,
    string RouteName,
    string Shift,
    string Status,
    int ProgressPercent,
    string Eta);

namespace Patrol360.Domain;

public enum ShiftType
{
    Day = 1,
    Night = 2
}

public enum PatrolAssignmentStatus
{
    Planned = 1,
    Active = 2,
    Delayed = 3,
    Completed = 4,
    Cancelled = 5
}

public sealed record PatrolAssignment(
    Guid Id,
    Guid RouteId,
    Guid RouteVersionId,
    Guid EmployeeId,
    string EmployeeName,
    ShiftType Shift,
    PatrolAssignmentStatus Status,
    DateTimeOffset PlannedAt,
    int ProgressPercent);

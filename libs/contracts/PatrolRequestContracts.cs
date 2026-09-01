namespace Patrol360.Contracts;

public sealed record CreatePatrolRequestDto(
    Guid? EmployeeId,
    string? EmployeeName,
    Guid? RouteId,
    string? RouteName,
    Guid? SourceResultId,
    DateOnly ScheduledDate,
    TimeOnly? ScheduledTime,
    string? Shift,
    bool NotifyEmployee,
    string? NotificationText,
    string? Description,
    DateTimeOffset? PlannedAt = null);

public sealed record PatrolRequestDto(
    Guid Id,
    string Number,
    Guid? EmployeeId,
    string EmployeeName,
    Guid? RouteId,
    string RouteName,
    Guid? SourceResultId,
    DateOnly ScheduledDate,
    TimeOnly? ScheduledTime,
    bool NotifyEmployee,
    string NotificationText,
    string Status,
    DateTimeOffset CreatedAt,
    string Description,
    Guid? AssignmentId = null,
    string? CancellationReasonCode = null,
    string? CancellationReasonText = null,
    DateTimeOffset? CancelledAt = null,
    Guid? CancelledByUserId = null,
    string? CancelledByUserName = null,
    Guid? ResultId = null);

public sealed record CancelAssignmentDto(
    string? ReasonCode,
    string? ReasonText,
    long? ExpectedVersion = null);

public sealed record PatrolRequestFilterDto(
    Guid? EmployeeId = null,
    Guid? RouteId = null,
    string? Status = null,
    DateOnly? DateFrom = null,
    DateOnly? DateTo = null,
    string? Query = null);

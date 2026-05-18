namespace Patrol360.Contracts;

public sealed record CreatePatrolRequestDto(
    Guid? EmployeeId,
    string? EmployeeName,
    Guid? RouteId,
    string? RouteName,
    DateOnly ScheduledDate,
    TimeOnly? ScheduledTime,
    bool NotifyEmployee,
    string? NotificationText,
    string? Description);

public sealed record PatrolRequestDto(
    Guid Id,
    string Number,
    Guid? EmployeeId,
    string EmployeeName,
    Guid? RouteId,
    string RouteName,
    DateOnly ScheduledDate,
    TimeOnly? ScheduledTime,
    bool NotifyEmployee,
    string NotificationText,
    string Status,
    DateTimeOffset CreatedAt,
    string Description);

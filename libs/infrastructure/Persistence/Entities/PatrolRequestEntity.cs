namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class PatrolRequestEntity
{
    public Guid Id { get; set; }

    public string Number { get; set; } = string.Empty;

    public Guid? EmployeeId { get; set; }

    public string EmployeeName { get; set; } = string.Empty;

    public Guid? RouteId { get; set; }

    public string RouteName { get; set; } = string.Empty;

    public Guid? SourceResultId { get; set; }

    public DateOnly ScheduledDate { get; set; }

    public TimeOnly? ScheduledTime { get; set; }

    public bool NotifyEmployee { get; set; }

    public string NotificationText { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string? StatusCode { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public string Description { get; set; } = string.Empty;

    public EmployeeEntity? Employee { get; set; }

    public RouteEntity? Route { get; set; }

    public PatrolResultEntity? SourceResult { get; set; }

    public AssignmentEntity? Assignment { get; set; }
}

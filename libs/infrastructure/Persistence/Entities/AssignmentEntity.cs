namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class AssignmentEntity
{
    public Guid Id { get; set; }

    public Guid PatrolRequestId { get; set; }

    public Guid RouteId { get; set; }

    public Guid EmployeeId { get; set; }

    public string Shift { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public DateTimeOffset PlannedAt { get; set; }

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }

    public int ProgressPercent { get; set; }

    public long LockVersion { get; set; }

    public PatrolRequestEntity? PatrolRequest { get; set; }

    public RouteEntity? Route { get; set; }

    public EmployeeEntity? Employee { get; set; }
}

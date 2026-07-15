namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class PatrolResultEntity
{
    public Guid Id { get; set; }

    public Guid? AssignmentId { get; set; }

    public Guid? RouteId { get; set; }

    public Guid? EmployeeId { get; set; }

    public Guid? RoutePointId { get; set; }

    public string Status { get; set; } = string.Empty;

    public string? StatusCode { get; set; }

    public string PointName { get; set; } = string.Empty;

    public string EmployeeName { get; set; } = string.Empty;

    public string RouteName { get; set; } = string.Empty;

    public string Territory { get; set; } = string.Empty;

    public string Shift { get; set; } = string.Empty;

    public DateTimeOffset PlannedAt { get; set; }

    public DateTimeOffset ActualAt { get; set; }

    public string Deviation { get; set; } = string.Empty;

    public string Comment { get; set; } = string.Empty;

    public string IssueType { get; set; } = string.Empty;

    public string Severity { get; set; } = string.Empty;

    public int Photos { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public AssignmentEntity? Assignment { get; set; }

    public RouteEntity? Route { get; set; }

    public EmployeeEntity? Employee { get; set; }

    public RoutePointEntity? RoutePoint { get; set; }

    public ICollection<PatrolResultIssueEntity> Issues { get; } = new List<PatrolResultIssueEntity>();

    public ICollection<PatrolResultAttachmentEntity> Attachments { get; } = new List<PatrolResultAttachmentEntity>();
}

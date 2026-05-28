namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class EmployeeEntity
{
    public Guid Id { get; set; }

    public string FullName { get; set; } = string.Empty;

    public string PersonnelNo { get; set; } = string.Empty;

    public string Position { get; set; } = string.Empty;

    public string Department { get; set; } = string.Empty;

    public string EmployeeGroup { get; set; } = string.Empty;

    public DateOnly? HiredAt { get; set; }

    public DateOnly? BirthDate { get; set; }

    public string Status { get; set; } = string.Empty;

    public string Shift { get; set; } = string.Empty;

    public bool HasMobileAccount { get; set; }

    public DateTimeOffset LastSeenAt { get; set; }

    public List<PatrolRequestEntity> PatrolRequests { get; set; } = [];

    public List<AssignmentEntity> Assignments { get; set; } = [];
}

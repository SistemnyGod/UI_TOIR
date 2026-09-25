namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobilePatrolAppealEntity
{
    public Guid Id { get; set; }
    public Guid MobileAccountId { get; set; }
    public Guid AssignmentId { get; set; }
    public string DeviceId { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Message { get; set; } = "";
    public string Status { get; set; } = "open";
    public string Reply { get; set; } = "";
    public string ResolvedBy { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
    public long Version { get; set; }
    public AssignmentEntity? Assignment { get; set; }
}

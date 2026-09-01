namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class PatrolRequestHistoryEventEntity
{
    public Guid Id { get; set; }

    public Guid PatrolRequestId { get; set; }

    public string EventType { get; set; } = string.Empty;

    public string FromStatus { get; set; } = string.Empty;

    public string ToStatus { get; set; } = string.Empty;

    public string Details { get; set; } = string.Empty;

    public Guid? ActorUserId { get; set; }

    public string ActorName { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public PatrolRequestEntity? PatrolRequest { get; set; }
}

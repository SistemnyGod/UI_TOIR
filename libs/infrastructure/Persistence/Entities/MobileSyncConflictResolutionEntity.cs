namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileSyncConflictResolutionEntity
{
    public Guid MobileAccountId { get; set; }

    public string ClientOperationId { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string Comment { get; set; } = string.Empty;

    public string ResolvedBy { get; set; } = string.Empty;

    public DateTimeOffset ResolvedAt { get; set; }

    public MobileOutboxOperationEntity? Operation { get; set; }
}

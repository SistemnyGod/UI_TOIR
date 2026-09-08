namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileDeviceEntity
{
    public string DeviceId { get; set; } = string.Empty;

    public Guid MobileAccountId { get; set; }

    public MobileAccountEntity? MobileAccount { get; set; }

    public bool Trusted { get; set; } = true;

    public DateTimeOffset? BlockedAt { get; set; }

    public string BlockReason { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public DateTimeOffset LastSeenAt { get; set; }
}

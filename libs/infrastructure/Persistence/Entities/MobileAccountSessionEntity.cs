namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileAccountSessionEntity
{
    public Guid Id { get; set; }

    public Guid MobileAccountId { get; set; }

    public MobileAccountEntity? MobileAccount { get; set; }

    public string Status { get; set; } = string.Empty;

    public string Device { get; set; } = string.Empty;

    public string Platform { get; set; } = string.Empty;

    public string AppVersion { get; set; } = string.Empty;

    public string IpAddress { get; set; } = string.Empty;

    public DateTimeOffset LastSeenAt { get; set; }
}

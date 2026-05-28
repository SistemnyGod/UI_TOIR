namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileAccountSessionEntity
{
    public Guid Id { get; set; }

    public Guid MobileAccountId { get; set; }

    public MobileAccountEntity? MobileAccount { get; set; }

    public string Status { get; set; } = string.Empty;

    public string DeviceId { get; set; } = string.Empty;

    public string Device { get; set; } = string.Empty;

    public string Platform { get; set; } = string.Empty;

    public string AppVersion { get; set; } = string.Empty;

    public string IpAddress { get; set; } = string.Empty;

    public string PushToken { get; set; } = string.Empty;

    public DateTimeOffset? PushTokenRegisteredAt { get; set; }

    public DateTimeOffset? PushTokenRevokedAt { get; set; }

    public string TokenHash { get; set; } = string.Empty;

    public string RefreshTokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset RefreshExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public DateTimeOffset LastSeenAt { get; set; }
}

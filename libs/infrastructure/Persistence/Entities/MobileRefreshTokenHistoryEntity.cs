namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileRefreshTokenHistoryEntity
{
    public Guid Id { get; set; }

    public Guid MobileAccountSessionId { get; set; }

    public MobileAccountSessionEntity? MobileAccountSession { get; set; }

    public string TokenHash { get; set; } = string.Empty;

    public int Generation { get; set; }

    public DateTimeOffset RotatedAt { get; set; }

    public DateTimeOffset ReplayValidUntil { get; set; }
}
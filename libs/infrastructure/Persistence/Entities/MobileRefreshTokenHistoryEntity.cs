namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileRefreshTokenHistoryEntity
{
    public Guid Id { get; set; }

    public Guid MobileAccountSessionId { get; set; }

    public MobileAccountSessionEntity? MobileAccountSession { get; set; }

    public string TokenHash { get; set; } = string.Empty;

    public int Generation { get; set; }

    public DateTimeOffset RotatedAt { get; set; }

    // Stable client id lets a request whose response was lost be replayed safely.
    public string? ClientOperationId { get; set; }

    public string? AccessTokenProtected { get; set; }

    public string? RefreshTokenProtected { get; set; }

    public DateTimeOffset? AccessTokenExpiresAt { get; set; }

    public DateTimeOffset? RefreshTokenExpiresAt { get; set; }

    public DateTimeOffset ReplayValidUntil { get; set; }
}
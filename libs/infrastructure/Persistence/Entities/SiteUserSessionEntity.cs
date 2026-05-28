namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class SiteUserSessionEntity
{
    public Guid Id { get; set; }

    public Guid SiteUserId { get; set; }

    public SiteUserEntity SiteUser { get; set; } = null!;

    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }
}

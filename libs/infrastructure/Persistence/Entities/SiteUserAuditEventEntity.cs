namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class SiteUserAuditEventEntity
{
    public Guid Id { get; set; }

    public Guid SiteUserId { get; set; }

    public SiteUserEntity SiteUser { get; set; } = null!;

    public Guid? ActorUserId { get; set; }

    public string? ActorName { get; set; }

    public string EventType { get; set; } = string.Empty;

    public string? ModuleKey { get; set; }

    public string Details { get; set; } = string.Empty;

    public string? BeforeJson { get; set; }

    public string? AfterJson { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public string? IpAddress { get; set; }

    public string? UserAgent { get; set; }
}

namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileNotificationEntity
{
    public Guid Id { get; set; }

    public Guid MobileAccountId { get; set; }

    public MobileAccountEntity? MobileAccount { get; set; }

    public Guid? EmployeeId { get; set; }

    public string Type { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string? EntityType { get; set; }

    public string? EntityId { get; set; }

    public string IdempotencyKey { get; set; } = string.Empty;

    public string PushStatus { get; set; } = string.Empty;

    public string PushTokenSnapshot { get; set; } = string.Empty;

    public int PushAttemptCount { get; set; }

    public string PushLastError { get; set; } = string.Empty;

    public DateTimeOffset? PushSentAt { get; set; }

    public DateTimeOffset? PushClaimedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? ReadAt { get; set; }
}

namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileOutboxOperationEntity
{
    public string ClientOperationId { get; set; } = string.Empty;

    public Guid MobileAccountId { get; set; }

    public MobileAccountEntity? MobileAccount { get; set; }

    public string CommandType { get; set; } = string.Empty;

    public string EntityType { get; set; } = string.Empty;

    public string? EntityLocalId { get; set; }

    public string? EntityServerId { get; set; }

    public string PayloadJson { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtLocal { get; set; }

    public DateTimeOffset CreatedAtServer { get; set; }

    public int AttemptCount { get; set; }

    public string Status { get; set; } = string.Empty;

    public string ResponseJson { get; set; } = string.Empty;
}

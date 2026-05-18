namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileAccountAuditEventEntity
{
    public Guid Id { get; set; }

    public Guid MobileAccountId { get; set; }

    public string Action { get; set; } = string.Empty;

    public string Details { get; set; } = string.Empty;

    public string Actor { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }
}

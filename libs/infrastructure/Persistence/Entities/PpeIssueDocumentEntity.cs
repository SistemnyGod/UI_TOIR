namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class PpeIssueDocumentEntity
{
    public Guid Id { get; set; }
    public Guid EmployeeId { get; set; }
    public Guid NormSetId { get; set; }
    public Guid? LegacyCardId { get; set; }
    public long Version { get; set; }
    public string Status { get; set; } = "draft";
    public string ContentJson { get; set; } = "{}";
    public string ValidationJson { get; set; } = "{}";
    public string? IdempotencyKey { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
    public string CreatedBy { get; set; } = "";
}

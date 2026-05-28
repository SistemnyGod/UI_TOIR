namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class PatrolResultIssueEntity
{
    public Guid Id { get; set; }

    public Guid PatrolResultId { get; set; }

    public string Type { get; set; } = string.Empty;

    public string Severity { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public PatrolResultEntity? PatrolResult { get; set; }
}

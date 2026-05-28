namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class PatrolResultAttachmentEntity
{
    public Guid Id { get; set; }

    public Guid PatrolResultId { get; set; }

    public string FileName { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public PatrolResultEntity? PatrolResult { get; set; }
}

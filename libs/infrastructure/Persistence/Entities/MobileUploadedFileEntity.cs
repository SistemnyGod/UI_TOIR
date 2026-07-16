namespace Patrol360.Infrastructure.Persistence.Entities;

internal sealed class MobileUploadedFileEntity
{
    public Guid Id { get; set; }

    public Guid MobileAccountId { get; set; }

    public MobileAccountEntity? MobileAccount { get; set; }

    public string ClientFileId { get; set; } = string.Empty;

    public Guid? AssignmentId { get; set; }

    public AssignmentEntity? Assignment { get; set; }

    public Guid? PointId { get; set; }

    public RoutePointEntity? Point { get; set; }

    public string? RemarkId { get; set; }

    public Guid? WorkTaskId { get; set; }

    public string StorageFileName { get; set; } = string.Empty;

    public string OriginalFileName { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public string Sha256 { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    public DateTimeOffset CapturedAtLocal { get; set; }

    public DateTimeOffset UploadedAt { get; set; }
}

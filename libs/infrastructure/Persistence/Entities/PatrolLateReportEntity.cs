namespace Patrol360.Infrastructure.Persistence.Entities;

// A completePatrolAssignment report that arrived after the assignment was
// closed (completed, cancelled or handed to the dispatcher). The phone opts in
// with lateReportPolicy = "review"; the report waits here for a dispatcher
// instead of being rejected and lost on the phone.
internal sealed class PatrolLateReportEntity
{
    public Guid Id { get; set; }
    public Guid AssignmentId { get; set; }
    public Guid MobileAccountId { get; set; }
    public string ClientOperationId { get; set; } = string.Empty;
    public string ReasonCode { get; set; } = string.Empty;
    public string AssignmentStatusAtReceipt { get; set; } = string.Empty;
    public string? SubmissionMode { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public string PayloadFingerprint { get; set; } = string.Empty;
    public DateTimeOffset CompletedAtLocal { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    // pending | applied | dismissed
    public string Status { get; set; } = "pending";
    public string ResolutionComment { get; set; } = string.Empty;
    public string? ResolvedBy { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
    public AssignmentEntity? Assignment { get; set; }
    public MobileAccountEntity? MobileAccount { get; set; }
}

// A photo named in an accepted (or late) report that was not uploaded yet.
// The upload is allowed after the assignment is closed and is attached to the
// patrol result when it arrives.
internal sealed class PatrolReportPendingPhotoEntity
{
    public Guid Id { get; set; }
    public Guid MobileAccountId { get; set; }
    public Guid AssignmentId { get; set; }
    public Guid PointId { get; set; }
    public string ClientFileId { get; set; } = string.Empty;
    public Guid? LateReportId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? UploadedFileId { get; set; }
    public DateTimeOffset? LinkedAt { get; set; }
}

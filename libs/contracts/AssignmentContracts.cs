namespace Patrol360.Contracts;

public sealed record CreateAssignmentDto(
    Guid? PatrolRequestId,
    Guid? EmployeeId,
    Guid? RouteId,
    DateTimeOffset? PlannedAt,
    string? Shift,
    DateTimeOffset? PlannedEndAt = null,
    string? Priority = null,
    bool NotifyEmployee = false,
    string? NotificationText = null,
    string? Comment = null);

public sealed record CompleteAssignmentDto(
    DateTimeOffset? ActualAt,
    string? Status,
    Guid? RoutePointId,
    string? Comment,
    string? IssueType,
    string? Severity,
    int Photos = 0,
    IReadOnlyList<CompleteAssignmentPointDto>? PointResults = null,
    IReadOnlyList<CompleteAssignmentPhotoDto>? PhotoAttachments = null);

public sealed record CompleteAssignmentPointDto(
    Guid RoutePointId,
    string? Status,
    string? Comment,
    string? IssueType,
    string? Severity,
    int Photos = 0,
    IReadOnlyList<CompleteAssignmentPhotoDto>? PhotoAttachments = null);

public sealed record CompleteAssignmentPhotoDto(
    string FileName,
    string ContentType,
    string DataBase64);

public sealed record AssignmentCommandResultDto(
    AssignmentDto Assignment,
    bool Changed,
    string Message);

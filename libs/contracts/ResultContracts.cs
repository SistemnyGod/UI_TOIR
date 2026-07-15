namespace Patrol360.Contracts;

public sealed record ResultFilterDto(
    string? Status,
    Guid? RouteId,
    Guid? EmployeeId,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    Guid? AssignmentId = null,
    string? Query = null,
    bool? HasPhotos = null);

public sealed record ResultListItemDto(
    Guid Id,
    Guid? AssignmentId,
    string Status,
    Guid? PointId,
    string Point,
    Guid? EmployeeId,
    string Employee,
    Guid? RouteId,
    string Route,
    string Territory,
    string Shift,
    DateTimeOffset PlannedAt,
    DateTimeOffset ActualAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    string Deviation,
    string Comment,
    int Photos,
    string IssueType,
    string Severity);

public sealed record ResultPageDto(
    IReadOnlyList<ResultListItemDto> Items,
    int Page,
    int PageSize,
    int Total,
    int TotalPages,
    bool HasNext);

public sealed record ResultDetailDto(
    Guid Id,
    Guid? AssignmentId,
    string Status,
    Guid? PointId,
    string Point,
    Guid? EmployeeId,
    string Employee,
    Guid? RouteId,
    string Route,
    string Territory,
    string Shift,
    DateTimeOffset PlannedAt,
    DateTimeOffset ActualAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    string Deviation,
    string Comment,
    int Photos,
    string IssueType,
    string Severity,
    IReadOnlyList<IssueDto> Issues,
    IReadOnlyList<AttachmentMetadataDto> Attachments,
    IReadOnlyList<string> Chronology);

public sealed record IssueDto(
    Guid Id,
    string Type,
    string Severity,
    string Message,
    DateTimeOffset CreatedAt);

public sealed record AttachmentMetadataDto(
    Guid Id,
    string FileName,
    string ContentType,
    long SizeBytes,
    DateTimeOffset CreatedAt);

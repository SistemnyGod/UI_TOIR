namespace Patrol360.Contracts;

public sealed record MobileLoginRequestDto(
    string Login,
    string Password,
    string DeviceId,
    string DeviceName,
    string Platform,
    string AppVersion);

public sealed record MobileRefreshRequestDto(
    string RefreshToken,
    string DeviceId);

public sealed record MobileAuthSessionDto(
    MobileUserDto User,
    MobileDeviceDto Device,
    string AccessToken,
    string RefreshToken,
    DateTimeOffset ExpiresAt,
    DateTimeOffset RefreshExpiresAt);

public sealed record MobileUserDto(
    Guid ServerUserId,
    string FullName,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions,
    DateTimeOffset UpdatedAtServer);

public sealed record MobileDeviceDto(
    string DeviceId,
    Guid OwnerUserId,
    bool Trusted,
    DateTimeOffset? BlockedAt);

public sealed record MobilePushTokenRegistrationDto(
    string DeviceId,
    string PushToken);

public sealed record MobileDeviceRegistrationDto(
    string DeviceId,
    bool PushEnabled,
    DateTimeOffset RegisteredAt);

public sealed record MobileNotificationDto(
    Guid Id,
    string Type,
    string Title,
    string Message,
    string? EntityType,
    string? EntityId,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ReadAt);

public sealed record MobileEmployeeDto(
    Guid EmployeeId,
    string FullName,
    string? Position,
    string? Department);

public sealed record MobileEmuSectionDto(
    Guid SectionId,
    string Name,
    int SortOrder);

public sealed record MobileWorkTaskDto(
    Guid TaskId,
    string Title,
    string Status,
    DateTimeOffset? PlannedAt,
    long Revision,
    DateTimeOffset? CompletedAtLocal,
    Guid? SectionId,
    string? SectionName,
    Guid? EmployeeId,
    string? EmployeeName,
    DateTimeOffset CreatedAtLocal,
    string SyncStatus);

public sealed record MobileBootstrapDto(
    MobileUserDto User,
    MobileDeviceDto Device,
    IReadOnlyList<MobileEmployeeDto> BoundEmployees,
    IReadOnlyList<MobileEmuSectionDto> EmuSections,
    IReadOnlyList<MobilePatrolRequestBoardItemDto> RequestBoard,
    IReadOnlyList<MobilePatrolAssignmentDto> Assignments,
    IReadOnlyList<MobilePatrolRouteDto> Routes,
    IReadOnlyList<MobilePatrolPointDto> Points,
    DateTimeOffset ServerTime,
    string? SyncCursor);

public sealed record MobilePatrolRequestBoardItemDto(
    Guid RequestId,
    string? DisplayNumber,
    Guid RouteId,
    string RouteName,
    DateTimeOffset PlannedStartAt,
    string? AssignedFullName,
    string Status,
    long Revision);

public sealed record MobilePatrolAssignmentDto(
    Guid AssignmentId,
    Guid RequestId,
    Guid RouteId,
    string Status,
    DateTimeOffset? StartedAtLocal,
    DateTimeOffset? CompletedAtLocal,
    long Revision);

public sealed record MobilePatrolRouteDto(
    Guid RouteId,
    string Name,
    int Version,
    bool AllowFreeOrder,
    bool NfcEnabled,
    bool QrFallbackEnabled);

public sealed record MobilePatrolPointDto(
    Guid PointId,
    Guid RouteId,
    string Name,
    int OrderIndex,
    string? NfcUidHash,
    string? QrCodeHash,
    bool Required,
    long Revision);

public sealed record MobileOutboxBatchDto(
    IReadOnlyList<MobileOutboxCommandDto> Commands);

public sealed record MobileOutboxCommandDto(
    string ClientOperationId,
    string CommandType,
    string EntityType,
    string? EntityLocalId,
    string? EntityServerId,
    Dictionary<string, object?> Payload,
    DateTimeOffset CreatedAtLocal,
    int AttemptCount,
    string Status);

public sealed record MobileOutboxResponseDto(
    string ClientOperationId,
    string Status,
    string? ServerEntityId,
    long? ServerRevision,
    string Message,
    string? ConflictId,
    int? RetryAfterSeconds);

public sealed record MobileFileUploadResponseDto(
    string ClientFileId,
    Guid ServerFileId,
    string Status,
    DateTimeOffset UploadedAt);

public sealed record MobileSyncConflictListItemDto(
    string ClientOperationId,
    Guid MobileAccountId,
    string AccountLogin,
    string CommandType,
    string EntityType,
    string? EntityServerId,
    string Message,
    object? PayloadSnapshot,
    DateTimeOffset CreatedAtServer,
    string Status);

public sealed record MobileSyncConflictDetailDto(
    string ClientOperationId,
    Guid MobileAccountId,
    string AccountLogin,
    string CommandType,
    string EntityType,
    string? EntityLocalId,
    string? EntityServerId,
    object? PayloadSnapshot,
    object? ResponseSnapshot,
    string Message,
    DateTimeOffset CreatedAtLocal,
    DateTimeOffset CreatedAtServer,
    int AttemptCount,
    string OperationStatus,
    string Status,
    string? ResolutionComment,
    string? ResolvedBy,
    DateTimeOffset? ResolvedAt);

public sealed record MobileSyncConflictResolutionRequestDto(
    string Status,
    string? Comment);

public sealed record MobileSyncConflictResolutionDto(
    string ClientOperationId,
    string Status,
    string? Comment,
    string ResolvedBy,
    DateTimeOffset ResolvedAt);

public sealed record MobileDeviceHealthDto(
    Guid MobileAccountId,
    string Login,
    string? DeviceId,
    string? DeviceName,
    string? AppVersion,
    DateTimeOffset? LastSeenAt,
    string PushStatus,
    int PendingOutboxCount,
    int StaleOutboxCount,
    string? LastError);

public sealed record MobileAuthResult(
    MobileAuthSessionDto? Session,
    bool Unauthorized,
    IReadOnlyDictionary<string, string[]> Errors)
{
    public bool Succeeded => Session is not null && !Unauthorized && Errors.Count == 0;
}

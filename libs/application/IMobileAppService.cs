using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IMobileSessionAuthenticationService
{
    MobileSessionIdentity? GetCurrentSession(string accessToken);
}

public sealed record MobileSessionIdentity(Guid MobileAccountId, string Login);

public interface IMobileAppService
{
    MobileAuthResult Login(MobileLoginRequestDto request, string ipAddress);

    MobileAuthResult Refresh(MobileRefreshRequestDto request, string ipAddress);

    bool Logout(string accessToken);

    MobileBootstrapDto? GetBootstrap(string accessToken, bool patrolAppealsPaging = false, bool assignmentSnapshots = false);

    MobilePatrolReportPageDto? GetPatrolReports(string accessToken, int page, int pageSize, string? cursor = null);

    MobilePatrolAppealPageDto? GetPatrolAppeals(string accessToken, int pageSize = 25, string? cursor = null, Guid? assignmentId = null);

    IReadOnlyList<MobilePatrolReportPointDto>? GetPatrolReportPoints(string accessToken, Guid assignmentId);

    MobileDeviceRegistrationDto? RegisterPushToken(string accessToken, MobilePushTokenRegistrationDto request);

    MobileDiagnosticReportReceiptDto? SaveDiagnosticReport(string accessToken, MobileDiagnosticReportDto request);

    IReadOnlyList<MobileNotificationDto> GetNotifications(string accessToken, bool unreadOnly);

    MobileNotificationDto? MarkNotificationRead(string accessToken, Guid notificationId);

    IReadOnlyList<MobileWorkTaskDto> GetWorkTasks(string accessToken);

    MobileWorkTaskDto? GetWorkTask(string accessToken, Guid taskId);

    IReadOnlyList<MobileWorkItemDto> GetWorkItemsV2(string accessToken);

    MobileWorkItemPageDto? GetWorkItemsPage(string accessToken, string scope, Guid? employeeId, string? cursor, int pageSize);

    IReadOnlyList<MobileOutboxResponseDto> SaveOutbox(string accessToken, MobileOutboxBatchDto request);

    MobileOutboxResponseDto? GetOutboxResult(string accessToken, string clientOperationId);

    MobileHeartbeatReceiptDto? SaveHeartbeat(string accessToken, MobileHeartbeatRequestDto request) => null;

    MobileFileUploadResponseDto? UploadFile(string accessToken, MobileFileUploadCommand command);

    Task<MobileFileUploadResponseDto?> UploadFileAsync(
        string accessToken,
        MobileFileUploadCommand command,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(UploadFile(accessToken, command));
}

public sealed record MobileFileUploadCommand(
    string ClientFileId,
    Guid? AssignmentId,
    Guid? PointId,
    string? RemarkId,
    Guid? WorkTaskId,
    string? Sha256,
    long SizeBytes,
    DateTimeOffset CapturedAtLocal,
    string FileName,
    string ContentType,
    Stream Content);

// Dispatcher review queue for patrol reports that reached the server after
// the assignment was closed (see lateReportPolicy in completePatrolAssignment).
public interface IPatrolLateReportService
{
    IReadOnlyList<PatrolLateReportDto> GetLateReports(string? status, int limit);

    PatrolLateReportResolutionResult ResolveLateReport(
        Guid lateReportId,
        PatrolLateReportResolutionRequestDto request,
        string actor);
}

public interface IMobileDiagnosticReportStore
{
    MobileDiagnosticReportReceiptDto Save(MobileStoredDiagnosticReport report);
}

public sealed record MobileStoredDiagnosticReport(
    MobileDiagnosticReportDto Report,
    DateTimeOffset ReceivedAt);

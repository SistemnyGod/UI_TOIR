using Patrol360.Contracts;

namespace Patrol360.Application;

public interface IMobileAppService
{
    MobileAuthResult Login(MobileLoginRequestDto request, string ipAddress);

    MobileAuthResult Refresh(MobileRefreshRequestDto request, string ipAddress);

    bool Logout(string accessToken);

    MobileBootstrapDto? GetBootstrap(string accessToken);

    MobileDeviceRegistrationDto? RegisterPushToken(string accessToken, MobilePushTokenRegistrationDto request);

    IReadOnlyList<MobileNotificationDto> GetNotifications(string accessToken, bool unreadOnly);

    MobileNotificationDto? MarkNotificationRead(string accessToken, Guid notificationId);

    IReadOnlyList<MobileWorkTaskDto> GetWorkTasks(string accessToken);

    MobileWorkTaskDto? GetWorkTask(string accessToken, Guid taskId);

    IReadOnlyList<MobileOutboxResponseDto> SaveOutbox(string accessToken, MobileOutboxBatchDto request);

    MobileOutboxResponseDto? GetOutboxResult(string accessToken, string clientOperationId);

    MobileFileUploadResponseDto? UploadFile(string accessToken, MobileFileUploadCommand command);
}

public sealed record MobileFileUploadCommand(
    string ClientFileId,
    Guid? AssignmentId,
    Guid? PointId,
    string? RemarkId,
    string Sha256,
    long SizeBytes,
    DateTimeOffset CapturedAtLocal,
    string FileName,
    string ContentType,
    Stream Content);

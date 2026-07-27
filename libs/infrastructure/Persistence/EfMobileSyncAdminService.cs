using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfMobileSyncAdminService(Patrol360DbContext dbContext) : IMobileSyncAdminService
{
    private static readonly string[] ConflictStatuses = ["conflict", "rejected"];
    private static readonly HashSet<string> ResolutionStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "accepted",
        "rejected",
        "repeatRequested"
    };

    public IReadOnlyList<MobileSyncConflictListItemDto> GetConflicts()
    {
        var resolutions = dbContext.MobileSyncConflictResolutions
            .AsNoTracking()
            .ToDictionary(resolution => (resolution.MobileAccountId, resolution.ClientOperationId));

        return dbContext.MobileOutboxOperations
            .AsNoTracking()
            .Include(operation => operation.MobileAccount)
            .Where(operation => ConflictStatuses.Contains(operation.Status))
            .OrderByDescending(operation => operation.CreatedAtServer)
            .Take(200)
            .AsEnumerable()
            .Select(operation =>
            {
                resolutions.TryGetValue((operation.MobileAccountId, operation.ClientOperationId), out var resolution);
                return new MobileSyncConflictListItemDto(
                    operation.ClientOperationId,
                    operation.MobileAccountId,
                    operation.MobileAccount?.Login ?? "-",
                    operation.CommandType,
                    operation.EntityType,
                    operation.EntityServerId,
                    ReadMessage(operation),
                    ParseJson(operation.PayloadJson),
                    operation.CreatedAtServer,
                    resolution?.Status ?? "open");
            })
            .ToList();
    }

    public IReadOnlyList<MobileDeviceHealthDto> GetDeviceHealth()
    {
        var staleBefore = DateTimeOffset.UtcNow.AddMinutes(-15);
        var accounts = dbContext.MobileAccounts
            .AsNoTracking()
            .Include(account => account.Sessions)
            .OrderBy(account => account.Login)
            .ToList();
        var accountIds = accounts.Select(account => account.Id).ToHashSet();
        var devicesByAccount = dbContext.MobileDevices.AsNoTracking()
            .Where(device => accountIds.Contains(device.MobileAccountId))
            .ToList()
            .GroupBy(device => device.MobileAccountId)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(device => device.LastSeenAt).First());

        var outboxByAccount = dbContext.MobileOutboxOperations
            .AsNoTracking()
            .Where(operation => accountIds.Contains(operation.MobileAccountId))
            .AsEnumerable()
            .GroupBy(operation => operation.MobileAccountId)
            .ToDictionary(group => group.Key, group => group.ToList());

        var notificationsByAccount = dbContext.MobileNotifications
            .AsNoTracking()
            .Where(notification => accountIds.Contains(notification.MobileAccountId))
            .AsEnumerable()
            .GroupBy(notification => notification.MobileAccountId)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(item => item.CreatedAt).ToList());

        return accounts
            .Select(account =>
            {
                var latestSession = account.Sessions
                    .OrderByDescending(session => session.LastSeenAt)
                    .FirstOrDefault();
                outboxByAccount.TryGetValue(account.Id, out var operations);
                devicesByAccount.TryGetValue(account.Id, out var latestDevice);
                notificationsByAccount.TryGetValue(account.Id, out var notifications);
                operations ??= [];
                notifications ??= [];

                var latestErrorOperation = operations
                    .Where(operation => ConflictStatuses.Contains(operation.Status))
                    .OrderByDescending(operation => operation.CreatedAtServer)
                    .FirstOrDefault();
                var latestFailedPush = notifications
                    .FirstOrDefault(notification =>
                        notification.PushStatus.Equals("failed", StringComparison.OrdinalIgnoreCase) &&
                        !string.IsNullOrWhiteSpace(notification.PushLastError));

                return new MobileDeviceHealthDto(
                    account.Id,
                    account.Login,
                    string.IsNullOrWhiteSpace(latestSession?.DeviceId) ? null : latestSession.DeviceId,
                    string.IsNullOrWhiteSpace(latestSession?.Device) ? null : latestSession.Device,
                    string.IsNullOrWhiteSpace(latestSession?.AppVersion) ? null : latestSession.AppVersion,
                    latestSession?.LastSeenAt ?? account.LastSeenAt,
                    ReadPushStatus(latestSession, notifications),
                    operations.Count(IsPendingOutbox),
                    operations.Count(operation => IsStaleOutbox(operation, staleBefore)),
                    latestErrorOperation is not null
                        ? ReadMessage(latestErrorOperation)
                        : string.IsNullOrWhiteSpace(latestFailedPush?.PushLastError) ? null : latestFailedPush.PushLastError,
                    latestDevice?.Trusted ?? true,
                    latestDevice?.BlockedAt);
            })
            .ToList();
    }

    public MobileDeviceAdminDto? BlockDevice(string deviceId, string reason, string actor)
    {
        var device = dbContext.MobileDevices
            .Include(item => item.MobileAccount)
            .FirstOrDefault(item => item.DeviceId == deviceId);
        if (device is null)
        {
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        device.Trusted = false;
        device.BlockedAt = now;
        device.BlockReason = string.IsNullOrWhiteSpace(reason) ? "Заблокировано оператором" : reason.Trim();
        device.UpdatedAt = now;
        foreach (var session in dbContext.MobileAccountSessions.Where(item => item.DeviceId == deviceId && item.RevokedAt == null).ToList())
        {
            session.RevokedAt = now;
            session.PushTokenRevokedAt = now;
            session.Status = "Заблокирована";
        }
        if (device.MobileAccount is not null)
        {
            device.MobileAccount.Session = "Офлайн";
            AddDeviceAuditEvent(device.MobileAccount.Id, "mobile_device.blocked", $"Устройство {deviceId} заблокировано оператором {actor}: {device.BlockReason}", actor);
        }
        dbContext.SaveChanges();
        return MapDeviceAdmin(device);
    }

    public MobileDeviceAdminDto? UnblockDevice(string deviceId, string actor)
    {
        var device = dbContext.MobileDevices
            .Include(item => item.MobileAccount)
            .FirstOrDefault(item => item.DeviceId == deviceId);
        if (device is null)
        {
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        device.Trusted = true;
        device.BlockedAt = null;
        device.BlockReason = string.Empty;
        device.UpdatedAt = now;
        if (device.MobileAccount is not null)
        {
            AddDeviceAuditEvent(device.MobileAccount.Id, "mobile_device.unblocked", $"Устройство {deviceId} разблокировано оператором {actor}.", actor);
        }
        dbContext.SaveChanges();
        return MapDeviceAdmin(device);
    }

    private void AddDeviceAuditEvent(Guid accountId, string action, string details, string actor)
    {
        dbContext.MobileAccountAuditEvents.Add(new MobileAccountAuditEventEntity
        {
            Id = Guid.NewGuid(),
            MobileAccountId = accountId,
            Action = action,
            Details = details,
            Actor = actor,
            CreatedAt = DateTimeOffset.UtcNow
        });
    }
    private static MobileDeviceAdminDto MapDeviceAdmin(MobileDeviceEntity device) =>
        new(device.DeviceId, device.MobileAccountId, device.Trusted, device.BlockedAt, device.BlockReason, device.LastSeenAt);
    public MobileSyncConflictDetailDto? GetConflict(Guid mobileAccountId, string clientOperationId)
    {
        var operation = dbContext.MobileOutboxOperations
            .AsNoTracking()
            .Include(item => item.MobileAccount)
            .FirstOrDefault(item =>
                item.MobileAccountId == mobileAccountId
                && item.ClientOperationId == clientOperationId
                && ConflictStatuses.Contains(item.Status));

        if (operation is null)
        {
            return null;
        }

        var resolution = dbContext.MobileSyncConflictResolutions
            .AsNoTracking()
            .FirstOrDefault(item =>
                item.MobileAccountId == operation.MobileAccountId
                && item.ClientOperationId == clientOperationId);

        return MapDetail(operation, resolution);
    }

    public MobileSyncConflictResolutionDto? SetResolution(
        Guid mobileAccountId,
        string clientOperationId,
        MobileSyncConflictResolutionRequestDto request,
        string actor)
    {
        var status = request.Status.Trim();
        if (!ResolutionStatuses.Contains(status))
        {
            return null;
        }

        var operation = dbContext.MobileOutboxOperations
            .FirstOrDefault(item =>
                item.MobileAccountId == mobileAccountId
                && item.ClientOperationId == clientOperationId
                && ConflictStatuses.Contains(item.Status));
        if (operation is null)
        {
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        var resolution = dbContext.MobileSyncConflictResolutions
            .FirstOrDefault(item =>
                item.MobileAccountId == operation.MobileAccountId
                && item.ClientOperationId == clientOperationId);
        if (resolution is null)
        {
            resolution = new MobileSyncConflictResolutionEntity
            {
                MobileAccountId = mobileAccountId,
                ClientOperationId = clientOperationId
            };
            dbContext.MobileSyncConflictResolutions.Add(resolution);
        }

        resolution.Status = status;
        resolution.Comment = NormalizeComment(request.Comment);
        resolution.ResolvedBy = string.IsNullOrWhiteSpace(actor) ? "system" : actor.Trim();
        resolution.ResolvedAt = now;
        dbContext.SaveChanges();

        return new MobileSyncConflictResolutionDto(
            resolution.ClientOperationId,
            resolution.MobileAccountId,
            resolution.Status,
            string.IsNullOrWhiteSpace(resolution.Comment) ? null : resolution.Comment,
            resolution.ResolvedBy,
            resolution.ResolvedAt);
    }

    private static MobileSyncConflictDetailDto MapDetail(
        MobileOutboxOperationEntity operation,
        MobileSyncConflictResolutionEntity? resolution) =>
        new(
            operation.ClientOperationId,
            operation.MobileAccountId,
            operation.MobileAccount?.Login ?? "-",
            operation.CommandType,
            operation.EntityType,
            operation.EntityLocalId,
            operation.EntityServerId,
            ParseJson(operation.PayloadJson),
            ParseJson(operation.ResponseJson),
            ReadMessage(operation),
            operation.CreatedAtLocal,
            operation.CreatedAtServer,
            operation.AttemptCount,
            operation.Status,
            resolution?.Status ?? "open",
            string.IsNullOrWhiteSpace(resolution?.Comment) ? null : resolution.Comment,
            string.IsNullOrWhiteSpace(resolution?.ResolvedBy) ? null : resolution.ResolvedBy,
            resolution?.ResolvedAt);

    private static string ReadMessage(MobileOutboxOperationEntity operation)
    {
        var parsed = TryDeserialize<MobileOutboxResponseDto>(operation.ResponseJson);
        if (!string.IsNullOrWhiteSpace(parsed?.Message))
        {
            return parsed.Message;
        }

        return operation.Status.Equals("conflict", StringComparison.OrdinalIgnoreCase)
            ? "Конфликт синхронизации"
            : "Команда отклонена сервером";
    }

    private static object? ParseJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<JsonElement>(json);
        }
        catch (JsonException)
        {
            return json;
        }
    }

    private static T? TryDeserialize<T>(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return default;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        catch (JsonException)
        {
            return default;
        }
    }

    private static string NormalizeComment(string? comment) =>
        string.IsNullOrWhiteSpace(comment) ? string.Empty : comment.Trim();

    private static bool IsPendingOutbox(MobileOutboxOperationEntity operation) =>
        operation.Status.Equals("pending", StringComparison.OrdinalIgnoreCase) ||
        operation.Status.Equals("sending", StringComparison.OrdinalIgnoreCase) ||
        operation.Status.Equals("retryLater", StringComparison.OrdinalIgnoreCase);

    private static bool IsStaleOutbox(MobileOutboxOperationEntity operation, DateTimeOffset staleBefore) =>
        (operation.Status.Equals("sending", StringComparison.OrdinalIgnoreCase) ||
         operation.Status.Equals("retryLater", StringComparison.OrdinalIgnoreCase)) &&
        operation.CreatedAtServer < staleBefore;

    private static string ReadPushStatus(
        MobileAccountSessionEntity? latestSession,
        IReadOnlyList<MobileNotificationEntity> notifications)
    {
        if (latestSession is null || string.IsNullOrWhiteSpace(latestSession.PushToken))
        {
            return "notRegistered";
        }

        if (latestSession.PushTokenRevokedAt is not null)
        {
            return "revoked";
        }

        var latestPush = notifications.FirstOrDefault();
        if (latestPush is null)
        {
            return "registered";
        }

        return latestPush.PushStatus;
    }
}

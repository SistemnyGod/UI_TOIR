using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Patrol360.Application;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.MobilePush;

internal sealed class EfMobilePushDeliveryService(
    Patrol360DbContext dbContext,
    IMobilePushSender sender,
    ILogger<EfMobilePushDeliveryService> logger) : IMobilePushDeliveryService
{
    private const int BatchSize = 50;
    private const int MaxAttempts = 3;
    private static readonly TimeSpan SendingTimeout = TimeSpan.FromMinutes(5);

    public async Task<int> SendQueuedAsync(CancellationToken cancellationToken)
    {
        if (!sender.IsConfigured)
        {
            return 0;
        }

        await ReleaseStaleSendingAsync(cancellationToken);
        var notificationIds = await ClaimQueuedAsync(cancellationToken);
        if (notificationIds.Count == 0)
        {
            return 0;
        }

        var notifications = await dbContext.MobileNotifications
            .Where(notification => notificationIds.Contains(notification.Id))
            .OrderBy(notification => notification.CreatedAt)
            .ToListAsync(cancellationToken);

        var sentCount = 0;
        foreach (var notification in notifications)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                await sender.SendAsync(CreateMessage(notification), cancellationToken);
                notification.PushStatus = "sent";
                notification.PushSentAt = DateTimeOffset.UtcNow;
                notification.PushClaimedAt = null;
                notification.PushLastError = string.Empty;
                sentCount += 1;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                notification.PushLastError = Truncate(ex.Message, 1200);
                notification.PushStatus = notification.PushAttemptCount >= MaxAttempts ? "failed" : "queued";
                notification.PushClaimedAt = null;

                logger.LogWarning(ex, "Failed to send mobile push notification {NotificationId}.", notification.Id);
            }

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return sentCount;
    }

    private Task ReleaseStaleSendingAsync(CancellationToken cancellationToken)
    {
        var staleBefore = DateTimeOffset.UtcNow.Subtract(SendingTimeout);

        return dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"""
            UPDATE mobile_notifications
            SET push_status = CASE
                    WHEN push_attempt_count >= {MaxAttempts} THEN 'failed'
                    ELSE 'queued'
                END,
                push_claimed_at = NULL
            WHERE push_status = 'sending'
              AND push_claimed_at IS NOT NULL
              AND push_claimed_at < {staleBefore}
            """,
            cancellationToken);
    }

    private Task<List<Guid>> ClaimQueuedAsync(CancellationToken cancellationToken)
    {
        var claimedAt = DateTimeOffset.UtcNow;

        return dbContext.Database.SqlQueryRaw<Guid>(
            """
            WITH selected AS (
                SELECT id
                FROM mobile_notifications
                WHERE push_status = 'queued'
                  AND push_token_snapshot <> ''
                  AND push_attempt_count < {0}
                ORDER BY created_at
                LIMIT {1}
                FOR UPDATE SKIP LOCKED
            )
            UPDATE mobile_notifications notification
            SET push_status = 'sending',
                push_attempt_count = push_attempt_count + 1,
                push_claimed_at = {2},
                push_last_error = ''
            FROM selected
            WHERE notification.id = selected.id
            RETURNING notification.id AS "Value"
            """,
            MaxAttempts,
            BatchSize,
            claimedAt)
            .ToListAsync(cancellationToken);
    }

    private static MobilePushMessage CreateMessage(MobileNotificationEntity notification) =>
        new(
            notification.PushTokenSnapshot,
            notification.Title,
            notification.Message,
            new Dictionary<string, string>
            {
                ["notificationId"] = notification.Id.ToString(),
                ["type"] = notification.Type,
                ["entityType"] = notification.EntityType ?? string.Empty,
                ["entityId"] = notification.EntityId ?? string.Empty
            },
            "patrol360");

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];
}

internal sealed class FirebaseMobilePushSender(
    IConfiguration configuration,
    ILogger<FirebaseMobilePushSender> logger) : IMobilePushSender
{
    private static readonly object FirebaseAppLock = new();
    private static FirebaseApp? firebaseApp;

    public bool IsConfigured
    {
        get
        {
            var serviceAccountPath = configuration["Firebase:ServiceAccountPath"];
            return !string.IsNullOrWhiteSpace(serviceAccountPath) && File.Exists(serviceAccountPath);
        }
    }

    public async Task SendAsync(MobilePushMessage message, CancellationToken cancellationToken)
    {
        var messaging = GetFirebaseMessaging();
        if (messaging is null)
        {
            logger.LogDebug("Firebase service account file is not configured or not found.");
            return;
        }

        await messaging.SendAsync(CreateFirebaseMessage(message), cancellationToken);
    }

    private FirebaseMessaging? GetFirebaseMessaging()
    {
        var serviceAccountPath = configuration["Firebase:ServiceAccountPath"];
        if (string.IsNullOrWhiteSpace(serviceAccountPath) || !File.Exists(serviceAccountPath))
        {
            return null;
        }

        lock (FirebaseAppLock)
        {
            firebaseApp ??= FirebaseApp.Create(new AppOptions
            {
                Credential = CredentialFactory
                    .FromFile<ServiceAccountCredential>(serviceAccountPath)
                    .ToGoogleCredential()
            });

            return FirebaseMessaging.GetMessaging(firebaseApp);
        }
    }

    private static Message CreateFirebaseMessage(MobilePushMessage message) =>
        new()
        {
            Token = message.Token,
            Notification = new Notification
            {
                Title = message.Title,
                Body = message.Body
            },
            Data = message.Data.ToDictionary(item => item.Key, item => item.Value),
            Android = new AndroidConfig
            {
                Priority = Priority.High,
                Notification = new AndroidNotification
                {
                    ChannelId = message.ChannelId
                }
            }
        };
}

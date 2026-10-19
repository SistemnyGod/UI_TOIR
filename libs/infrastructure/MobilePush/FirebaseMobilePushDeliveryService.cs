using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using System.Text;
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
    private static readonly TimeSpan ProviderTimeout = TimeSpan.FromSeconds(20);

    public async Task<int> SendQueuedAsync(CancellationToken cancellationToken)
    {
        if (!sender.IsConfigured)
        {
            return 0;
        }

        await ReleaseStaleSendingAsync(cancellationToken);
        // Claim immediately before delivery, rather than leasing an entire serial
        // batch which can take longer than SendingTimeout to reach its last item.
        var attempted = new List<Guid>(BatchSize);
        var sentCount = 0;
        while (attempted.Count < BatchSize)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var notificationIds = await ClaimQueuedAsync(attempted, cancellationToken);
            if (notificationIds.Count == 0) break;
            var notificationId = notificationIds[0];
            attempted.Add(notificationId);
            var notification = await dbContext.MobileNotifications.SingleAsync(
                row => row.Id == notificationId, cancellationToken);
            // Raw claim SQL bypasses tracking; repeated calls in the same scope
            // must see the current attempt count and persisted device receipts.
            await dbContext.Entry(notification).ReloadAsync(cancellationToken);

            try
            {
                var now = DateTimeOffset.UtcNow;
                var tokens = await dbContext.MobileAccountSessions.AsNoTracking()
                    .Where(session => session.MobileAccountId == notification.MobileAccountId
                        && session.RevokedAt == null && session.PushTokenRevokedAt == null
                        && session.RefreshExpiresAt > now && session.PushToken != "")
                    .Select(session => session.PushToken).Distinct().ToArrayAsync(cancellationToken);
                if (tokens.Length == 0)
                {
                    notification.PushStatus = "waitingSync";
                    notification.PushClaimedAt = null;
                    notification.PushAttemptCount = Math.Max(0, notification.PushAttemptCount - 1);
                    await dbContext.SaveChangesAsync(cancellationToken);
                    continue;
                }
                var failures = new List<Exception>();
                var deliveredTokens = notification.PushDeliveredTokenHashes.ToHashSet(StringComparer.Ordinal);
                foreach (var token in tokens)
                {
                    var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
                    if (deliveredTokens.Contains(tokenHash)) continue;
                    try
                    {
                        // A notification may target many phones. Keep its lease
                        // fresh before each bounded provider call.
                        notification.PushClaimedAt = DateTimeOffset.UtcNow;
                        await dbContext.SaveChangesAsync(cancellationToken);
                        using var providerTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                        providerTimeout.CancelAfter(ProviderTimeout);
                        await sender.SendAsync(CreateMessage(notification, token), providerTimeout.Token);
                        deliveredTokens.Add(tokenHash);
                        notification.PushDeliveredTokenHashes = deliveredTokens.ToArray();
                        // Persist each successful device before trying the next one. A failed
                        // device must not cause a repeat alert on already delivered devices.
                        await dbContext.SaveChangesAsync(cancellationToken);
                    }
                    catch (MobilePushTokenRejectedException ex)
                    {
                        await dbContext.MobileAccountSessions
                            .Where(session => session.PushToken == token && session.PushTokenRevokedAt == null)
                            .ExecuteUpdateAsync(setters => setters.SetProperty(session => session.PushTokenRevokedAt, now), cancellationToken);
                        logger.LogInformation("Revoked an unregistered push token for notification {NotificationId}: {Reason}.", notification.Id, ex.Message);
                    }
                    catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
                    {
                        // A stale token on one phone must not prevent delivery to another.
                        failures.Add(ex);
                    }
                }
                if (failures.Count > 0) throw new AggregateException("One or more mobile devices rejected push delivery.", failures);
                if (deliveredTokens.Count == 0)
                {
                    notification.PushStatus = "waitingSync";
                    notification.PushClaimedAt = null;
                    notification.PushAttemptCount = Math.Max(0, notification.PushAttemptCount - 1);
                    notification.PushLastError = string.Empty;
                    await dbContext.SaveChangesAsync(cancellationToken);
                    continue;
                }
                notification.PushStatus = "sent";
                notification.PushSentAt = DateTimeOffset.UtcNow;
                notification.PushClaimedAt = null;
                notification.PushLastError = string.Empty;
                sentCount += 1;
            }
            catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                notification.PushLastError = "Provider timeout: " + Truncate(ex.Message, 1180);
                notification.PushStatus = notification.PushAttemptCount >= MaxAttempts ? "failed" : "queued";
                notification.PushClaimedAt = null;
                logger.LogWarning(ex, "Mobile push provider timed out for notification {NotificationId}.", notification.Id);
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

    private Task<List<Guid>> ClaimQueuedAsync(List<Guid> attempted, CancellationToken cancellationToken)
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
                  AND NOT (id = ANY ({3}))
                ORDER BY created_at, id
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
            1,
            claimedAt,
            attempted.ToArray())
            .ToListAsync(cancellationToken);
    }

    private static MobilePushMessage CreateMessage(MobileNotificationEntity notification, string token) =>
        new(
            token,
            notification.Title,
            notification.Message,
            new Dictionary<string, string>
            {
                ["notificationId"] = notification.Id.ToString(),
                // Expo uses tag as the Android tray identifier (also across retries).
                ["tag"] = notification.Id.ToString(),
                ["type"] = notification.Type,
                ["entityType"] = notification.EntityType ?? string.Empty,
                ["entityId"] = notification.EntityId ?? string.Empty,
                ["title"] = notification.Title,
                // Expo's native Android data-message presenter reads message, not body.
                ["message"] = notification.Message,
                ["body"] = notification.Message,
                ["channelId"] = "patrol360"
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

        try
        {
            await messaging.SendAsync(CreateFirebaseMessage(message), cancellationToken);
        }
        catch (FirebaseMessagingException ex) when (ex.MessagingErrorCode == MessagingErrorCode.Unregistered)
        {
            // InvalidArgument can describe a malformed message, so only Unregistered
            // is safe to use to invalidate a device registration.
            throw new MobilePushTokenRejectedException("FCM registration is no longer valid.", ex);
        }
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
            Data = message.Data.ToDictionary(item => item.Key, item => item.Value),
            Android = new AndroidConfig
            {
                Priority = Priority.High
            }
        };
}

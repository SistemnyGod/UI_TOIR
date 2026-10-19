using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using System.Security.Cryptography;
using System.Text;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed class MobilePushDeliveryDbIntegrationTests
{
    [DbIntegrationFact]
    public async Task BacklogIsNotLeasedWhileAnotherNotificationIsBeingDelivered()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender();
        using var provider = BuildProvider(database.ConnectionString, sender);
        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        for (var index = 0; index < 51; index++)
            await InsertNotificationAsync(database.ConnectionString, accountId, "queued", 0);
        sender.BeforeSend = async () =>
        {
            using var check = provider.CreateScope();
            var db = check.ServiceProvider.GetRequiredService<Patrol360DbContext>();
            Assert.Equal(1, await db.MobileNotifications.CountAsync(row => row.PushStatus == "sending"));
            var active = await db.MobileNotifications.SingleAsync(row => row.PushStatus == "sending");
            Assert.True(active.PushClaimedAt > DateTimeOffset.UtcNow.AddSeconds(-5));
            Assert.True(await db.MobileNotifications.AnyAsync(row => row.PushStatus == "queued" && row.PushAttemptCount == 0));
        };
        Assert.Equal(50, await SendQueuedAsync(provider));
        sender.BeforeSend = null;
        Assert.Equal(1, await SendQueuedAsync(provider));
        Assert.Equal(51, sender.Sent.Select(message => message.Data["notificationId"]).Distinct().Count());
    }

    [DbIntegrationFact]
    public async Task SendsToEveryActiveDeviceAndContinuesAfterOneDeviceFails()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender { FailToken = "fcm-token" };
        using var provider = BuildProvider(database.ConnectionString, sender);
        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
            db.MobileAccountSessions.AddRange(
                Session(accountId, "second-phone"), Session(accountId, "second-phone"),
                Session(accountId, "revoked", revoked: true), Session(accountId, "expired", expired: true));
            await db.SaveChangesAsync();
        }
        var notificationId = await InsertNotificationAsync(database.ConnectionString, accountId, "queued", 0);
        Assert.Equal(0, await SendQueuedAsync(provider));
        Assert.Equal(2, sender.SendAttempts);
        Assert.Equal("second-phone", Assert.Single(sender.Sent).Token);
        Assert.Equal("queued", (await ReadNotificationAsync(database.ConnectionString, notificationId)).PushStatus);

        // Each retry uses a new scoped service/DbContext, like a restarted worker.
        Assert.Equal(0, await SendQueuedAsync(provider));
        Assert.Equal(0, await SendQueuedAsync(provider));
        Assert.Equal(4, sender.SendAttempts); // failing device: 3, successful device: 1
        Assert.Single(sender.Sent);
        Assert.Equal("failed", (await ReadNotificationAsync(database.ConnectionString, notificationId)).PushStatus);
    }

    [DbIntegrationFact]
    public async Task RetriesOnlyTheFailedDeviceThenCompletesDelivery()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender { FailToken = "fcm-token" };
        using var provider = BuildProvider(database.ConnectionString, sender);
        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
            db.MobileAccountSessions.Add(Session(accountId, "second-phone"));
            await db.SaveChangesAsync();
        }
        var id = await InsertNotificationAsync(database.ConnectionString, accountId, "queued", 0);
        Assert.Equal(0, await SendQueuedAsync(provider));
        sender.FailToken = null;
        Assert.Equal(1, await SendQueuedAsync(provider));
        Assert.Equal(3, sender.SendAttempts);
        Assert.Equal(2, sender.Sent.Count);
        Assert.Single(sender.Sent, message => message.Token == "second-phone");
        var row = await ReadNotificationAsync(database.ConnectionString, id);
        Assert.Equal("sent", row.PushStatus);
        using var check = provider.CreateScope();
        var stored = await check.ServiceProvider.GetRequiredService<Patrol360DbContext>().MobileNotifications.FindAsync(id);
        Assert.Equal(2, stored!.PushDeliveredTokenHashes.Length);
        Assert.All(stored.PushDeliveredTokenHashes, hash => Assert.Equal(64, hash.Length));
        Assert.All(sender.Sent, message =>
        {
            Assert.Equal(id.ToString(), message.Data["tag"]);
            Assert.Equal("Test message", message.Data["message"]);
            Assert.Equal("patrol360", message.Data["channelId"]);
        });
    }

    [DbIntegrationFact]
    public async Task UnregisteredDeviceDoesNotRepeatPushOnHealthyDevice()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender { RejectToken = "fcm-token" };
        using var provider = BuildProvider(database.ConnectionString, sender);
        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
            db.MobileAccountSessions.Add(Session(accountId, "second-phone"));
            await db.SaveChangesAsync();
        }
        var id = await InsertNotificationAsync(database.ConnectionString, accountId, "queued", 0);
        Assert.Equal(1, await SendQueuedAsync(provider));
        Assert.Equal(0, await SendQueuedAsync(provider));
        Assert.Single(sender.Sent);
        Assert.Equal("sent", (await ReadNotificationAsync(database.ConnectionString, id)).PushStatus);
        using var check = provider.CreateScope();
        var revoked = check.ServiceProvider.GetRequiredService<Patrol360DbContext>().MobileAccountSessions
            .Single(session => session.PushToken == "fcm-token");
        Assert.NotNull(revoked.PushTokenRevokedAt);
    }

    [DbIntegrationFact]
    public async Task OnlyUnregisteredDevicesLeaveNotificationAvailableForSync()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender { RejectToken = "fcm-token" };
        using var provider = BuildProvider(database.ConnectionString, sender);
        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        var id = await InsertNotificationAsync(database.ConnectionString, accountId, "queued", 0);
        Assert.Equal(0, await SendQueuedAsync(provider));
        Assert.Equal(0, await SendQueuedAsync(provider));
        Assert.Equal(1, sender.SendAttempts);
        var row = await ReadNotificationAsync(database.ConnectionString, id);
        Assert.Equal("waitingSync", row.PushStatus);
        Assert.Equal(0, row.PushAttemptCount);
        using var check = provider.CreateScope();
        Assert.False(check.ServiceProvider.GetRequiredService<Patrol360DbContext>().Database.HasPendingModelChanges());
    }

    [DbIntegrationFact]
    public async Task DoesNotUseSnapshotTokenAfterTheSessionWasRevoked()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender();
        using var provider = BuildProvider(database.ConnectionString, sender);
        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
            foreach (var session in db.MobileAccountSessions.Where(row => row.MobileAccountId == accountId)) session.RevokedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
        }
        var notificationId = await InsertNotificationAsync(database.ConnectionString, accountId, "queued", 0);
        Assert.Equal(0, await SendQueuedAsync(provider));
        Assert.Empty(sender.Sent);
        Assert.Equal("waitingSync", (await ReadNotificationAsync(database.ConnectionString, notificationId)).PushStatus);
    }

    [DbIntegrationFact]
    public async Task ConcurrentWorkersDoNotSendTheSameNotificationTwice()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender();
        using var provider = BuildProvider(database.ConnectionString, sender);
        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        await InsertNotificationAsync(database.ConnectionString, accountId, "queued", 0);
        var results = await Task.WhenAll(SendQueuedAsync(provider), SendQueuedAsync(provider));
        Assert.Equal(1, results.Sum());
        Assert.Single(sender.Sent);
    }

    [DbIntegrationFact]
    public async Task StaleWorkerClaimRetainsReceiptsAndSendsOnlyToRemainingDevices()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender();
        using var provider = BuildProvider(database.ConnectionString, sender);
        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        var id = await InsertNotificationAsync(database.ConnectionString, accountId, "sending", 1,
            DateTimeOffset.UtcNow.AddMinutes(-10));
        using (var scope = provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
            var row = await db.MobileNotifications.FindAsync(id);
            row!.PushDeliveredTokenHashes = [Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("fcm-token")))];
            db.MobileAccountSessions.Add(Session(accountId, "second-phone"));
            await db.SaveChangesAsync();
        }
        Assert.Equal(1, await SendQueuedAsync(provider));
        Assert.Equal("second-phone", Assert.Single(sender.Sent).Token);
        Assert.Equal("sent", (await ReadNotificationAsync(database.ConnectionString, id)).PushStatus);
    }

    private static MobileAccountSessionEntity Session(Guid accountId, string token, bool revoked = false, bool expired = false) => new()
    {
        Id = Guid.NewGuid(), MobileAccountId = accountId, DeviceId = Guid.NewGuid().ToString(), PushToken = token,
        CreatedAt = DateTimeOffset.UtcNow, LastSeenAt = DateTimeOffset.UtcNow,
        ExpiresAt = DateTimeOffset.UtcNow.AddHours(1), RefreshExpiresAt = DateTimeOffset.UtcNow.AddDays(expired ? -1 : 30),
        RevokedAt = revoked ? DateTimeOffset.UtcNow : null
    };
    [DbIntegrationFact]
    public async Task QueuedNotificationIsClaimedAndSentOnce()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender();
        using var provider = BuildProvider(database.ConnectionString, sender);

        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        var notificationId = await InsertNotificationAsync(database.ConnectionString, accountId, "queued", 0);

        var firstRun = await SendQueuedAsync(provider);
        var secondRun = await SendQueuedAsync(provider);
        var row = await ReadNotificationAsync(database.ConnectionString, notificationId);

        Assert.Equal(1, firstRun);
        Assert.Equal(0, secondRun);
        Assert.Single(sender.Sent);
        Assert.Equal("sent", row.PushStatus);
        Assert.Equal(1, row.PushAttemptCount);
        Assert.NotNull(row.PushSentAt);
        Assert.Null(row.PushClaimedAt);
        Assert.Equal(string.Empty, row.PushLastError);
    }

    [DbIntegrationFact]
    public async Task StaleSendingNotificationReturnsToQueuedAndSends()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender();
        using var provider = BuildProvider(database.ConnectionString, sender);

        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        var notificationId = await InsertNotificationAsync(
            database.ConnectionString,
            accountId,
            "sending",
            1,
            DateTimeOffset.UtcNow.AddMinutes(-10));

        var sent = await SendQueuedAsync(provider);
        var row = await ReadNotificationAsync(database.ConnectionString, notificationId);

        Assert.Equal(1, sent);
        Assert.Single(sender.Sent);
        Assert.Equal("sent", row.PushStatus);
        Assert.Equal(2, row.PushAttemptCount);
        Assert.Null(row.PushClaimedAt);
    }

    [DbIntegrationFact]
    public async Task FailedPushReturnsToQueuedUntilRetryLimit()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender { ThrowOnSend = true };
        using var provider = BuildProvider(database.ConnectionString, sender);

        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        var notificationId = await InsertNotificationAsync(database.ConnectionString, accountId, "queued", 0);

        var sent = await SendQueuedAsync(provider);
        var row = await ReadNotificationAsync(database.ConnectionString, notificationId);

        Assert.Equal(0, sent);
        Assert.Equal(1, sender.SendAttempts);
        Assert.Equal("queued", row.PushStatus);
        Assert.Equal(1, row.PushAttemptCount);
        Assert.Null(row.PushClaimedAt);
        Assert.NotEqual(string.Empty, row.PushLastError);
    }

    [DbIntegrationFact]
    public async Task FailedPushMovesToFailedAtRetryLimit()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var sender = new RecordingPushSender { ThrowOnSend = true };
        using var provider = BuildProvider(database.ConnectionString, sender);

        await provider.InitializePatrolDatabaseAsync();
        var accountId = CreateMobileAccount(provider);
        var notificationId = await InsertNotificationAsync(database.ConnectionString, accountId, "queued", 2);

        var sent = await SendQueuedAsync(provider);
        var row = await ReadNotificationAsync(database.ConnectionString, notificationId);

        Assert.Equal(0, sent);
        Assert.Equal(1, sender.SendAttempts);
        Assert.Equal("failed", row.PushStatus);
        Assert.Equal(3, row.PushAttemptCount);
        Assert.Null(row.PushClaimedAt);
        Assert.NotEqual(string.Empty, row.PushLastError);
    }

    private static ServiceProvider BuildProvider(string connectionString, IMobilePushSender sender)
    {
        var services = new ServiceCollection();
        services.AddSingleton(sender);
        services.AddLogging();

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Patrol360"] = connectionString,
                ["Patrol360:BootstrapAdminPassword"] = "Patrol360!",
                ["Patrol360:SeedDemoData"] = "false",
            })
            .Build();

        services.AddPatrolInfrastructure(configuration);
        services.AddSingleton<IConfiguration>(configuration);
        return services.BuildServiceProvider();
    }

    private static Guid CreateMobileAccount(ServiceProvider provider)
    {
        using var scope = provider.CreateScope();
        var accounts = scope.ServiceProvider.GetRequiredService<IMobileAccountService>();
        var created = accounts.CreateAccount(new CreateMobileAccountDto(
            null,
            "selected",
            $"push_{Guid.NewGuid():N}"[..18],
            "mobile",
            BindEmployee: false,
            RestrictToBoundDevice: false,
            TemporaryPassword: false,
            Password: "Patrol360!",
            ConfirmPassword: "Patrol360!",
            RequirePasswordChange: false));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Account);
        var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
        db.MobileAccountSessions.Add(Session(created.Account!.Id, "fcm-token"));
        db.SaveChanges();
        return created.Account!.Id;
    }

    private static async Task<int> SendQueuedAsync(ServiceProvider provider)
    {
        using var scope = provider.CreateScope();
        var delivery = scope.ServiceProvider.GetRequiredService<IMobilePushDeliveryService>();
        return await delivery.SendQueuedAsync(CancellationToken.None);
    }

    private static async Task<Guid> InsertNotificationAsync(
        string connectionString,
        Guid accountId,
        string status,
        int attemptCount,
        DateTimeOffset? claimedAt = null)
    {
        var notificationId = Guid.NewGuid();
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO mobile_notifications (
                id,
                mobile_account_id,
                employee_id,
                notification_type,
                title,
                message,
                entity_type,
                entity_id,
                idempotency_key,
                push_status,
                push_token_snapshot,
                push_attempt_count,
                push_last_error,
                push_sent_at,
                push_claimed_at,
                created_at,
                read_at
            )
            VALUES (
                @id,
                @account_id,
                NULL,
                'patrol_request',
                'Test push',
                'Test message',
                'patrolRequest',
                'request-1',
                @idempotency_key,
                @push_status,
                'fcm-token',
                @attempt_count,
                '',
                NULL,
                @claimed_at,
                @created_at,
                NULL
            );
            """;
        command.Parameters.AddWithValue("id", notificationId);
        command.Parameters.AddWithValue("account_id", accountId);
        command.Parameters.AddWithValue("idempotency_key", $"push-{notificationId:N}");
        command.Parameters.AddWithValue("push_status", status);
        command.Parameters.AddWithValue("attempt_count", attemptCount);
        command.Parameters.AddWithValue("claimed_at", (object?)claimedAt ?? DBNull.Value);
        command.Parameters.AddWithValue("created_at", DateTimeOffset.UtcNow);
        await command.ExecuteNonQueryAsync();

        return notificationId;
    }

    private static async Task<NotificationRow> ReadNotificationAsync(string connectionString, Guid notificationId)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            SELECT push_status, push_attempt_count, push_last_error, push_sent_at, push_claimed_at
            FROM mobile_notifications
            WHERE id = @id;
            """;
        command.Parameters.AddWithValue("id", notificationId);

        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());

        return new NotificationRow(
            reader.GetString(0),
            reader.GetInt32(1),
            reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetFieldValue<DateTimeOffset>(3),
            reader.IsDBNull(4) ? null : reader.GetFieldValue<DateTimeOffset>(4));
    }

    private sealed class RecordingPushSender : IMobilePushSender
    {
        public bool IsConfigured => true;

        public bool ThrowOnSend { get; init; }
        public string? FailToken { get; set; }
        public string? RejectToken { get; init; }
        public Func<Task>? BeforeSend { get; set; }

        public int SendAttempts { get; private set; }

        public List<MobilePushMessage> Sent { get; } = [];

        public async Task SendAsync(MobilePushMessage message, CancellationToken cancellationToken)
        {
            if (BeforeSend is not null) await BeforeSend();
            SendAttempts += 1;
            if (message.Token == RejectToken) throw new MobilePushTokenRejectedException("NotRegistered");
            if (ThrowOnSend || message.Token == FailToken)
            {
                throw new InvalidOperationException("FCM failed");
            }

            Sent.Add(message);
        }
    }

    private sealed record NotificationRow(
        string PushStatus,
        int PushAttemptCount,
        string PushLastError,
        DateTimeOffset? PushSentAt,
        DateTimeOffset? PushClaimedAt);
}

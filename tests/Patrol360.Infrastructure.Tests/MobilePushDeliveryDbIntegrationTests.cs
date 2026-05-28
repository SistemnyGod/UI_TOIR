using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class MobilePushDeliveryDbIntegrationTests
{
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

        public int SendAttempts { get; private set; }

        public List<MobilePushMessage> Sent { get; } = [];

        public Task SendAsync(MobilePushMessage message, CancellationToken cancellationToken)
        {
            SendAttempts += 1;
            if (ThrowOnSend)
            {
                throw new InvalidOperationException("FCM failed");
            }

            Sent.Add(message);
            return Task.CompletedTask;
        }
    }

    private sealed record NotificationRow(
        string PushStatus,
        int PushAttemptCount,
        string PushLastError,
        DateTimeOffset? PushSentAt,
        DateTimeOffset? PushClaimedAt);
}

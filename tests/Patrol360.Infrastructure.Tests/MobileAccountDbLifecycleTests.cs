using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class MobileAccountDbLifecycleTests
{
    [DbIntegrationFact]
    public async Task MobileAccountLifecyclePersistsThroughPostgres()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var suffix = Guid.NewGuid().ToString("N")[..8];
        var firstEmployee = UseEmployees(provider, employees => CreateEmployee(employees, $"Mobile Test One {suffix}", $"MOB-{suffix}-1"));
        var secondEmployee = UseEmployees(provider, employees => CreateEmployee(employees, $"Mobile Test Two {suffix}", $"MOB-{suffix}-2"));

        var created = UseMobileAccounts(provider, mobileAccounts => mobileAccounts.CreateAccount(new CreateMobileAccountDto(
            firstEmployee.FullName,
            "selected",
            $"mobile_{suffix}",
            "Маршрутный обходчик",
            BindEmployee: true,
            RestrictToBoundDevice: false,
            TemporaryPassword: true)));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Account);
        Assert.False(string.IsNullOrWhiteSpace(created.TemporaryPassword));
        Assert.Contains(firstEmployee.Id, created.Account!.BoundEmployeeIds);

        var accountId = created.Account.Id;
        var attached = UseMobileAccounts(provider, mobileAccounts => mobileAccounts.AttachEmployee(
            accountId,
            new AttachMobileAccountEmployeeDto(secondEmployee.Id, null)));

        Assert.True(attached.Succeeded);
        Assert.Contains(secondEmployee.Id, attached.Account!.BoundEmployeeIds);

        var updated = UseMobileAccounts(provider, mobileAccounts => mobileAccounts.UpdateAccount(
            accountId,
            new UpdateMobileAccountDto($"mobile_{suffix}_updated", "Оператор", "Активен")));

        Assert.True(updated.Succeeded);
        Assert.Equal($"mobile_{suffix}_updated", updated.Account!.Login);
        Assert.Equal("Оператор", updated.Account.Role);

        var blocked = UseMobileAccounts(provider, mobileAccounts => mobileAccounts.BlockAccount(accountId));
        Assert.True(blocked.Succeeded);
        Assert.Equal("Заблокирован", blocked.Account!.Status);

        var unblocked = UseMobileAccounts(provider, mobileAccounts => mobileAccounts.UnblockAccount(accountId));
        Assert.True(unblocked.Succeeded);
        Assert.Equal("Активен", unblocked.Account!.Status);

        await database.InsertSessionAsync(accountId);

        var sessions = UseMobileAccounts(provider, mobileAccounts => mobileAccounts.GetSessions(accountId));
        Assert.Single(sessions);
        Assert.Equal("Android", sessions[0].Platform);

        var reset = UseMobileAccounts(provider, mobileAccounts => mobileAccounts.ResetPassword(accountId));
        Assert.NotNull(reset);
        Assert.False(string.IsNullOrWhiteSpace(reset!.TemporaryPassword));

        var firstDetach = UseMobileAccounts(provider, mobileAccounts => mobileAccounts.DetachEmployee(accountId, firstEmployee.Id));
        Assert.True(firstDetach.Succeeded);
        Assert.DoesNotContain(firstEmployee.Id, firstDetach.Account!.BoundEmployeeIds);
        Assert.Contains(secondEmployee.Id, firstDetach.Account.BoundEmployeeIds);

        var secondDetach = UseMobileAccounts(provider, mobileAccounts => mobileAccounts.DetachEmployee(accountId, secondEmployee.Id));
        Assert.True(secondDetach.Succeeded);
        Assert.Empty(secondDetach.Account!.BoundEmployeeIds);
        Assert.Equal("Не привязан", secondDetach.Account.Status);

        var securityEvents = UseMobileAccounts(provider, mobileAccounts => mobileAccounts.GetSecurityEvents(accountId));
        Assert.Contains(securityEvents, item => item.EventType == "mobile_account.updated");
        Assert.Contains(securityEvents, item => item.EventType == "mobile_account.blocked");
        Assert.Contains(securityEvents, item => item.EventType == "mobile_account.unblocked");
        Assert.Contains(securityEvents, item => item.EventType == "mobile_account.password_reset");
        Assert.Contains(securityEvents, item => item.EventType == "mobile_account.employee_detached");

        Assert.True(UseMobileAccounts(provider, mobileAccounts => mobileAccounts.DeleteAccount(accountId)));
        Assert.Null(UseMobileAccounts(provider, mobileAccounts => mobileAccounts.GetAccount(accountId)));
    }

    private static ServiceProvider BuildProvider(string connectionString)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Patrol360"] = connectionString,
            })
            .Build();

        services.AddPatrolInfrastructure(configuration);
        services.AddSingleton<IConfiguration>(configuration);

        return services.BuildServiceProvider();
    }

    private static EmployeeDto CreateEmployee(IEmployeeDirectoryService employees, string fullName, string personnelNo)
    {
        var result = employees.CreateEmployee(new CreateEmployeeDto(
            fullName,
            personnelNo,
            "Маршрутный обходчик",
            "Тестовая служба",
            "Активен",
            "День",
            HasMobileAccount: false));

        Assert.True(result.Succeeded);
        Assert.NotNull(result.Employee);
        return result.Employee;
    }

    private static T UseEmployees<T>(ServiceProvider provider, Func<IEmployeeDirectoryService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IEmployeeDirectoryService>());
    }

    private static T UseMobileAccounts<T>(ServiceProvider provider, Func<IMobileAccountService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IMobileAccountService>());
    }
}

internal sealed class TemporaryPostgresDatabase : IAsyncDisposable
{
    private const string DefaultAdminConnectionString =
        "Host=localhost;Port=5432;Database=postgres;Username=patrol360;Password=patrol360_dev";

    private readonly string adminConnectionString;
    private readonly string databaseName;

    private TemporaryPostgresDatabase(string adminConnectionString, string databaseName, string connectionString)
    {
        this.adminConnectionString = adminConnectionString;
        this.databaseName = databaseName;
        ConnectionString = connectionString;
    }

    public string ConnectionString { get; }

    public static async Task<TemporaryPostgresDatabase> CreateAsync()
    {
        var adminConnectionString =
            Environment.GetEnvironmentVariable("PATROL360_DB_INTEGRATION_ADMIN_CONNECTION_STRING")
            ?? DefaultAdminConnectionString;
        var databaseName = $"patrol360_dbtests_{Guid.NewGuid():N}";
        var testConnectionBuilder = new NpgsqlConnectionStringBuilder(adminConnectionString)
        {
            Database = databaseName,
        };

        await using var connection = new NpgsqlConnection(adminConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"CREATE DATABASE {QuoteIdentifier(databaseName)}";
        await command.ExecuteNonQueryAsync();

        return new TemporaryPostgresDatabase(adminConnectionString, databaseName, testConnectionBuilder.ConnectionString);
    }

    public async Task InsertSessionAsync(Guid accountId)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO mobile_account_sessions (
                id,
                mobile_account_id,
                status,
                device,
                platform,
                app_version,
                ip_address,
                last_seen_at
            )
            VALUES (
                @id,
                @account_id,
                'Онлайн',
                'Xiaomi Redmi Note 12',
                'Android',
                '2.3.0',
                '127.0.0.1',
                @last_seen_at
            );
            """;
        command.Parameters.AddWithValue("id", Guid.NewGuid());
        command.Parameters.AddWithValue("account_id", accountId);
        command.Parameters.AddWithValue("last_seen_at", DateTimeOffset.UtcNow);
        await command.ExecuteNonQueryAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await using var connection = new NpgsqlConnection(adminConnectionString);
        await connection.OpenAsync();

        await using (var terminateCommand = connection.CreateCommand())
        {
            terminateCommand.CommandText =
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = @database_name
                  AND pid <> pg_backend_pid();
                """;
            terminateCommand.Parameters.AddWithValue("database_name", databaseName);
            await terminateCommand.ExecuteNonQueryAsync();
        }

        await using var dropCommand = connection.CreateCommand();
        dropCommand.CommandText = $"DROP DATABASE IF EXISTS {QuoteIdentifier(databaseName)}";
        await dropCommand.ExecuteNonQueryAsync();
    }

    private static string QuoteIdentifier(string value) => "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
}

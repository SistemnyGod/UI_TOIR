using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class MobileAppDbIntegrationTests
{
    [DbIntegrationFact]
    public async Task MobileLoginBootstrapAndOutboxArePersisted()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();
        var account = UseMobileAccounts(provider, accounts => accounts.CreateAccount(new CreateMobileAccountDto(
            "Петров Иван Александрович",
            "selected",
            $"mobile_{Guid.NewGuid():N}"[..18],
            "Маршрутный обходчик",
            BindEmployee: true,
            RestrictToBoundDevice: false,
            TemporaryPassword: false,
            Password: "Patrol360!",
            ConfirmPassword: "Patrol360!",
            RequirePasswordChange: false)));

        Assert.True(account.Succeeded);
        Assert.NotNull(account.Account);

        var route = UseRoutes(provider, routes => routes.GetRoutes().First(item => item.Points.Any(point => !string.IsNullOrWhiteSpace(point.NfcCode))));
        var mobileRequestId = CreateUnassignedPatrolRequest(database.ConnectionString, account.Account!.BoundEmployeeIds[0], account.Account.BoundEmployees[0], route.Id, route.Name);

        var login = UseMobileApp(provider, mobile => mobile.Login(new MobileLoginRequestDto(
            account.Account!.Login,
            "Patrol360!",
            "kenshi-c1s-test",
            "Kenshi Armor C1s",
            "Android",
            "0.1.0"), "127.0.0.1"));

        Assert.True(login.Succeeded);
        Assert.NotNull(login.Session);
        Assert.Equal("kenshi-c1s-test", login.Session!.Device.DeviceId);

        var bootstrap = UseMobileApp(provider, mobile => mobile.GetBootstrap(login.Session.AccessToken));
        Assert.NotNull(bootstrap);
        Assert.NotEmpty(bootstrap!.RequestBoard);
        Assert.NotEmpty(bootstrap.Routes);
        Assert.NotEmpty(bootstrap.Points);

        var boardItem = bootstrap.RequestBoard.First(item => item.RequestId == mobileRequestId);
        var clientAssignmentId = Guid.NewGuid().ToString();
        var command = new MobileOutboxCommandDto(
            "op-test-1",
            "takePatrolRequest",
            "patrolRequest",
            clientAssignmentId,
            boardItem.RequestId.ToString(),
            new Dictionary<string, object?>
            {
                ["requestId"] = boardItem.RequestId,
                ["routeId"] = boardItem.RouteId,
                ["requestRevision"] = boardItem.Revision,
                ["takenAtLocal"] = DateTimeOffset.UtcNow,
            },
            DateTimeOffset.UtcNow,
            0,
            "pending");
        var firstOutbox = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([command])));
        var repeatedOutbox = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([command])));

        Assert.Single(firstOutbox);
        Assert.Equal("accepted", firstOutbox[0].Status);
        Assert.False(string.IsNullOrWhiteSpace(firstOutbox[0].ServerEntityId));
        Assert.Single(repeatedOutbox);
        Assert.Equal("duplicate", repeatedOutbox[0].Status);

        var assignmentId = Guid.Parse(firstOutbox[0].ServerEntityId!);
        var routePoint = bootstrap.Points.First(point =>
            point.RouteId == boardItem.RouteId && !string.IsNullOrWhiteSpace(point.NfcUidHash));
        var scanAccepted = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([
                new MobileOutboxCommandDto(
                    "op-scan-accepted",
                    "scanPatrolPointNfc",
                    "patrolPoint",
                    null,
                    routePoint.PointId.ToString(),
                    new Dictionary<string, object?>
                    {
                        ["assignmentId"] = assignmentId,
                        ["pointId"] = routePoint.PointId,
                        ["nfcUidHash"] = routePoint.NfcUidHash,
                        ["scannedAtLocal"] = DateTimeOffset.UtcNow,
                    },
                    DateTimeOffset.UtcNow,
                    0,
                    "pending")
            ])));

        Assert.Single(scanAccepted);
        Assert.Equal("accepted", scanAccepted[0].Status);

        var scanRejected = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([
                new MobileOutboxCommandDto(
                    "op-scan-rejected",
                    "scanPatrolPointNfc",
                    "patrolPoint",
                    null,
                    routePoint.PointId.ToString(),
                    new Dictionary<string, object?>
                    {
                        ["assignmentId"] = assignmentId,
                        ["pointId"] = routePoint.PointId,
                        ["nfcUidHash"] = "WRONG-TAG",
                        ["scannedAtLocal"] = DateTimeOffset.UtcNow,
                    },
                    DateTimeOffset.UtcNow,
                    0,
                    "pending")
            ])));

        Assert.Single(scanRejected);
        Assert.Equal("rejected", scanRejected[0].Status);

        var qrAccepted = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([
                new MobileOutboxCommandDto(
                    "op-qr-accepted",
                    "scanPatrolPointQr",
                    "patrolPoint",
                    null,
                    routePoint.PointId.ToString(),
                    new Dictionary<string, object?>
                    {
                        ["assignmentId"] = assignmentId,
                        ["pointId"] = routePoint.PointId,
                        ["qrCodeHash"] = routePoint.QrCodeHash,
                        ["scannedAtLocal"] = DateTimeOffset.UtcNow,
                    },
                    DateTimeOffset.UtcNow,
                    0,
                    "pending")
            ])));

        Assert.Single(qrAccepted);
        Assert.Equal("accepted", qrAccepted[0].Status);

        var qrRejected = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([
                new MobileOutboxCommandDto(
                    "op-qr-rejected",
                    "scanPatrolPointQr",
                    "patrolPoint",
                    null,
                    routePoint.PointId.ToString(),
                    new Dictionary<string, object?>
                    {
                        ["assignmentId"] = assignmentId,
                        ["pointId"] = routePoint.PointId,
                        ["qrCodeHash"] = "WRONG-QR",
                        ["scannedAtLocal"] = DateTimeOffset.UtcNow,
                    },
                    DateTimeOffset.UtcNow,
                    0,
                    "pending")
            ])));

        Assert.Single(qrRejected);
        Assert.Equal("rejected", qrRejected[0].Status);

        var issueWithoutComment = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([
                new MobileOutboxCommandDto(
                    "op-issue-rejected",
                    "markPatrolPointIssue",
                    "patrolPoint",
                    null,
                    routePoint.PointId.ToString(),
                    new Dictionary<string, object?>
                    {
                        ["assignmentId"] = assignmentId,
                        ["pointId"] = routePoint.PointId,
                        ["issueTypeId"] = "Неисправность",
                        ["comment"] = "",
                        ["photoClientFileIds"] = Array.Empty<string>(),
                        ["completedAtLocal"] = DateTimeOffset.UtcNow,
                    },
                    DateTimeOffset.UtcNow,
                    0,
                    "pending")
            ])));

        Assert.Single(issueWithoutComment);
        Assert.Equal("rejected", issueWithoutComment[0].Status);

        var capturedAtLocal = new DateTimeOffset(2026, 5, 26, 12, 45, 0, TimeSpan.FromHours(5));
        var upload = UseMobileApp(provider, mobile => mobile.UploadFile(
            login.Session.AccessToken,
            new MobileFileUploadCommand(
                "file-test-1",
                assignmentId,
                routePoint.PointId,
                null,
                "sha-test",
                3,
                capturedAtLocal,
                "test.jpg",
                "image/jpeg",
                new MemoryStream([1, 2, 3]))));
        var repeatedUpload = UseMobileApp(provider, mobile => mobile.UploadFile(
            login.Session.AccessToken,
            new MobileFileUploadCommand(
                "file-test-1",
                assignmentId,
                routePoint.PointId,
                null,
                "sha-test",
                3,
                DateTimeOffset.UtcNow,
                "test.jpg",
                "image/jpeg",
                new MemoryStream([1, 2, 3]))));

        Assert.NotNull(upload);
        Assert.Equal("uploaded", upload!.Status);
        Assert.NotNull(repeatedUpload);
        Assert.Equal("duplicate", repeatedUpload!.Status);

        var allPointResults = bootstrap.Points
            .Where(point => point.RouteId == boardItem.RouteId)
            .Select(point => new Dictionary<string, object?>
            {
                ["pointId"] = point.PointId,
                ["status"] = "ok",
                ["comment"] = "",
                ["issueTypeId"] = null,
                ["photoClientFileIds"] = point.PointId == routePoint.PointId ? new[] { "file-test-1" } : Array.Empty<string>(),
                ["confirmationType"] = "nfc",
                ["nfcUidHash"] = point.NfcUidHash,
                ["completedAtLocal"] = DateTimeOffset.UtcNow,
            })
            .ToArray();
        var completeCommand = new MobileOutboxCommandDto(
            "op-complete-accepted",
            "completePatrolAssignment",
            "patrolAssignment",
            assignmentId.ToString(),
            assignmentId.ToString(),
            new Dictionary<string, object?>
            {
                ["assignmentId"] = assignmentId,
                ["requestId"] = boardItem.RequestId,
                ["completedAtLocal"] = DateTimeOffset.UtcNow,
                ["baseRevision"] = firstOutbox[0].ServerRevision,
                ["summary"] = new Dictionary<string, object?>
                {
                    ["totalPoints"] = allPointResults.Length,
                    ["completedPoints"] = allPointResults.Length,
                    ["issueCount"] = 0,
                    ["deferredCount"] = 0,
                    ["photoCount"] = 1,
                },
                ["pointResults"] = allPointResults,
            },
            DateTimeOffset.UtcNow,
            0,
            "pending");
        var completeAccepted = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([completeCommand])));
        var completeDuplicate = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([completeCommand])));

        Assert.Single(completeAccepted);
        Assert.Equal("accepted", completeAccepted[0].Status);
        Assert.Single(completeDuplicate);
        Assert.Equal("duplicate", completeDuplicate[0].Status);

        var deferredComplete = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([
                new MobileOutboxCommandDto(
                    "op-complete-rejected",
                    "completePatrolAssignment",
                    "patrolAssignment",
                    assignmentId.ToString(),
                    assignmentId.ToString(),
                    new Dictionary<string, object?>
                    {
                        ["assignmentId"] = assignmentId,
                        ["requestId"] = boardItem.RequestId,
                        ["completedAtLocal"] = DateTimeOffset.UtcNow,
                        ["pointResults"] = new[]
                        {
                            new Dictionary<string, object?>
                            {
                                ["pointId"] = routePoint.PointId,
                                ["status"] = "deferred",
                                ["comment"] = "",
                                ["issueTypeId"] = null,
                                ["photoClientFileIds"] = Array.Empty<string>(),
                                ["confirmationType"] = "nfc",
                                ["nfcUidHash"] = routePoint.NfcUidHash,
                                ["completedAtLocal"] = DateTimeOffset.UtcNow,
                            }
                        },
                    },
                    DateTimeOffset.UtcNow,
                    0,
                    "pending")
            ])));

        Assert.Single(deferredComplete);
        Assert.Equal("rejected", deferredComplete[0].Status);

        var conflictCommand = command with { ClientOperationId = "op-test-2" };
        var conflictOutbox = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([conflictCommand])));

        Assert.Single(conflictOutbox);
        Assert.Equal("conflict", conflictOutbox[0].Status);

        var unsupportedOutbox = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([
                new MobileOutboxCommandDto(
                    "op-unsupported-command",
                    "unknownCommand",
                    "patrolAssignment",
                    assignmentId.ToString(),
                    assignmentId.ToString(),
                    new Dictionary<string, object?>(),
                    DateTimeOffset.UtcNow,
                    0,
                    "pending")
            ])));

        Assert.Single(unsupportedOutbox);
        Assert.Equal("rejected", unsupportedOutbox[0].Status);
        Assert.Null(unsupportedOutbox[0].RetryAfterSeconds);
        Assert.Contains("Unsupported mobile outbox command type", unsupportedOutbox[0].Message);
    }

    [DbIntegrationFact]
    public async Task MobileLoginRejectsBlockedAndUnlinkedAccounts()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var blockedAccount = UseMobileAccounts(provider, accounts => accounts.CreateAccount(new CreateMobileAccountDto(
            "Петров Иван Александрович",
            "selected",
            $"blocked_{Guid.NewGuid():N}"[..18],
            "Маршрутный обходчик",
            BindEmployee: true,
            RestrictToBoundDevice: false,
            TemporaryPassword: false,
            Password: "Patrol360!",
            ConfirmPassword: "Patrol360!",
            RequirePasswordChange: false)));
        Assert.True(blockedAccount.Succeeded);
        UseMobileAccounts(provider, accounts => accounts.BlockAccount(blockedAccount.Account!.Id));

        var blockedLogin = Login(provider, blockedAccount.Account!.Login, "Patrol360!");
        Assert.True(blockedLogin.Unauthorized);

        var unlinkedAccount = UseMobileAccounts(provider, accounts => accounts.CreateAccount(new CreateMobileAccountDto(
            null,
            "selected",
            $"unlinked_{Guid.NewGuid():N}"[..18],
            "Маршрутный обходчик",
            BindEmployee: false,
            RestrictToBoundDevice: false,
            TemporaryPassword: false,
            Password: "Patrol360!",
            ConfirmPassword: "Patrol360!",
            RequirePasswordChange: false)));
        Assert.True(unlinkedAccount.Succeeded);

        var unlinkedLogin = Login(provider, unlinkedAccount.Account!.Login, "Patrol360!");
        Assert.True(unlinkedLogin.Unauthorized);
        Assert.Empty(unlinkedLogin.Errors);
    }

    private static MobileAuthResult Login(ServiceProvider provider, string login, string password) =>
        UseMobileApp(provider, mobile => mobile.Login(new MobileLoginRequestDto(
            login,
            password,
            "kenshi-c1s-test",
            "Kenshi Armor C1s",
            "Android",
            "0.1.0"), "127.0.0.1"));

    private static ServiceProvider BuildProvider(string connectionString)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Patrol360"] = connectionString,
                ["Patrol360:SeedDemoData"] = "true",
            })
            .Build();

        services.AddPatrolInfrastructure(configuration);
        services.AddSingleton<IConfiguration>(configuration);

        return services.BuildServiceProvider();
    }

    private static T UseMobileAccounts<T>(ServiceProvider provider, Func<IMobileAccountService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IMobileAccountService>());
    }

    private static Guid CreateUnassignedPatrolRequest(
        string connectionString,
        Guid employeeId,
        string employeeName,
        Guid routeId,
        string routeName)
    {
        var requestId = Guid.NewGuid();
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO patrol_requests (
                id,
                number,
                employee_id,
                employee_name,
                route_id,
                route_name,
                source_result_id,
                scheduled_date,
                scheduled_time,
                notify_employee,
                notification_text,
                status,
                created_at,
                description
            )
            VALUES (
                @id,
                @number,
                @employee_id,
                @employee_name,
                @route_id,
                @route_name,
                NULL,
                @scheduled_date,
                @scheduled_time,
                false,
                '',
                'Новая',
                @created_at,
                'Mobile integration request'
            );
            """;
        command.Parameters.AddWithValue("id", requestId);
        command.Parameters.AddWithValue("number", $"MOB-{Guid.NewGuid():N}"[..18]);
        command.Parameters.AddWithValue("employee_id", employeeId);
        command.Parameters.AddWithValue("employee_name", employeeName);
        command.Parameters.AddWithValue("route_id", routeId);
        command.Parameters.AddWithValue("route_name", routeName);
        command.Parameters.AddWithValue("scheduled_date", DateOnly.FromDateTime(DateTime.UtcNow.Date));
        command.Parameters.AddWithValue("scheduled_time", TimeOnly.FromDateTime(DateTime.UtcNow));
        command.Parameters.AddWithValue("created_at", DateTimeOffset.UtcNow);
        command.ExecuteNonQuery();

        return requestId;
    }

    private static T UseRoutes<T>(ServiceProvider provider, Func<IRouteCatalogQuery, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IRouteCatalogQuery>());
    }

    private static T UseMobileApp<T>(ServiceProvider provider, Func<IMobileAppService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IMobileAppService>());
    }
}

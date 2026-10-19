using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Attachments;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

// Server side of mobile report auto-send: docs/mobile-report-autosend-2026-10-19.md.
public sealed partial class MobileAppDbIntegrationTests
{
    private const string PhotoSha256 = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";

    [DbIntegrationFact]
    public async Task BootstrapCarriesAutoSubmitDelayDueAtAndDeliveryCapabilities()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildReportDeliveryProvider(database.ConnectionString, new()
        {
            ["Patrol360:Mobile:ReportAutoSubmitDelayMinutes"] = "7",
            ["Patrol360:Mobile:PatrolDueGraceMinutes"] = "10",
        });
        await provider.InitializePatrolDatabaseAsync();
        var patrol = await ArrangeReportDeliveryPatrolAsync(provider, database.ConnectionString, start: false);

        var bootstrap = UseMobileApp(provider, mobile => mobile.GetBootstrap(patrol.Token))!;

        Assert.Equal(7, bootstrap.ReportAutoSubmitDelayMinutes);
        Assert.True(bootstrap.LateReportReview);
        Assert.True(bootstrap.DeferredReportPhotos);
        Assert.True(bootstrap.OutboxHeartbeat);
        var assignment = Assert.Single(bootstrap.Assignments, item => item.AssignmentId == patrol.AssignmentId);
        Assert.NotNull(assignment.PlannedAt);
        Assert.Equal(assignment.PlannedAt!.Value + TimeSpan.FromMinutes(45 + 10), assignment.DueAt);
    }

    [DbIntegrationFact]
    public async Task AutoSubmissionModeIsStoredForDispatcherWithoutChangingReportFingerprint()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildReportDeliveryProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var patrol = await ArrangeReportDeliveryPatrolAsync(provider, database.ConnectionString);

        var autoOperationId = Guid.NewGuid().ToString();
        var auto = SendPatrolCommand(provider, patrol, "completePatrolAssignment",
            BuildCompletePayload(patrol, extra: new() { ["submissionMode"] = "auto" }), autoOperationId);
        Assert.Equal("accepted", auto.Status);

        // A manual resend of the same results is still the same report.
        var manualOperationId = Guid.NewGuid().ToString();
        var manual = SendPatrolCommand(provider, patrol, "completePatrolAssignment",
            BuildCompletePayload(patrol, extra: new() { ["submissionMode"] = "manual" }), manualOperationId);
        Assert.Equal("duplicate", manual.Status);
        Assert.Equal(ReadOutboxPayloadFingerprint(database.ConnectionString, autoOperationId),
            ReadOutboxPayloadFingerprint(database.ConnectionString, manualOperationId));

        var results = UseResults(provider, query => query.GetResults(new ResultFilterDto(null, null, null, null, null, patrol.AssignmentId)));
        var result = Assert.Single(results);
        Assert.Equal("auto", result.SubmissionMode);
        Assert.False(result.LateReport);
        var detail = UseResults(provider, query => query.GetResult(result.Id))!;
        Assert.Equal("auto", detail.SubmissionMode);
        Assert.Contains("Отчёт отправлен телефоном автоматически", detail.Chronology);
    }

    [DbIntegrationFact]
    public async Task ClosedAssignmentResponsesKeepLegacyTextAndAddReasonCodes()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildReportDeliveryProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var patrol = await ArrangeReportDeliveryPatrolAsync(provider, database.ConnectionString);

        await SetAssignmentStatusAsync(database.ConnectionString, patrol, "Завершено");
        var report = SendPatrolCommand(provider, patrol, "completePatrolAssignment", BuildCompletePayload(patrol));
        Assert.Equal("rejected", report.Status);
        Assert.Equal("Patrol assignment must be in progress before report submit.", report.Message);
        Assert.Equal("assignmentClosed", report.ReasonCode);
        var point = SendPatrolCommand(provider, patrol, "markPatrolPointOk",
            new() { ["assignmentId"] = patrol.AssignmentId, ["pointId"] = patrol.PointId });
        Assert.Equal("conflict", point.Status);
        Assert.Equal("Patrol assignment is already closed.", point.Message);
        Assert.Equal("assignmentClosed", point.ReasonCode);

        await SetAssignmentStatusAsync(database.ConnectionString, patrol, "Требует решения диспетчера");
        var needsDecision = SendPatrolCommand(provider, patrol, "completePatrolAssignment", BuildCompletePayload(patrol));
        Assert.Equal("conflict", needsDecision.Status);
        Assert.Equal("Patrol request requires dispatcher decision.", needsDecision.Message);
        Assert.Equal("assignmentNeedsDecision", needsDecision.ReasonCode);

        await SetAssignmentStatusAsync(database.ConnectionString, patrol, "Принята");
        var notStarted = SendPatrolCommand(provider, patrol, "completePatrolAssignment", BuildCompletePayload(patrol));
        Assert.Equal("rejected", notStarted.Status);
        Assert.Equal("assignmentNotInProgress", notStarted.ReasonCode);
        Assert.Equal(0, CountPatrolResults(database.ConnectionString, patrol.AssignmentId));
    }

    [DbIntegrationFact]
    public async Task LateReportForCancelledAssignmentIsQueuedThenAppliedByDispatcher()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildReportDeliveryProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var patrol = await ArrangeReportDeliveryPatrolAsync(provider, database.ConnectionString);
        await SetAssignmentStatusAsync(database.ConnectionString, patrol, "Отменено");

        var payload = BuildCompletePayload(patrol, photoClientFileIds: ["late-photo-1"], extra: new()
        {
            ["lateReportPolicy"] = "review",
            ["submissionMode"] = "auto",
        });
        var queued = SendPatrolCommand(provider, patrol, "completePatrolAssignment", payload);
        Assert.Equal("accepted", queued.Status);
        Assert.Equal("lateReportQueued", queued.ReasonCode);
        Assert.Equal(patrol.AssignmentId.ToString(), queued.ServerEntityId);
        Assert.Equal("duplicate", SendPatrolCommand(provider, patrol, "completePatrolAssignment", payload).Status);
        Assert.Equal("Отменено", ReadAssignmentStatus(database.ConnectionString, patrol.AssignmentId));
        Assert.Equal(0, CountPatrolResults(database.ConnectionString, patrol.AssignmentId));

        var pending = Assert.Single(UseLateReports(provider, service => service.GetLateReports("pending", 50)));
        Assert.Equal("assignmentCancelled", pending.ReasonCode);
        Assert.Equal("auto", pending.SubmissionMode);
        Assert.Equal(1, pending.PointCount);
        Assert.Equal(1, pending.PhotoCount);
        Assert.Equal(1, pending.PendingPhotoCount);
        Assert.True(pending.CanApply);

        // The photo of a queued report still uploads although the assignment is cancelled.
        var upload = UploadPatrolPhoto(provider, patrol, "late-photo-1");
        Assert.Equal("uploaded", upload!.Status);
        Assert.Null(UploadPatrolPhoto(provider, patrol, "unrelated-photo"));

        var applied = UseLateReports(provider, service => service.ResolveLateReport(
            pending.Id, new PatrolLateReportResolutionRequestDto("apply", "Связь восстановлена"), "dispatcher"));
        Assert.Null(applied.ErrorCode);
        Assert.Equal("applied", applied.Report!.Status);
        Assert.Equal("Связь восстановлена", applied.Report.ResolutionComment);
        Assert.Equal("Завершено", ReadAssignmentStatus(database.ConnectionString, patrol.AssignmentId));
        Assert.Equal("Завершено", ReadPatrolRequestStatus(database.ConnectionString, patrol.RequestId));
        var result = Assert.Single(UseResults(provider, query => query.GetResults(new ResultFilterDto(null, null, null, null, null, patrol.AssignmentId))));
        Assert.True(result.LateReport);
        Assert.Equal("auto", result.SubmissionMode);
        Assert.Equal(1, result.Photos);
        Assert.Equal(0, result.PendingPhotos);

        var again = UseLateReports(provider, service => service.ResolveLateReport(
            pending.Id, new PatrolLateReportResolutionRequestDto("dismiss", null), "dispatcher"));
        Assert.Equal("alreadyResolved", again.ErrorCode);
    }

    [DbIntegrationFact]
    public async Task LateReportCannotOverwriteAnAcceptedReport()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildReportDeliveryProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var patrol = await ArrangeReportDeliveryPatrolAsync(provider, database.ConnectionString);
        Assert.Equal("accepted", SendPatrolCommand(provider, patrol, "completePatrolAssignment", BuildCompletePayload(patrol)).Status);

        var different = BuildCompletePayload(patrol, status: "issue");
        var legacy = SendPatrolCommand(provider, patrol, "completePatrolAssignment", different);
        Assert.Equal("conflict", legacy.Status);
        Assert.Equal("assignmentClosed", legacy.ReasonCode);

        different["lateReportPolicy"] = "review";
        var queued = SendPatrolCommand(provider, patrol, "completePatrolAssignment", different);
        Assert.Equal("accepted", queued.Status);
        Assert.Equal("lateReportQueued", queued.ReasonCode);
        var late = Assert.Single(UseLateReports(provider, service => service.GetLateReports(null, 50)));
        Assert.Equal("assignmentClosed", late.ReasonCode);
        Assert.False(late.CanApply);

        var apply = UseLateReports(provider, service => service.ResolveLateReport(
            late.Id, new PatrolLateReportResolutionRequestDto("apply", null), "dispatcher"));
        Assert.Equal("assignmentHasReport", apply.ErrorCode);
        var dismiss = UseLateReports(provider, service => service.ResolveLateReport(
            late.Id, new PatrolLateReportResolutionRequestDto("dismiss", "Дубль"), "dispatcher"));
        Assert.Equal("dismissed", dismiss.Report!.Status);
        Assert.Equal("ok", ReadPatrolResultStatus(database.ConnectionString, patrol.AssignmentId, patrol.PointId));
        Assert.Empty(UseLateReports(provider, service => service.GetLateReports("pending", 50)));
    }

    [DbIntegrationFact]
    public async Task DeferredPhotosAreAcceptedAndLinkedWhenTheyArrive()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildReportDeliveryProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var patrol = await ArrangeReportDeliveryPatrolAsync(provider, database.ConnectionString);

        var withoutMode = SendPatrolCommand(provider, patrol, "completePatrolAssignment",
            BuildCompletePayload(patrol, photoClientFileIds: ["deferred-photo-1"]));
        Assert.Equal("rejected", withoutMode.Status);

        var operationId = Guid.NewGuid().ToString();
        var deferred = BuildCompletePayload(patrol, photoClientFileIds: ["deferred-photo-1"], extra: new() { ["photoUploadMode"] = "deferred" });
        Assert.Equal("accepted", SendPatrolCommand(provider, patrol, "completePatrolAssignment", deferred, operationId).Status);
        var waiting = Assert.Single(UseResults(provider, query => query.GetResults(new ResultFilterDto(null, null, null, null, null, patrol.AssignmentId))));
        Assert.Equal(0, waiting.Photos);
        Assert.Equal(1, waiting.PendingPhotos);

        Assert.Equal("uploaded", UploadPatrolPhoto(provider, patrol, "deferred-photo-1")!.Status);
        Assert.Equal("duplicate", UploadPatrolPhoto(provider, patrol, "deferred-photo-1")!.Status);
        var linked = Assert.Single(UseResults(provider, query => query.GetResults(new ResultFilterDto(null, null, null, null, null, patrol.AssignmentId))));
        Assert.Equal(1, linked.Photos);
        Assert.Equal(0, linked.PendingPhotos);
        var detail = UseResults(provider, query => query.GetResult(linked.Id))!;
        Assert.Single(detail.Attachments);

        // Retrying the original command after linking is still the same report.
        Assert.Equal("duplicate", SendPatrolCommand(provider, patrol, "completePatrolAssignment", deferred).Status);
        Assert.Equal("duplicate", SendPatrolCommand(provider, patrol, "completePatrolAssignment", deferred, operationId).Status);
    }

    [DbIntegrationFact]
    public async Task OutboxHeartbeatIsVisibleInDeviceHealth()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildReportDeliveryProvider(database.ConnectionString, new()
        {
            ["Patrol360:Mobile:HeartbeatIntervalSeconds"] = "120",
        });
        await provider.InitializePatrolDatabaseAsync();
        var patrol = await ArrangeReportDeliveryPatrolAsync(provider, database.ConnectionString, start: false);

        var receipt = UseMobileApp(provider, mobile => mobile.SaveHeartbeat(patrol.Token,
            new MobileHeartbeatRequestDto(3, OldestPendingCommandAgeSeconds: 600, FailedCommandCount: 1, DeviceId: "kenshi-c1s-test")));
        Assert.NotNull(receipt);
        Assert.Equal(120, receipt.NextHeartbeatSeconds);
        Assert.Throws<ArgumentException>(() => UseMobileApp(provider, mobile => mobile.SaveHeartbeat(patrol.Token,
            new MobileHeartbeatRequestDto(1, DeviceId: "other-device"))));
        Assert.Null(UseMobileApp(provider, mobile => mobile.SaveHeartbeat("not-a-token", new MobileHeartbeatRequestDto(1))));

        var health = Assert.Single(UseMobileSyncAdmin(provider, admin => admin.GetDeviceHealth()), item => item.MobileAccountId == patrol.AccountId);
        Assert.Equal(3, health.HeartbeatPendingCount);
        Assert.Equal(600, health.HeartbeatOldestPendingAgeSeconds);
        Assert.Equal(1, health.HeartbeatFailedCount);
        Assert.NotNull(health.HeartbeatAt);

        UseMobileApp(provider, mobile => mobile.SaveHeartbeat(patrol.Token, new MobileHeartbeatRequestDto(0, OldestPendingCommandAgeSeconds: 600)));
        health = Assert.Single(UseMobileSyncAdmin(provider, admin => admin.GetDeviceHealth()), item => item.MobileAccountId == patrol.AccountId);
        Assert.Equal(0, health.HeartbeatPendingCount);
        Assert.Null(health.HeartbeatOldestPendingAgeSeconds);
    }

    private sealed record ReportDeliveryPatrol(
        string Token,
        Guid AccountId,
        Guid AssignmentId,
        Guid RequestId,
        Guid PointId,
        int RouteVersionNo,
        long Revision);

    private static async Task<ReportDeliveryPatrol> ArrangeReportDeliveryPatrolAsync(ServiceProvider provider, string connectionString, bool start = true)
    {
        var options = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(connectionString).Options;
        Guid employeeId, routeId, assignmentId;
        string employeeName;
        await using (var db = new Patrol360DbContext(options))
        {
            var employee = new EmployeeEntity { Id = Guid.NewGuid(), FullName = "Report delivery employee", PersonnelNo = Guid.NewGuid().ToString(), Position = "Test", Department = "Test", Status = "active", Shift = "Day", LastSeenAt = DateTimeOffset.UtcNow };
            var route = new RouteEntity { Id = Guid.NewGuid(), Name = "Report delivery route", VersionNo = 1, Status = "active", Duration = "00:45", CreatedAt = DateTimeOffset.UtcNow };
            employeeId = employee.Id; employeeName = employee.FullName; routeId = route.Id;
            db.Employees.Add(employee); db.Routes.Add(route);
            db.RoutePoints.Add(new() { Id = Guid.NewGuid(), RouteId = routeId, Name = "Delivery point", SequenceNo = 1, IsRequired = true, Status = "active" });
            await db.SaveChangesAsync();
            using var cache = new MemoryCache(new MemoryCacheOptions());
            var store = new EfPatrolStore(db, cache, new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg")), new LocalAttachmentStore(new ConfigurationBuilder().Build()));
            var created = store.Create(new CreatePatrolRequestDto(employeeId, null, routeId, null, null, new DateOnly(2039, 2, 14), new TimeOnly(9, 0), "Day", false, null, "Report delivery"));
            Assert.True(created.Succeeded);
            assignmentId = created.Request!.AssignmentId!.Value;
        }

        var account = UseMobileAccounts(provider, accounts => accounts.CreateAccount(new CreateMobileAccountDto(
            employeeName, "selected", $"rd_{Guid.NewGuid():N}"[..18], "Маршрутный обходчик", BindEmployee: true, RestrictToBoundDevice: false,
            TemporaryPassword: false, Password: "Patrol360!", ConfirmPassword: "Patrol360!", RequirePasswordChange: false)));
        Assert.True(account.Succeeded);
        var login = Login(provider, account.Account!.Login, "Patrol360!");
        Assert.True(login.Succeeded);
        var token = login.Session!.AccessToken;
        var bootstrap = UseMobileApp(provider, mobile => mobile.GetBootstrap(token, assignmentSnapshots: true))!;
        var board = Assert.Single(bootstrap.RequestBoard, row => row.RouteId == routeId);
        var assignment = Assert.Single(bootstrap.Assignments, row => row.AssignmentId == assignmentId);
        var point = Assert.Single(assignment.RouteSnapshot!.Points);
        var patrol = new ReportDeliveryPatrol(token, account.Account.Id, assignmentId, board.RequestId, point.PointId, assignment.RouteVersionNo, assignment.Revision);
        if (!start)
        {
            return patrol;
        }

        Assert.Equal("accepted", SendPatrolCommand(provider, patrol, "acceptPatrolRequest",
            new() { ["requestId"] = board.RequestId, ["routeId"] = routeId, ["requestRevision"] = board.Revision }).Status);
        var started = SendPatrolCommand(provider, patrol, "startPatrolAssignment",
            new() { ["assignmentId"] = assignmentId, ["startedAtLocal"] = DateTimeOffset.UtcNow });
        Assert.Equal("accepted", started.Status);
        return patrol with { Revision = started.ServerRevision!.Value };
    }

    private static Dictionary<string, object?> BuildCompletePayload(
        ReportDeliveryPatrol patrol,
        string status = "ok",
        string[]? photoClientFileIds = null,
        Dictionary<string, object?>? extra = null)
    {
        var pointResult = new Dictionary<string, object?>
        {
            ["pointId"] = patrol.PointId,
            ["status"] = status,
            ["photoClientFileIds"] = photoClientFileIds ?? [],
        };
        if (status == "issue")
        {
            pointResult["comment"] = "Протечка";
            pointResult["issueTypeId"] = "Неисправность";
        }

        var payload = new Dictionary<string, object?>
        {
            ["assignmentId"] = patrol.AssignmentId,
            ["requestId"] = patrol.RequestId,
            ["routeVersionNo"] = patrol.RouteVersionNo,
            ["baseRevision"] = patrol.Revision,
            ["completedAtLocal"] = DateTimeOffset.UtcNow,
            ["pointResults"] = new[] { pointResult },
        };
        foreach (var (key, value) in extra ?? [])
        {
            payload[key] = value;
        }

        return payload;
    }

    private static MobileOutboxResponseDto SendPatrolCommand(
        ServiceProvider provider,
        ReportDeliveryPatrol patrol,
        string commandType,
        Dictionary<string, object?> payload,
        string? operationId = null) =>
        Assert.Single(UseMobileApp(provider, mobile => mobile.SaveOutbox(patrol.Token, new MobileOutboxBatchDto([
            new(operationId ?? Guid.NewGuid().ToString(), commandType, "patrolAssignment", patrol.AssignmentId.ToString(),
                patrol.AssignmentId.ToString(), payload, DateTimeOffset.UtcNow, 0, "pending")]))));

    private static MobileFileUploadResponseDto? UploadPatrolPhoto(ServiceProvider provider, ReportDeliveryPatrol patrol, string clientFileId) =>
        UseMobileApp(provider, mobile => mobile.UploadFile(patrol.Token, new MobileFileUploadCommand(
            clientFileId, patrol.AssignmentId, patrol.PointId, null, null, PhotoSha256, 3, DateTimeOffset.UtcNow,
            $"{clientFileId}.jpg", "image/jpeg", new MemoryStream([1, 2, 3]))));

    private static async Task SetAssignmentStatusAsync(string connectionString, ReportDeliveryPatrol patrol, string status)
    {
        var options = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(connectionString).Options;
        await using var db = new Patrol360DbContext(options);
        await db.Assignments.Where(item => item.Id == patrol.AssignmentId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.Status, status));
        await db.PatrolRequests.Where(item => item.Id == patrol.RequestId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.Status, status));
    }

    private static ServiceProvider BuildReportDeliveryProvider(string connectionString, Dictionary<string, string?>? settings = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Patrol360"] = connectionString,
            ["Patrol360:BootstrapAdminPassword"] = "Patrol360!",
            ["Patrol360:SeedDemoData"] = "true",
        };
        foreach (var (key, value) in settings ?? [])
        {
            values[key] = value;
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var services = new ServiceCollection();
        services.AddPatrolInfrastructure(configuration);
        services.AddSingleton<IConfiguration>(configuration);
        return services.BuildServiceProvider();
    }

    private static T UseLateReports<T>(ServiceProvider provider, Func<IPatrolLateReportService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IPatrolLateReportService>());
    }

    private static T UseResults<T>(ServiceProvider provider, Func<IPatrolResultQuery, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IPatrolResultQuery>());
    }
}

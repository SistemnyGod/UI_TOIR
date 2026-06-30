using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class MobileAppDbIntegrationTests
{
    private const string AssignmentAcceptedStatus = "Принята";
    private const string AssignmentInProgressStatus = "В пути";
    private const string AssignmentPausedStatus = "Приостановлена";
    private const string AssignmentNeedsDispatcherDecisionStatus = "Требует решения диспетчера";
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

        var repeatedScanRejected = UseMobileApp(provider, mobile => mobile.SaveOutbox(
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
                    1,
                    "pending")
            ])));

        Assert.Single(repeatedScanRejected);
        Assert.Equal("rejected", repeatedScanRejected[0].Status);
        Assert.Equal(scanRejected[0].Message, repeatedScanRejected[0].Message);

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
        const string testFileSha256 = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
        var upload = UseMobileApp(provider, mobile => mobile.UploadFile(
            login.Session.AccessToken,
            new MobileFileUploadCommand(
                "file-test-1",
                assignmentId,
                routePoint.PointId,
                null,
                testFileSha256,
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
                testFileSha256,
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
                ["status"] = point.PointId == routePoint.PointId ? "skipped" : "ok",
                ["comment"] = point.PointId == routePoint.PointId ? "Метка отсутствует на месте" : "",
                ["issueTypeId"] = null,
                ["photoClientFileIds"] = Array.Empty<string>(),
                ["confirmationType"] = point.PointId == routePoint.PointId ? "manual" : "nfc",
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
                    ["issueCount"] = 1,
                    ["deferredCount"] = 0,
                    ["skippedCount"] = 1,
                    ["photoCount"] = 0,
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
        var skippedReport = ReadSkippedPatrolResult(database.ConnectionString, assignmentId);
        Assert.Equal("issue", skippedReport.Status);
        Assert.Equal("Метка недоступна", skippedReport.IssueType);
        Assert.Contains("Метка недоступна", skippedReport.Comment);
        Assert.Contains("Метка отсутствует на месте", skippedReport.IssueMessage);
        Assert.Equal(allPointResults.Length, CountPatrolResults(database.ConnectionString, assignmentId));
        Assert.Single(completeDuplicate);
        Assert.Equal("duplicate", completeDuplicate[0].Status);

        var samePayloadNewOperation = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([completeCommand with { ClientOperationId = "op-complete-accepted-repeat" }])));

        Assert.Single(samePayloadNewOperation);
        Assert.True(
            samePayloadNewOperation[0].Status == "duplicate",
            $"Expected duplicate but got {samePayloadNewOperation[0].Status}: {samePayloadNewOperation[0].Message}");
        Assert.Equal(allPointResults.Length, CountPatrolResults(database.ConnectionString, assignmentId));

        var changedPointResults = allPointResults
            .Select(point => new Dictionary<string, object?>(point))
            .ToArray();
        var changedPointResult = changedPointResults.First(point => !Equals(point["pointId"], routePoint.PointId));
        changedPointResult["comment"] = "Changed payload after accepted report";
        var changedComplete = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([
                completeCommand with
                {
                    ClientOperationId = "op-complete-accepted-changed",
                    Payload = new Dictionary<string, object?>(completeCommand.Payload)
                    {
                        ["pointResults"] = changedPointResults,
                    }
                }
            ])));

        Assert.Single(changedComplete);
        Assert.Equal("conflict", changedComplete[0].Status);
        Assert.Equal(allPointResults.Length, CountPatrolResults(database.ConnectionString, assignmentId));

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

        var repeatedConflictOutbox = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([conflictCommand])));

        Assert.Single(repeatedConflictOutbox);
        Assert.Equal("conflict", repeatedConflictOutbox[0].Status);
        Assert.Equal(conflictOutbox[0].Message, repeatedConflictOutbox[0].Message);
        Assert.Equal(conflictOutbox[0].ConflictId, repeatedConflictOutbox[0].ConflictId);

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

        var cancelledRequestId = CreateUnassignedPatrolRequest(
            database.ConnectionString,
            account.Account.BoundEmployeeIds[0],
            account.Account.BoundEmployees[0],
            route.Id,
            route.Name);
        var cancelledBootstrap = UseMobileApp(provider, mobile => mobile.GetBootstrap(login.Session.AccessToken));
        var cancelledBoardItem = cancelledBootstrap!.RequestBoard.First(item => item.RequestId == cancelledRequestId);
        var cancelledClientAssignmentId = Guid.NewGuid().ToString();
        var cancelledTakeCommand = new MobileOutboxCommandDto(
            "op-cancelled-complete-take",
            "takePatrolRequest",
            "patrolRequest",
            cancelledClientAssignmentId,
            cancelledBoardItem.RequestId.ToString(),
            new Dictionary<string, object?>
            {
                ["requestId"] = cancelledBoardItem.RequestId,
                ["routeId"] = cancelledBoardItem.RouteId,
                ["requestRevision"] = cancelledBoardItem.Revision,
                ["takenAtLocal"] = DateTimeOffset.UtcNow,
            },
            DateTimeOffset.UtcNow,
            0,
            "pending");
        var cancelledTake = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([cancelledTakeCommand])));

        Assert.Single(cancelledTake);
        Assert.Equal("accepted", cancelledTake[0].Status);
        var cancelledAssignmentId = Guid.Parse(cancelledTake[0].ServerEntityId!);
        var cancelledByDispatcher = UseAssignments(provider, assignments => assignments.Cancel(cancelledAssignmentId));
        Assert.NotNull(cancelledByDispatcher);
        Assert.True(cancelledByDispatcher!.Changed);
        var cancelledServerStatus = cancelledByDispatcher.Assignment.Status;

        var cancelledPointResults = cancelledBootstrap.Points
            .Where(point => point.RouteId == cancelledBoardItem.RouteId)
            .Select(point => new Dictionary<string, object?>
            {
                ["pointId"] = point.PointId,
                ["status"] = "ok",
                ["comment"] = "",
                ["issueTypeId"] = null,
                ["photoClientFileIds"] = Array.Empty<string>(),
                ["confirmationType"] = string.IsNullOrWhiteSpace(point.NfcUidHash) ? "manual" : "nfc",
                ["nfcUidHash"] = point.NfcUidHash,
                ["completedAtLocal"] = DateTimeOffset.UtcNow,
            })
            .ToArray();
        var cancelledComplete = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session.AccessToken,
            new MobileOutboxBatchDto([
                new MobileOutboxCommandDto(
                    "op-cancelled-complete-accepted",
                    "completePatrolAssignment",
                    "patrolAssignment",
                    cancelledAssignmentId.ToString(),
                    cancelledAssignmentId.ToString(),
                    new Dictionary<string, object?>
                    {
                        ["assignmentId"] = cancelledAssignmentId,
                        ["requestId"] = cancelledRequestId,
                        ["completedAtLocal"] = DateTimeOffset.UtcNow,
                        ["pointResults"] = cancelledPointResults,
                    },
                    DateTimeOffset.UtcNow,
                    0,
                    "pending")
            ])));

        Assert.Single(cancelledComplete);
        Assert.Equal("accepted", cancelledComplete[0].Status);
        Assert.Contains("dispatcher cancellation", cancelledComplete[0].Message);
        Assert.Equal(cancelledServerStatus, ReadAssignmentStatus(database.ConnectionString, cancelledAssignmentId));
        Assert.Equal(cancelledServerStatus, ReadPatrolRequestStatus(database.ConnectionString, cancelledRequestId));
        Assert.Equal(cancelledPointResults.Length, CountPatrolResults(database.ConnectionString, cancelledAssignmentId));
    }

    [DbIntegrationFact]
    public async Task MobilePatrolLifecycleCommandsAreIdempotentAndSafe()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();
        var account = UseMobileAccounts(provider, accounts => accounts.CreateAccount(new CreateMobileAccountDto(
            "Петров Иван Александрович",
            "selected",
            $"lifecycle_{Guid.NewGuid():N}"[..18],
            "Маршрутный обходчик",
            BindEmployee: true,
            RestrictToBoundDevice: false,
            TemporaryPassword: false,
            Password: "Patrol360!",
            ConfirmPassword: "Patrol360!",
            RequirePasswordChange: false)));

        Assert.True(account.Succeeded);
        Assert.NotNull(account.Account);

        var route = UseRoutes(provider, routes => routes.GetRoutes().First(item => item.Points.Any()));
        ClearInProgressAssignments(database.ConnectionString, account.Account!.BoundEmployeeIds[0]);
        var requestId = CreateUnassignedPatrolRequest(
            database.ConnectionString,
            account.Account.BoundEmployeeIds[0],
            account.Account.BoundEmployees[0],
            route.Id,
            route.Name);

        var login = Login(provider, account.Account.Login, "Patrol360!");
        Assert.True(login.Succeeded);
        Assert.NotNull(login.Session);

        var bootstrap = UseMobileApp(provider, mobile => mobile.GetBootstrap(login.Session!.AccessToken));
        var boardItem = Assert.Single(bootstrap!.RequestBoard, item => item.RequestId == requestId);
        Assert.False(string.IsNullOrWhiteSpace(boardItem.DisplayNumber));

        var firstAssignmentId = Guid.NewGuid();
        var accept = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session!.AccessToken,
            new MobileOutboxBatchDto([
                BuildLifecycleCommand(
                    "op-life-accept-1",
                    "acceptPatrolRequest",
                    firstAssignmentId,
                    requestId,
                    new Dictionary<string, object?>
                    {
                        ["requestId"] = requestId,
                        ["routeId"] = boardItem.RouteId,
                        ["requestRevision"] = boardItem.Revision,
                        ["acceptedAtLocal"] = DateTimeOffset.UtcNow,
                    })
            ])));

        Assert.Single(accept);
        Assert.Equal("accepted", accept[0].Status);
        Assert.Equal(AssignmentAcceptedStatus, ReadAssignmentStatus(database.ConnectionString, firstAssignmentId));

        var repeatedAccept = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session!.AccessToken,
            new MobileOutboxBatchDto([
                BuildLifecycleCommand(
                    "op-life-accept-1",
                    "acceptPatrolRequest",
                    firstAssignmentId,
                    requestId,
                    new Dictionary<string, object?>
                    {
                        ["requestId"] = requestId,
                        ["routeId"] = boardItem.RouteId,
                        ["requestRevision"] = boardItem.Revision,
                    })
            ])));
        Assert.Single(repeatedAccept);
        Assert.Equal("duplicate", repeatedAccept[0].Status);

        var release = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session!.AccessToken,
            new MobileOutboxBatchDto([
                BuildLifecycleCommand(
                    "op-life-release-1",
                    "releasePatrolRequest",
                    firstAssignmentId,
                    firstAssignmentId,
                    new Dictionary<string, object?>
                    {
                        ["assignmentId"] = firstAssignmentId,
                        ["requestId"] = requestId,
                    })
            ])));

        Assert.Single(release);
        Assert.Equal("accepted", release[0].Status);
        Assert.Null(ReadAssignmentStatus(database.ConnectionString, firstAssignmentId));

        var activeAssignmentId = Guid.NewGuid();
        var acceptAgain = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session!.AccessToken,
            new MobileOutboxBatchDto([
                BuildLifecycleCommand(
                    "op-life-accept-2",
                    "acceptPatrolRequest",
                    activeAssignmentId,
                    requestId,
                    new Dictionary<string, object?>
                    {
                        ["requestId"] = requestId,
                        ["routeId"] = boardItem.RouteId,
                        ["requestRevision"] = boardItem.Revision,
                    })
            ])));
        Assert.Single(acceptAgain);
        Assert.Equal("accepted", acceptAgain[0].Status);

        var start = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session!.AccessToken,
            new MobileOutboxBatchDto([
                BuildLifecycleCommand(
                    "op-life-start-1",
                    "startPatrolAssignment",
                    activeAssignmentId,
                    activeAssignmentId,
                    new Dictionary<string, object?>
                    {
                        ["assignmentId"] = activeAssignmentId,
                        ["startedAtLocal"] = DateTimeOffset.UtcNow,
                    })
            ])));
        Assert.Single(start);
        Assert.Equal("accepted", start[0].Status);
        Assert.Equal(AssignmentInProgressStatus, ReadAssignmentStatus(database.ConnectionString, activeAssignmentId));

        var pause = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session!.AccessToken,
            new MobileOutboxBatchDto([
                BuildLifecycleCommand(
                    "op-life-pause-1",
                    "pausePatrolAssignment",
                    activeAssignmentId,
                    activeAssignmentId,
                    new Dictionary<string, object?> { ["assignmentId"] = activeAssignmentId })
            ])));
        Assert.Single(pause);
        Assert.Equal("accepted", pause[0].Status);
        Assert.Equal(AssignmentPausedStatus, ReadAssignmentStatus(database.ConnectionString, activeAssignmentId));

        var resume = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session!.AccessToken,
            new MobileOutboxBatchDto([
                BuildLifecycleCommand(
                    "op-life-resume-1",
                    "resumePatrolAssignment",
                    activeAssignmentId,
                    activeAssignmentId,
                    new Dictionary<string, object?> { ["assignmentId"] = activeAssignmentId })
            ])));
        Assert.Single(resume);
        Assert.Equal("accepted", resume[0].Status);
        Assert.Equal(AssignmentInProgressStatus, ReadAssignmentStatus(database.ConnectionString, activeAssignmentId));

        var secondRequestId = CreateUnassignedPatrolRequest(
            database.ConnectionString,
            account.Account.BoundEmployeeIds[0],
            account.Account.BoundEmployees[0],
            route.Id,
            route.Name);
        var secondBootstrap = UseMobileApp(provider, mobile => mobile.GetBootstrap(login.Session!.AccessToken));
        var secondBoardItem = Assert.Single(secondBootstrap!.RequestBoard, item => item.RequestId == secondRequestId);
        var secondAssignmentId = Guid.NewGuid();
        var secondAccept = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session!.AccessToken,
            new MobileOutboxBatchDto([
                BuildLifecycleCommand(
                    "op-life-accept-3",
                    "acceptPatrolRequest",
                    secondAssignmentId,
                    secondRequestId,
                    new Dictionary<string, object?>
                    {
                        ["requestId"] = secondRequestId,
                        ["routeId"] = secondBoardItem.RouteId,
                        ["requestRevision"] = secondBoardItem.Revision,
                    })
            ])));
        Assert.Single(secondAccept);
        Assert.Equal("accepted", secondAccept[0].Status);

        var blockedStart = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session!.AccessToken,
            new MobileOutboxBatchDto([
                BuildLifecycleCommand(
                    "op-life-start-2",
                    "startPatrolAssignment",
                    secondAssignmentId,
                    secondAssignmentId,
                    new Dictionary<string, object?> { ["assignmentId"] = secondAssignmentId })
            ])));
        Assert.Single(blockedStart);
        Assert.Equal("conflict", blockedStart[0].Status);

        var handoff = UseMobileApp(provider, mobile => mobile.SaveOutbox(
            login.Session!.AccessToken,
            new MobileOutboxBatchDto([
                BuildLifecycleCommand(
                    "op-life-handoff-1",
                    "handoffPatrolAssignment",
                    activeAssignmentId,
                    activeAssignmentId,
                    new Dictionary<string, object?>
                    {
                        ["assignmentId"] = activeAssignmentId,
                        ["reason"] = "Ошибка выбора заявки",
                    })
            ])));
        Assert.Single(handoff);
        Assert.Equal("accepted", handoff[0].Status);
        Assert.Equal(AssignmentNeedsDispatcherDecisionStatus, ReadAssignmentStatus(database.ConnectionString, activeAssignmentId));
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

    private static MobileOutboxCommandDto BuildLifecycleCommand(
        string clientOperationId,
        string commandType,
        Guid entityLocalId,
        Guid entityServerId,
        Dictionary<string, object?> payload) =>
        new(
            clientOperationId,
            commandType,
            "patrolAssignment",
            entityLocalId.ToString(),
            entityServerId.ToString(),
            payload,
            DateTimeOffset.UtcNow,
            0,
            "pending");

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

    private static T UseAssignments<T>(ServiceProvider provider, Func<IAssignmentService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IAssignmentService>());
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

    private static SkippedPatrolResult ReadSkippedPatrolResult(string connectionString, Guid assignmentId)
    {
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT
                result.status,
                result.issue_type,
                result.comment,
                issue.message
            FROM patrol_results result
            JOIN patrol_result_issues issue ON issue.patrol_result_id = result.id
            WHERE result.assignment_id = @assignment_id
            ORDER BY result.created_at DESC
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("assignment_id", assignmentId);

        using var reader = command.ExecuteReader();
        Assert.True(reader.Read());

        return new SkippedPatrolResult(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3));
    }

    private static string? ReadAssignmentStatus(string connectionString, Guid assignmentId)
    {
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = "SELECT status FROM assignments WHERE id = @assignment_id;";
        command.Parameters.AddWithValue("assignment_id", assignmentId);

        return command.ExecuteScalar() as string;
    }

    private static string? ReadPatrolRequestStatus(string connectionString, Guid requestId)
    {
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = "SELECT status FROM patrol_requests WHERE id = @request_id;";
        command.Parameters.AddWithValue("request_id", requestId);

        return command.ExecuteScalar() as string;
    }

    private static void ClearInProgressAssignments(string connectionString, Guid employeeId)
    {
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE assignments
            SET status = 'Завершено'
            WHERE employee_id = @employee_id
              AND status = @in_progress_status;
            """;
        command.Parameters.AddWithValue("employee_id", employeeId);
        command.Parameters.AddWithValue("in_progress_status", AssignmentInProgressStatus);
        command.ExecuteNonQuery();
    }

    private static int CountPatrolResults(string connectionString, Guid assignmentId)
    {
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = "SELECT count(*) FROM patrol_results WHERE assignment_id = @assignment_id;";
        command.Parameters.AddWithValue("assignment_id", assignmentId);

        return Convert.ToInt32(command.ExecuteScalar());
    }

    private sealed record SkippedPatrolResult(
        string Status,
        string IssueType,
        string Comment,
        string IssueMessage);

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

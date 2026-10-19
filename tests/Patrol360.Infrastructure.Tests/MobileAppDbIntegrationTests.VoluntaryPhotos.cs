using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Attachments;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

public sealed partial class MobileAppDbIntegrationTests
{
    [DbIntegrationFact]
    public async Task LegacyPhotoFlagsAreOptionalInBootstrapAndReportButAttachedFilesMustExist()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var options = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(database.ConnectionString).Options;
        Guid employeeId, routeId, assignmentId;
        string employeeName;
        await using (var db = new Patrol360DbContext(options)) {
            var employee = new EmployeeEntity { Id = Guid.NewGuid(), FullName = "Voluntary photo employee", PersonnelNo = Guid.NewGuid().ToString(), Position = "Test", Department = "Test", Status = "active", Shift = "Day", LastSeenAt = DateTimeOffset.UtcNow };
            var route = new RouteEntity { Id = Guid.NewGuid(), Name = "Voluntary photo route", VersionNo = 1, Status = "active", CreatedAt = DateTimeOffset.UtcNow };
            employeeId = employee.Id; employeeName = employee.FullName; routeId = route.Id;
            db.Employees.Add(employee); db.Routes.Add(route);
            db.RoutePoints.Add(new() { Id = Guid.NewGuid(), RouteId = routeId, Name = "Legacy photo point", SequenceNo = 1, IsRequired = true, RequiresPhoto = true, Status = "active" });
            await db.SaveChangesAsync();
            using var cache = new MemoryCache(new MemoryCacheOptions());
            var store = new EfPatrolStore(db, cache, new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg")), new LocalAttachmentStore(new ConfigurationBuilder().Build()));
            var created = store.Create(new CreatePatrolRequestDto(employeeId, null, routeId, null, null, new DateOnly(2039, 2, 14), new TimeOnly(9, 0), "Day", false, null, "Optional photo"));
            Assert.True(created.Succeeded); assignmentId = created.Request!.AssignmentId!.Value;
            await db.RouteRevisionPoints.Where(row => row.RouteRevision!.RouteId == routeId).ExecuteUpdateAsync(setters => setters.SetProperty(row => row.RequiresPhoto, true));
        }
        var account = UseMobileAccounts(provider, accounts => accounts.CreateAccount(new CreateMobileAccountDto(
            employeeName, "selected", $"photo_{Guid.NewGuid():N}"[..18], "Маршрутный обходчик", BindEmployee: true, RestrictToBoundDevice: false,
            TemporaryPassword: false, Password: "Patrol360!", ConfirmPassword: "Patrol360!", RequirePasswordChange: false)));
        Assert.True(account.Succeeded);
        var login = Login(provider, account.Account!.Login, "Patrol360!"); Assert.True(login.Succeeded);
        var token = login.Session!.AccessToken;
        var bootstrap = UseMobileApp(provider, mobile => mobile.GetBootstrap(token, assignmentSnapshots: true))!;
        var board = Assert.Single(bootstrap.RequestBoard, row => row.RouteId == routeId);
        var assignment = Assert.Single(bootstrap.Assignments, row => row.AssignmentId == assignmentId);
        var point = Assert.Single(assignment.RouteSnapshot!.Points);
        Assert.False(point.RequiresPhoto);
        Assert.All(bootstrap.Points.Where(row => row.RouteId == routeId), row => Assert.False(row.RequiresPhoto));

        MobileOutboxResponseDto Send(string operation, Dictionary<string, object?> payload, string? operationId = null) => Assert.Single(UseMobileApp(provider, mobile => mobile.SaveOutbox(token,
            new MobileOutboxBatchDto([new(operationId ?? Guid.NewGuid().ToString(), operation, "patrolAssignment", assignmentId.ToString(), assignmentId.ToString(), payload, DateTimeOffset.UtcNow, 0, "pending")]))));
        Assert.Equal("accepted", Send("acceptPatrolRequest", new() { ["requestId"] = board.RequestId, ["routeId"] = routeId, ["requestRevision"] = board.Revision }).Status);
        var start = Send("startPatrolAssignment", new() { ["assignmentId"] = assignmentId, ["startedAtLocal"] = DateTimeOffset.UtcNow });
        Assert.Equal("accepted", start.Status);
        var result = new Dictionary<string, object?> { ["pointId"] = point.PointId, ["status"] = "issue", ["comment"] = "Шум", ["issueTypeId"] = "Неисправность", ["photoClientFileIds"] = new[] { "not-uploaded" } };
        var payload = new Dictionary<string, object?> { ["assignmentId"] = assignmentId, ["requestId"] = board.RequestId, ["routeVersionNo"] = assignment.RouteVersionNo,
            ["baseRevision"] = start.ServerRevision, ["completedAtLocal"] = DateTimeOffset.UtcNow, ["pointResults"] = new[] { result } };
        Assert.Equal("rejected", Send("completePatrolAssignment", payload).Status);
        result["photoClientFileIds"] = Array.Empty<string>();
        var operationId = Guid.NewGuid().ToString();
        Assert.Equal("accepted", Send("completePatrolAssignment", payload, operationId).Status);
        Assert.Equal("duplicate", Send("completePatrolAssignment", payload, operationId).Status);
        await using var verify = new Patrol360DbContext(options);
        Assert.Equal(1, await verify.PatrolResults.CountAsync(row => row.AssignmentId == assignmentId));
        Assert.True(await verify.RouteRevisionPoints.Where(row => row.RouteRevision!.RouteId == routeId).AllAsync(row => row.RequiresPhoto));
    }
}

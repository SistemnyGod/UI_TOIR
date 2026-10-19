using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Attachments;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

public sealed partial class MobileAppDbIntegrationTests
{
    [DbIntegrationFact]
    public async Task BootstrapDeliversAssignmentRevisionAfterRouteChanges()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var employee = UseEmployees(provider, employees => employees.GetEmployees().First());
        var account = UseMobileAccounts(provider, accounts => accounts.CreateAccount(new CreateMobileAccountDto(
            employee.FullName, "selected", $"audit_{Guid.NewGuid():N}"[..18], "Маршрутный обходчик",
            BindEmployee: true, RestrictToBoundDevice: false, TemporaryPassword: false,
            Password: "Patrol360!", ConfirmPassword: "Patrol360!", RequirePasswordChange: false)));
        Assert.True(account.Succeeded);
        var route = UseRoutes(provider, routes => routes.GetRoutes().First(item => item.Points.Count > 0));
        Guid assignmentId;
        Guid secondAssignmentId;
        int originalVersion;
        var options = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(database.ConnectionString).Options;
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var zone = new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg"));
        var attachments = new LocalAttachmentStore(new ConfigurationBuilder().Build());
        await using (var context = new Patrol360DbContext(options))
        {
            var created = new EfPatrolStore(context, cache, zone, attachments).Create(new CreatePatrolRequestDto(
                employee.Id, null, route.Id, null, null, new DateOnly(2037, 6, 12), new TimeOnly(9, 0), "Day", true, null, "Audit snapshot"));
            Assert.True(created.Succeeded, JsonSerializer.Serialize(created.Errors));
            assignmentId = created.Request!.AssignmentId!.Value;
            var assignment = context.Assignments.Single(row => row.Id == assignmentId);
            Assert.NotNull(assignment.RouteRevisionId);
            originalVersion = assignment.RouteVersionNo;
            var entity = context.Routes.Single(row => row.Id == route.Id);
            entity.VersionNo++;
            context.RoutePoints.Single(row => row.Id == route.Points.First().Id).Name = "AUDIT MODIFIED POINT";
            context.RoutePoints.Add(new() { Id = Guid.NewGuid(), RouteId = route.Id, Name = "NEW REQUIRED POINT", SequenceNo = 99, IsRequired = true, Status = "active" });
            await context.SaveChangesAsync();
            var second = new EfPatrolStore(context, cache, zone, attachments).Create(new CreatePatrolRequestDto(
                employee.Id, null, route.Id, null, null, new DateOnly(2037, 6, 13), new TimeOnly(9, 0), "Day", true, null, "Second revision"));
            Assert.True(second.Succeeded, JsonSerializer.Serialize(second.Errors));
            secondAssignmentId = second.Request!.AssignmentId!.Value;
            entity.IsArchived = true;
            await context.SaveChangesAsync();
        }
        var login = Login(provider, account.Account!.Login, "Patrol360!");
        Assert.True(login.Succeeded);
        var snapshot = UseMobileApp(provider, mobile => mobile.GetBootstrap(login.Session!.AccessToken));
        Assert.NotNull(snapshot);
        var mobileAssignment = Assert.Single(snapshot!.Assignments, row => row.AssignmentId == assignmentId);
        var mobileRoute = Assert.Single(snapshot.Routes, row => row.RouteId == route.Id);
        Assert.Equal(originalVersion, mobileAssignment.RouteVersionNo);
        Assert.Equal(originalVersion, mobileRoute.Version);
        Assert.NotNull(mobileAssignment.RouteSnapshot);
        Assert.Equal(originalVersion, mobileAssignment.RouteSnapshot!.Route.Version);
        Assert.DoesNotContain(snapshot.Points, row => row.RouteId == route.Id && row.Name == "AUDIT MODIFIED POINT");
        Assert.DoesNotContain(mobileAssignment.RouteSnapshot!.Points, row => row.Name == "AUDIT MODIFIED POINT");
        Assert.DoesNotContain(mobileAssignment.RouteSnapshot!.Points, row => row.Name == "NEW REQUIRED POINT");
        var secondAssignment = Assert.Single(snapshot.Assignments, row => row.AssignmentId == secondAssignmentId);
        Assert.Equal(originalVersion + 1, secondAssignment.RouteSnapshot!.Route.Version);
        Assert.Contains(secondAssignment.RouteSnapshot.Points, row => row.Name == "NEW REQUIRED POINT");
        Assert.Contains(secondAssignment.RouteSnapshot.Points, row => row.Name == "AUDIT MODIFIED POINT");
        var modern = UseMobileApp(provider, mobile => mobile.GetBootstrap(login.Session!.AccessToken, assignmentSnapshots: true));
        Assert.DoesNotContain(modern!.Routes, row => row.RouteId == route.Id); // Archived routes are not offered for new patrols.
        Assert.Equal(originalVersion, modern.Assignments.Single(row => row.AssignmentId == assignmentId).RouteSnapshot!.Route.Version);
        var conflict = UseMobileApp(provider, mobile => mobile.SaveOutbox(login.Session!.AccessToken, new MobileOutboxBatchDto([
            new MobileOutboxCommandDto("snapshot-version-mismatch", "completePatrolAssignment", "patrolAssignment", assignmentId.ToString(), assignmentId.ToString(),
                new Dictionary<string, object?> {
                    ["assignmentId"] = assignmentId, ["requestId"] = mobileAssignment.RequestId,
                    ["routeVersionNo"] = originalVersion + 1,
                    ["pointResults"] = new[] { new Dictionary<string, object?> { ["pointId"] = mobileAssignment.RouteSnapshot.Points[0].PointId, ["status"] = "ok" } }
                }, DateTimeOffset.UtcNow, 0, "pending")
        ])));
        Assert.Equal("conflict", Assert.Single(conflict).Status);
        Assert.Contains("Версия маршрута", conflict[0].Message);

    }
}

[Collection("Postgres integration")]
public sealed class AuditFixRequestDbTests
{
    [DbIntegrationFact]
    public async Task WorkBoardExcludesHistoryButKeepsOldActiveAndRecentlyCompletedWork()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var db = new Patrol360DbContext(new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(database.ConnectionString).Options);
        var section = new EmuWorkSectionEntity { Id = Guid.NewGuid(), Name = "Board", Code = "board", CreatedAt = DateTimeOffset.UtcNow };
        db.EmuWorkSections.Add(section);
        var now = DateTimeOffset.UtcNow;
        foreach (var (number, completedAt) in new (string, DateTimeOffset?)[] { ("active", null), ("today", now), ("historical", now.AddDays(-30)) })
            db.EmuWorkSessions.Add(new() { Id = Guid.NewGuid(), SectionId = section.Id, WorkNumber = number, WorkDate = DateOnly.FromDateTime(now.AddDays(-30).Date),
                TaskDescription = number, ArrivedAt = now.AddDays(-30), CreatedAt = now.AddDays(-30), UpdatedAt = now, CompletedAt = completedAt,
                Status = completedAt is null ? "В работе" : "Завершено" });
        await db.SaveChangesAsync();
        var service = new EfEmuService(db);
        var board = service.GetWorkSessions(new EmuWorkSessionQueryDto(BoardOnly: true));
        Assert.NotNull(board.ServerTime);
        Assert.Equal(2, board.Total);
        Assert.Contains(board.Rows, row => row.WorkNumber == "active");
        Assert.Contains(board.Rows, row => row.WorkNumber == "today");
        Assert.Equal(3, service.GetWorkSessions(new EmuWorkSessionQueryDto()).Total);
        Assert.Empty(service.GetWorkSessions(new EmuWorkSessionQueryDto(BoardOnly: true, AllowedSectionIds: [])).Rows);
    }

    [DbIntegrationFact]
    public async Task ServerRejectsMissingStartTime()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var options = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(database.ConnectionString).Options;
        await using var db = new Patrol360DbContext(options);
        var employeeId = Guid.NewGuid(); var routeId = Guid.NewGuid();
        db.Employees.Add(new() {Id=employeeId, FullName="Time audit",PersonnelNo=employeeId.ToString(),Position="Test",Department="Test",Shift="Day",Status="active",LastSeenAt=DateTimeOffset.UtcNow});
        db.Routes.Add(new() {Id=routeId,Name="Time route",VersionNo=1,Status="active",CreatedAt=DateTimeOffset.UtcNow});
        db.RoutePoints.Add(new() {Id=Guid.NewGuid(),RouteId=routeId,Name="Point",SequenceNo=1,Status="active",IsRequired=true});
        await db.SaveChangesAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var result = new EfPatrolStore(db,cache,new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg")),new LocalAttachmentStore(new ConfigurationBuilder().Build()))
            .Create(new CreatePatrolRequestDto(employeeId,null,routeId,null,null,new DateOnly(2038,6,13),null,"Day",true,null,"Missing time"));
        Assert.False(result.Succeeded);
        Assert.Contains("scheduledTime",result.Errors.Keys);
        var clientId = Guid.NewGuid();
        var request = new CreatePatrolRequestDto(employeeId, null, routeId, null, null, new DateOnly(2038,6,13), new TimeOnly(9,0), "Day", true, null, "Retry", ClientRequestId: clientId);
        var service = new EfPatrolStore(db,cache,new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg")),new LocalAttachmentStore(new ConfigurationBuilder().Build()));
        var created = service.Create(request);
        Assert.True(created.Succeeded, JsonSerializer.Serialize(created.Errors));
        db.ChangeTracker.Clear();
        var retry = service.Create(request);
        Assert.True(retry.Succeeded, JsonSerializer.Serialize(retry.Errors));
        Assert.Equal(created.Request!.Id, retry.Request!.Id);
        Assert.Equal(1, await db.PatrolRequests.CountAsync());
        Assert.Equal(1, await db.Assignments.CountAsync());
        Assert.False(service.Create(request with { Description = "Different input" }).Succeeded);


    }

    [DbIntegrationFact]
    public async Task ConcurrentRequestsForDifferentEmployeesGetUniqueNumbers()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var routeId = Guid.NewGuid();
        var employeeIds = new[] { Guid.NewGuid(), Guid.NewGuid() };
        var setupOptions = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(database.ConnectionString).Options;
        await using (var setup = new Patrol360DbContext(setupOptions))
        {
            setup.Routes.Add(new() { Id = routeId, Name = "Audit route", VersionNo = 1, Status = "active", CreatedAt = DateTimeOffset.UtcNow });
            setup.RoutePoints.Add(new() { Id = Guid.NewGuid(), RouteId = routeId, Name = "Audit point", SequenceNo = 1, Status = "active", IsRequired = true });
            foreach (var id in employeeIds) setup.Employees.Add(new() {Id=id, FullName=$"Audit {id:N}", PersonnelNo=id.ToString(), Position="Test", Department="Test", Shift="Day", Status="active", LastSeenAt=DateTimeOffset.UtcNow});
            await setup.SaveChangesAsync();
            // Pre-create the revision so this probe isolates request numbering.
            using var cache = new MemoryCache(new MemoryCacheOptions());
            var store = new EfPatrolStore(setup, cache, new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg")), new LocalAttachmentStore(new ConfigurationBuilder().Build()));
            var warmup = store.Create(new CreatePatrolRequestDto(employeeIds[0], null, routeId, null, null, new DateOnly(2038, 6, 11), new TimeOnly(9, 0), "Day", false, null, "Warmup"));
            Assert.True(warmup.Succeeded);
        }
        using var barrier = new Barrier(2);
        var attempts = employeeIds.Select(id => Task.Run(() => {
            var options = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(database.ConnectionString)
                .Options;
            using var db = new Patrol360DbContext(options);
            using var cache = new MemoryCache(new MemoryCacheOptions());
            try {
                Assert.True(barrier.SignalAndWait(TimeSpan.FromSeconds(20)));
                var result = new EfPatrolStore(db, cache, new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg")), new LocalAttachmentStore(new ConfigurationBuilder().Build()))
                    .Create(new CreatePatrolRequestDto(id, null, routeId, null, null, new DateOnly(2038, 6, 12), new TimeOnly(9, 0), "Day", false, null, "Number race"));
                return result.Succeeded ? $"created:{result.Request!.Number}" : "validation:" + JsonSerializer.Serialize(result.Errors);
            } catch (DbUpdateException error) {
                return error.InnerException is Npgsql.PostgresException postgres ? $"database:{postgres.SqlState}:{postgres.ConstraintName}" : error.GetType().Name;
            }
        })).ToArray();
        var outcomes = await Task.WhenAll(attempts);
        await using var verification = new Patrol360DbContext(setupOptions);
        var numbers = await verification.PatrolRequests.Where(row => row.ScheduledDate == new DateOnly(2038, 6, 12)).Select(row => row.Number).ToListAsync();
        Assert.All(outcomes, outcome => Assert.StartsWith("created:", outcome));
        Assert.Equal(2, numbers.Count);
        Assert.Equal(2, numbers.Distinct().Count());
        Assert.Contains("REQ-20380612-0001", numbers);
        Assert.Contains("REQ-20380612-0002", numbers);
        // A gap in existing numbers must not make COUNT-based numbering reuse a number.
        var lastRequest = await verification.PatrolRequests.SingleAsync(row => row.Number == "REQ-20380612-0002");
        lastRequest.Number = "REQ-20380612-0009";
        var nextEmployee = Guid.NewGuid();
        verification.Employees.Add(new() { Id = nextEmployee, FullName = "Next employee", PersonnelNo = nextEmployee.ToString(), Position = "Test", Department = "Test", Shift = "Day", Status = "active", LastSeenAt = DateTimeOffset.UtcNow });
        await verification.SaveChangesAsync();
        using var nextCache = new MemoryCache(new MemoryCacheOptions());
        var next = new EfPatrolStore(verification, nextCache, new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg")), new LocalAttachmentStore(new ConfigurationBuilder().Build()))
            .Create(new CreatePatrolRequestDto(nextEmployee, null, routeId, null, null, new DateOnly(2038, 6, 12), new TimeOnly(9, 0), "Day", false, null, "After gap"));
        Assert.True(next.Succeeded, JsonSerializer.Serialize(next.Errors));
        Assert.Equal("REQ-20380612-0010", next.Request!.Number);
    }
}

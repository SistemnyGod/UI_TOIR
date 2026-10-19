using System.Data.Common;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Attachments;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed class StabilityRegressionDbTests
{
    private static Patrol360DbContext Context(string connection, DbCommandInterceptor? interceptor = null)
    {
        var options = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(connection);
        if (interceptor is not null) options.AddInterceptors(interceptor);
        return new(options.Options);
    }
    private static EmployeeEntity Employee() => new() { Id = Guid.NewGuid(), FullName = "Regression employee", PersonnelNo = Guid.NewGuid().ToString(), Position = "Слесарь", Department = "Test", Status = "active", Shift = "Day", LastSeenAt = DateTimeOffset.UtcNow };

    [DbIntegrationFact]
    public async Task RequestAssignmentRetainsPointsAfterRouteEdit()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var employee = Employee(); var route = new RouteEntity { Id = Guid.NewGuid(), Name = "Test route", VersionNo = 1, Status = "active", CreatedAt = DateTimeOffset.UtcNow };
        var point = new RoutePointEntity { Id = Guid.NewGuid(), RouteId = route.Id, Name = "Original point", SequenceNo = 1, Status = "active", IsRequired = true };
        Guid assignmentId;
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var zone = new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg"));
        var attachments = new LocalAttachmentStore(new ConfigurationBuilder().Build());
        await using (var db = Context(database.ConnectionString))
        {
            db.Employees.Add(employee); db.Routes.Add(route); db.RoutePoints.Add(point); await db.SaveChangesAsync();
            var result = new EfPatrolStore(db, cache, zone, attachments).Create(new CreatePatrolRequestDto(employee.Id, null, route.Id, null, null, DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1), new TimeOnly(9, 0), "Day", false, null, "Snapshot"));
            Assert.True(result.Succeeded); assignmentId = result.Request!.AssignmentId!.Value;
            Assert.NotNull(db.Assignments.Single(row => row.Id == assignmentId).RouteRevisionId);
        }
        await using (var db = Context(database.ConnectionString))
        {
            var edited = db.Routes.Single(row => row.Id == route.Id); edited.VersionNo++;
            db.RoutePoints.Single(row => row.Id == point.Id).Name = "Changed point";
            db.RoutePoints.Add(new() { Id = Guid.NewGuid(), RouteId = route.Id, Name = "Added point", SequenceNo = 2, Status = "active", IsRequired = true });
            await db.SaveChangesAsync();
        }
        await using (var db = Context(database.ConnectionString))
        {
            var result = new EfPatrolStore(db, cache, zone, attachments).Complete(assignmentId, new(DateTimeOffset.UtcNow, "ok", null, "Offline completion", null, null, PointResults: [new(point.Id, "ok", "", null, null)]));
            Assert.True(result!.Succeeded); Assert.Single(db.PatrolResults.Where(row => row.AssignmentId == assignmentId));
            Assert.Equal("Original point", db.RouteRevisionPoints.Single().Name);
        }
    }

    [DbIntegrationFact]
    public async Task AccountingRetryUsesOriginalResponseAndRejectsChangedOwnerOrPayload()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var itemId = Guid.NewGuid(); var actor = Guid.NewGuid();
        await using (var setup = Context(database.ConnectionString))
        {
            setup.InventoryItems.Add(new() { Id = itemId, Name = "Tool", Sku = "TEST", ItemKind = "inventory", IsActive = true }); await setup.SaveChangesAsync();
            Assert.False(setup.Database.HasPendingModelChanges());
        }
        var request = new CreateInventoryOperationDto("issue", itemId, null, 2, Comment: "Retry", ClientOperationId: Guid.NewGuid());
        InventoryDocumentDto first;
        await using (var db = Context(database.ConnectionString)) first = new EfInventoryCatalogCommandService(db).CreateOperation(request, actor).Value!;
        await using (var db = Context(database.ConnectionString))
        {
            db.InventoryItems.Single().Name = "Renamed"; await db.SaveChangesAsync();
            var service = new EfInventoryCatalogCommandService(db);
            Assert.Equal(first, service.CreateOperation(request with { WarehouseId = Guid.NewGuid() }, actor).Value);
            Assert.Contains("conflict", service.CreateOperation(request, Guid.NewGuid()).Errors.Keys);
            Assert.Contains("conflict", service.CreateOperation(request with { Quantity = 3 }, actor).Errors.Keys);
            Assert.Single(db.InventoryStockMoves); Assert.Single(db.InventoryOperationReceipts);
            Assert.True(service.CreateOperation(request with { ClientOperationId = Guid.NewGuid() }, actor).Succeeded);
            Assert.Equal(2, db.InventoryStockMoves.Count());
        }
    }

    [DbIntegrationFact]
    public async Task ConcurrentAccountingRetryWritesOneFact()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var itemId = Guid.NewGuid(); var actor = Guid.NewGuid();
        await using (var setup = Context(database.ConnectionString)) { setup.InventoryItems.Add(new() { Id = itemId, Name = "Tool", Sku = "TEST", IsActive = true }); await setup.SaveChangesAsync(); }
        var request = new CreateInventoryOperationDto("receipt", itemId, null, 5, ClientOperationId: Guid.NewGuid());
        using var gate = new Barrier(2);
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => Task.Run(() => {
            using var db = Context(database.ConnectionString); Assert.True(gate.SignalAndWait(TimeSpan.FromSeconds(15)));
            return new EfInventoryCatalogCommandService(db).CreateOperation(request, actor);
        })));
        Assert.All(results, result => Assert.True(result.Succeeded)); Assert.Equal(results[0].Value, results[1].Value);
        await using var verify = Context(database.ConnectionString); Assert.Single(verify.InventoryStockMoves); Assert.Single(verify.InventoryOperationReceipts);
    }

    [DbIntegrationFact]
    public async Task PublicationRequiresOwnedCurrentDraftAndLateSaveCannotResurrectIt()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var db = Context(database.ConnectionString);
        var employee = Employee(); db.Employees.Add(employee); await db.SaveChangesAsync();
        var service = new EfEmuShiftReportService(db); var actor = Guid.NewGuid(); var other = Guid.NewGuid(); var date = DateOnly.FromDateTime(DateTime.UtcNow);
        db.SiteUsers.AddRange(new SiteUserEntity { Id = actor, Login = "author", NormalizedLogin = "AUTHOR", DisplayName = "Author", Status = "active", CreatedAt = DateTimeOffset.UtcNow }, new SiteUserEntity { Id = other, Login = "other", NormalizedLogin = "OTHER", DisplayName = "Other", Status = "active", CreatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
        var save = new EmuSaveShiftReportDraftDto(date, "day", "mechanic", employee.Id, "editor", null, "{}");
        var saved = service.SaveDraft(save, actor, "Author"); Assert.True(saved.Succeeded);
        var report = new EmuCreateShiftReportDto(date, "day", "mechanic", employee.Id, [new("Inspection", 60, null, null)], "editor", saved.Value!.Version);
        Assert.Contains("conflict", service.Create(report, other, "Other").Errors.Keys);
        Assert.Contains("conflict", service.Create(report with { EditorInstanceId = null }, actor, "Author").Errors.Keys);
        Assert.Contains("version", service.Create(report with { ExpectedDraftVersion = 0 }, actor, "Author").Errors.Keys);
        Assert.False(service.ReleaseDraft(new(date, "day", employee.Id, "editor"), other).Succeeded);
        Assert.False(service.SaveDraft(save, other, "Other").Succeeded);
        Assert.True(service.Create(report, actor, "Author").Succeeded);
        Assert.False(service.SaveDraft(save with { ExpectedVersion = saved.Value.Version }, actor, "Author").Succeeded);
        Assert.Empty(db.EmuShiftReportDrafts); Assert.Single(db.EmuShiftReports);
    }

    [DbIntegrationFact]
    public async Task ConcurrentPublicationAndAutoSaveCannotKeepBothDraftAndReport()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var employee = Employee(); var actor = Guid.NewGuid(); var date = DateOnly.FromDateTime(DateTime.UtcNow);
        var save = new EmuSaveShiftReportDraftDto(date, "day", "mechanic", employee.Id, "editor", null, "{}");
        await using (var setup = Context(database.ConnectionString))
        {
            setup.Employees.Add(employee);
            setup.SiteUsers.Add(new() { Id = actor, Login = "author", NormalizedLogin = "AUTHOR", DisplayName = "Author", Status = "active", CreatedAt = DateTimeOffset.UtcNow });
            await setup.SaveChangesAsync();
            Assert.True(new EfEmuShiftReportService(setup).SaveDraft(save, actor, "Author").Succeeded);
        }
        var report = new EmuCreateShiftReportDto(date, "day", "mechanic", employee.Id, [new("Inspection", 60, null, null)], "editor", 1);
        using var gate = new Barrier(2);
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(index => Task.Run(() => {
            using var db = Context(database.ConnectionString); Assert.True(gate.SignalAndWait(TimeSpan.FromSeconds(15)));
            var service = new EfEmuShiftReportService(db);
            return index == 0 ? service.Create(report, actor, "Author").Succeeded : service.SaveDraft(save with { ExpectedVersion = 1 }, actor, "Author").Succeeded;
        })));
        Assert.Single(results, succeeded => succeeded);
        await using var verify = Context(database.ConnectionString);
        Assert.Equal(1, verify.EmuShiftReportDrafts.Count() + verify.EmuShiftReports.Count());
        if (verify.EmuShiftReportDrafts.Any()) Assert.Equal(2, verify.EmuShiftReportDrafts.Single().Version);
    }

    [DbIntegrationFact]
    public async Task ConcurrentRefreshWithSameOperationReplaysIdenticalTokens()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var now = DateTimeOffset.UtcNow; var employee = Employee(); var accountId = Guid.NewGuid(); var sessionId = Guid.NewGuid();
        await using (var setup = Context(database.ConnectionString))
        {
            setup.Employees.Add(employee);
            setup.MobileAccounts.Add(new() { Id = accountId, Login = "refresh-test", Status = "Активен", CreatedAt = now });
            setup.MobileAccountEmployeeBindings.Add(new() { Id = Guid.NewGuid(), MobileAccountId = accountId, EmployeeId = employee.Id, DisplayName = employee.FullName, CreatedAt = now });
            setup.MobileAccountSessions.Add(new() { Id = sessionId, MobileAccountId = accountId, DeviceId = "test-device", Device = "Test phone", Status = "Онлайн", TokenHash = EfAuthSessionService.HashToken("access"), RefreshTokenHash = EfAuthSessionService.HashToken("refresh"), CreatedAt = now, ExpiresAt = now.AddHours(1), RefreshExpiresAt = now.AddDays(1), LastSeenAt = now });
            await setup.SaveChangesAsync();
        }
        var protector = new EphemeralDataProtectionProvider(); var zone = new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg"));
        using var gate = new RefreshReadGate();
        var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => Task.Run(() => {
            using var db = Context(database.ConnectionString, gate);
            return new EfMobileAppService(db, new EfEmuService(db), null!, zone, new ConfigurationBuilder().Build(), protector).Refresh(new("refresh", "test-device", ClientOperationId: "same-operation"), "127.0.0.1");
        })));
        Assert.All(results, result => Assert.True(result.Succeeded));
        Assert.Equal(results[0].Session!.AccessToken, results[1].Session!.AccessToken);
        Assert.Equal(results[0].Session!.RefreshToken, results[1].Session!.RefreshToken);
        await using var verify = Context(database.ConnectionString);
        Assert.Single(verify.MobileRefreshTokenHistories); Assert.Null(verify.MobileAccountSessions.Single().RevokedAt);
        var service = new EfMobileAppService(verify, new EfEmuService(verify), null!, zone, new ConfigurationBuilder().Build(), protector);
        Assert.False(service.Refresh(new("refresh", "other-device", ClientOperationId: "same-operation"), "127.0.0.1").Succeeded);
        var replay = service.Refresh(new("refresh", "test-device", ClientOperationId: "same-operation"), "127.0.0.1");
        Assert.True(replay.Succeeded); Assert.Equal(results[0].Session!.RefreshToken, replay.Session!.RefreshToken);
    }

    private sealed class RefreshReadGate : DbCommandInterceptor, IDisposable
    {
        private readonly Barrier barrier = new(2); private int reads;
        public override DbDataReader ReaderExecuted(DbCommand command, CommandExecutedEventData eventData, DbDataReader result)
        {
            if (command.CommandText.StartsWith("SELECT") && command.CommandText.Contains("mobile_account_sessions") && Interlocked.Increment(ref reads) <= 2)
                Assert.True(barrier.SignalAndWait(TimeSpan.FromSeconds(15)));
            return result;
        }
        public void Dispose() => barrier.Dispose();
    }
}

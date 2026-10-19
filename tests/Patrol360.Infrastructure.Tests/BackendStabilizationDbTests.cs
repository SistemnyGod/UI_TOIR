using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Patrol360.Contracts;
using Patrol360.Application;
using Patrol360.Infrastructure.Attachments;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed class BackendStabilizationDbTests
{
    private static Patrol360DbContext Context(string connection, DbCommandInterceptor? interceptor = null)
    {
        var options = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(connection);
        if (interceptor is not null) options.AddInterceptors(interceptor);
        return new(options.Options);
    }
    private static EmployeeEntity Employee() => new() { Id = Guid.NewGuid(), FullName = "Stabilization employee", PersonnelNo = Guid.NewGuid().ToString(), Position = "Test", Department = "Test", Status = "active", Shift = "Day", LastSeenAt = DateTimeOffset.UtcNow };
    private static EfPatrolStore Patrol(Patrol360DbContext db, MemoryCache cache) => new(db, cache, new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg")), new LocalAttachmentStore(new ConfigurationBuilder().Build()));
    private static async Task<(Guid Route, Guid Point, Guid Employee)> SeedRoute(string connection)
    {
        await using var db = Context(connection);
        var employee = Employee();
        var route = new RouteEntity { Id = Guid.NewGuid(), Name = "Stabilization route", VersionNo = 1, CreatedAt = DateTimeOffset.UtcNow, Status = "active" };
        var point = new RoutePointEntity { Id = Guid.NewGuid(), RouteId = route.Id, Name = "Original", SequenceNo = 1, Status = "active", IsRequired = true };
        db.Employees.Add(employee); db.Routes.Add(route); db.RoutePoints.Add(point); await db.SaveChangesAsync();
        return (route.Id, point.Id, employee.Id);
    }
    private static CreatePatrolRequestDto Request(Guid employee, Guid route, int day = 12) => new(employee, null, route, null, null, new DateOnly(2039, 1, day), new TimeOnly(9, 0), "Day", false, null, "Stabilization");
    private static EmuWorkSessionEntity Session(DateTimeOffset start) => new() {
        Id = Guid.NewGuid(), WorkNumber = Guid.NewGuid().ToString(), Section = new() { Id = Guid.NewGuid(), Name = "Test section", Code = Guid.NewGuid().ToString() },
        WorkDate = DateOnly.FromDateTime(start.Date), TaskDescription = "Test task", ArrivedAt = start, CreatedAt = start, UpdatedAt = start,
        Employees = [new() { Id = Guid.NewGuid(), Employee = Employee(), ArrivedAt = start, FullNameSnapshot = "First" }]
    };

    [Fact]
    public void EmuVersionsProtectExistingColumnsWithoutPendingSchemaChanges()
    {
        using var db = Context("Host=127.0.0.1;Database=not_connected;Username=test;Password=test");
        Assert.True(db.Model.FindEntityType(typeof(EmuWorkSessionEntity))!.FindProperty(nameof(EmuWorkSessionEntity.RowVersion))!.IsConcurrencyToken);
        Assert.True(db.Model.FindEntityType(typeof(EmuWorkPlanTaskEntity))!.FindProperty(nameof(EmuWorkPlanTaskEntity.RowVersion))!.IsConcurrencyToken);
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [DbIntegrationFact]
    public async Task AssignmentWaitsForRouteEditAndCapturesTheWholeNewRevision()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var ids = await SeedRoute(database.ConnectionString);
        await using var writer = Context(database.ConnectionString);
        await using var edit = await writer.Database.BeginTransactionAsync();
        var route = PatrolRouteRevisionStore.LoadForUpdate(writer, ids.Route, true)!;
        route.VersionNo++; route.Points.Single().Name = "Edited"; await writer.SaveChangesAsync();
        var attempted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var create = Task.Run(() => {
            using var db = Context(database.ConnectionString, new RouteLockProbe(() => attempted.TrySetResult()));
            using var cache = new MemoryCache(new MemoryCacheOptions());
            return Patrol(db, cache).Create(Request(ids.Employee, ids.Route));
        });
        await attempted.Task.WaitAsync(TimeSpan.FromSeconds(15));
        Assert.False(create.IsCompleted);
        await edit.CommitAsync();
        Assert.True((await create.WaitAsync(TimeSpan.FromSeconds(15))).Succeeded);
        await using var verify = Context(database.ConnectionString);
        Assert.Equal(2, (await verify.RouteRevisions.SingleAsync()).VersionNo);
        Assert.Equal(2, (await verify.Assignments.SingleAsync()).RouteVersionNo);
        Assert.Equal("Edited", (await verify.RouteRevisionPoints.SingleAsync()).Name);
    }

    [DbIntegrationFact]
    public async Task RouteEditWaitsUntilOldAssignmentSnapshotIsCommitted()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var ids = await SeedRoute(database.ConnectionString);
        using var release = new ManualResetEventSlim();
        var readingPoints = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var attemptedEdit = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var create = Task.Run(() => {
            using var db = Context(database.ConnectionString, new PointReadGate(() => { readingPoints.TrySetResult(); Assert.True(release.Wait(TimeSpan.FromSeconds(20))); }));
            using var cache = new MemoryCache(new MemoryCacheOptions());
            return Patrol(db, cache).Create(Request(ids.Employee, ids.Route));
        });
        await readingPoints.Task.WaitAsync(TimeSpan.FromSeconds(15));
        var edit = Task.Run(() => {
            using var db = Context(database.ConnectionString, new RouteLockProbe(() => attemptedEdit.TrySetResult()));
            using var cache = new MemoryCache(new MemoryCacheOptions());
            return Patrol(db, cache).UpdateRoutePoint(ids.Route, ids.Point, new("Edited later", null, "NFC", null, null, null, "active"));
        });
        try { await attemptedEdit.Task.WaitAsync(TimeSpan.FromSeconds(15)); Assert.False(edit.IsCompleted); }
        finally { release.Set(); }
        Assert.True((await create.WaitAsync(TimeSpan.FromSeconds(15))).Succeeded);
        Assert.True((await edit.WaitAsync(TimeSpan.FromSeconds(15))).Succeeded);
        await using var verify = Context(database.ConnectionString);
        Assert.Equal(1, (await verify.RouteRevisions.SingleAsync()).VersionNo);
        Assert.Equal("Original", (await verify.RouteRevisionPoints.SingleAsync()).Name);
        Assert.Equal("Edited later", (await verify.RoutePoints.SingleAsync()).Name);
    }

    [DbIntegrationFact]
    public async Task ConcurrentAssignmentsReuseOneRevision()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var ids = await SeedRoute(database.ConnectionString);
        using var start = new Barrier(2);
        Task<CreatePatrolRequestResult> Create(int day) => Task.Run(() => {
            using var db = Context(database.ConnectionString); using var cache = new MemoryCache(new MemoryCacheOptions());
            Assert.True(start.SignalAndWait(TimeSpan.FromSeconds(15)));
            return Patrol(db, cache).Create(Request(ids.Employee, ids.Route, day));
        });
        var results = await Task.WhenAll(Create(12), Create(13));
        Assert.All(results, result => Assert.True(result.Succeeded));
        await using var verify = Context(database.ConnectionString);
        Assert.Equal(1, await verify.RouteRevisions.CountAsync());
        Assert.Equal(2, await verify.Assignments.CountAsync());
        Assert.Single(await verify.Assignments.Select(row => row.RouteRevisionId).Distinct().ToListAsync());
    }

    [DbIntegrationFact]
    public async Task ConcurrentCompletionReturnsOneSuccessAndOneVersionConflict()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        Guid id;
        await using (var seed = Context(database.ConnectionString)) {
            var session = Session(DateTimeOffset.UtcNow.AddHours(-3)); id = session.Id;
            seed.EmuWorkSessions.Add(session); await seed.SaveChangesAsync();
        }
        using var start = new Barrier(2);
        Task<EmuCommandResult<EmuWorkSessionDto>> Complete(string comment) => Task.Run(() => {
            using var db = Context(database.ConnectionString);
            var service = new EfEmuService(db);
            Assert.True(service.GetWorkSession(id).Succeeded); // Same permission/read path as the controller.
            Assert.True(start.SignalAndWait(TimeSpan.FromSeconds(15)));
            return service.CompleteWorkSession(id, new(null, null, "Выполнено", comment, null, 1), null, "test");
        });
        var results = await Task.WhenAll(Complete("First"), Complete("Second"));
        Assert.Single(results, result => result.Succeeded);
        Assert.Contains("rowVersion", Assert.Single(results, result => !result.Succeeded).Errors.Keys);
        await using var verify = Context(database.ConnectionString);
        Assert.Equal(2, (await verify.EmuWorkSessions.SingleAsync()).RowVersion);
        Assert.Equal(1, await verify.EmuWorkAuditEvents.CountAsync(row => row.EventType == "completed"));
    }

    [DbIntegrationFact]
    public async Task GroupCompletionChecksEveryArrivalAndPartialCompletionKeepsOthersActive()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var db = Context(database.ConnectionString);
        var start = DateTimeOffset.UtcNow.AddHours(-3); var session = Session(start);
        session.Employees.Add(new() { Id = Guid.NewGuid(), Employee = Employee(), ArrivedAt = start.AddHours(2), FullNameSnapshot = "Later" });
        db.EmuWorkSessions.Add(session); await db.SaveChangesAsync();
        var firstEmployeeId = session.Employees[0].EmployeeId;
        var service = new EfEmuService(db);
        var invalid = service.CompleteWorkSession(session.Id, new(null, start.AddHours(1), "Выполнено", "Invalid group time", null, 1), null, "test");
        Assert.False(invalid.Succeeded); Assert.Contains("completedAt", invalid.Errors.Keys);
        var partial = service.CompleteWorkSession(session.Id, new([firstEmployeeId], start.AddHours(1), "Выполнено", "Partial", null, 1), null, "test");
        Assert.True(partial.Succeeded);
        db.ChangeTracker.Clear();
        Assert.Null((await db.EmuWorkSessions.SingleAsync()).CompletedAt);
        Assert.Null((await db.EmuWorkSessionEmployees.SingleAsync(row => row.EmployeeId != firstEmployeeId)).FinishedAt);
    }

    [DbIntegrationFact]
    public Task CompletionFailureRollsBackCardParticipantsPlanAndAudit() => CheckCompletionRollback(false);

    [DbIntegrationFact]
    public Task CompletionFailureInsideMobileTransactionRollsBackToSavepoint() => CheckCompletionRollback(true);

    private async Task CheckCompletionRollback(bool ambientTransaction)
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        Guid id;
        await using (var seed = Context(database.ConnectionString)) {
            var session = Session(DateTimeOffset.UtcNow.AddHours(-3)); id = session.Id;
            session.PlanTask = new() { Id = Guid.NewGuid(), Title = "Linked plan", PlannedDate = session.WorkDate, CreatedAt = session.CreatedAt, UpdatedAt = session.CreatedAt, Status = "В работе" };
            seed.EmuWorkSessions.Add(session); await seed.SaveChangesAsync();
            seed.EmuWorkParticipationIntervals.Add(new() { Id = Guid.NewGuid(), WorkSessionId = id, WorkSessionEmployeeId = session.Employees[0].Id, EmployeeId = session.Employees[0].EmployeeId, StartedAt = session.ArrivedAt, CreatedAt = session.ArrivedAt, Status = "Работает" });
            await seed.SaveChangesAsync();
        }
        await using (var db = Context(database.ConnectionString, new FailIntervalUpdate())) {
            await using var outer = ambientTransaction ? await db.Database.BeginTransactionAsync() : null;
            Assert.Throws<InvalidOperationException>(() => new EfEmuService(db).CompleteWorkSession(id, new(null, null, "Выполнено", "Test", null, 1), null, "test"));
            if (outer is not null) { db.ChangeTracker.Clear(); Assert.Null((await db.EmuWorkSessions.AsNoTracking().SingleAsync()).CompletedAt); await outer.CommitAsync(); }
        }
        await using var verify = Context(database.ConnectionString);
        Assert.Null((await verify.EmuWorkSessions.SingleAsync()).CompletedAt);
        Assert.Equal(1, (await verify.EmuWorkSessions.SingleAsync()).RowVersion);
        Assert.Null((await verify.EmuWorkSessionEmployees.SingleAsync()).FinishedAt);
        Assert.Null((await verify.EmuWorkParticipationIntervals.SingleAsync()).EndedAt);
        Assert.Equal("В работе", (await verify.EmuWorkPlanTasks.SingleAsync()).Status);
        Assert.Equal(0, await verify.EmuWorkAuditEvents.CountAsync());
    }

    [DbIntegrationFact]
    public async Task TwoMaintenanceWorkersCarryOverOnlyOnce()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using (var seed = Context(database.ConnectionString)) { seed.EmuWorkSessions.Add(Session(DateTimeOffset.UtcNow.AddDays(-2))); await seed.SaveChangesAsync(); }
        var now = DateTimeOffset.UtcNow;
        Task<int> Carry() => Task.Run(() => { using var db = Context(database.ConnectionString); return new EfEmuService(db).CarryOverForgottenWork(now); });
        Assert.Equal(1, (await Task.WhenAll(Carry(), Carry())).Sum());
        await using var verify = Context(database.ConnectionString);
        Assert.Equal(1, await verify.EmuWorkSessionCarryOvers.CountAsync());
        Assert.Equal(2, (await verify.EmuWorkSessions.SingleAsync()).RowVersion);
    }

    [DbIntegrationFact]
    public Task PauseAndCompletionShareVersionAndTransaction() => CheckConcurrentWorkMutation("pause");

    [DbIntegrationFact]
    public Task DeleteAndCompletionShareVersionAndTransaction() => CheckConcurrentWorkMutation("delete");

    [DbIntegrationFact]
    public Task JoinAndCompletionShareVersionAndTransaction() => CheckConcurrentWorkMutation("join");

    private async Task CheckConcurrentWorkMutation(string operation)
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        Guid id, employeeId, extraId, reasonId;
        await using (var seed = Context(database.ConnectionString)) {
            var session = Session(DateTimeOffset.UtcNow.AddHours(-3)); id = session.Id;
            var extra = Employee(); var reason = new EmuWaitReasonEntity { Id = Guid.NewGuid(), Code = "test", Name = "Test" };
            seed.Employees.Add(extra); seed.EmuWaitReasons.Add(reason); seed.EmuWorkSessions.Add(session); await seed.SaveChangesAsync();
            employeeId = session.Employees[0].EmployeeId; extraId = extra.Id; reasonId = reason.Id;
        }
        using var start = new Barrier(2);
        Task<EmuCommandResult<EmuWorkSessionDto>> Run(bool complete) => Task.Run(() => {
            using var db = Context(database.ConnectionString); var service = new EfEmuService(db);
            Assert.True(service.GetWorkSession(id).Succeeded);
            Assert.True(start.SignalAndWait(TimeSpan.FromSeconds(15)));
            if (complete) return service.CompleteWorkSession(id, new(null, null, "Выполнено", "Completed", null, 1), null, "test");
            return operation switch {
                "pause" => service.PauseWorkSession(id, new([employeeId], reasonId, null, "Pause", RowVersion: 1), null, "test"),
                "delete" => service.DeleteWorkSession(id, new("Test removal", 1), null, "test"),
                _ => service.AddWorkSessionEmployee(id, new(extraId, null, "Join", 1), null, "test")
            };
        });
        var results = await Task.WhenAll(Run(true), Run(false));
        Assert.Single(results, result => result.Succeeded);
        Assert.Contains("rowVersion", Assert.Single(results, result => !result.Succeeded).Errors.Keys);
        await using var verify = Context(database.ConnectionString);
        Assert.Equal(2, (await verify.EmuWorkSessions.SingleAsync()).RowVersion);
        Assert.Equal(1, await verify.EmuWorkAuditEvents.CountAsync());
    }

    [DbIntegrationFact]
    public async Task NightlyCarryOverAndCompletionCannotOverwriteEachOther()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        Guid id;
        await using (var seed = Context(database.ConnectionString)) {
            var session = Session(DateTimeOffset.UtcNow.AddDays(-2)); id = session.Id;
            seed.EmuWorkSessions.Add(session); await seed.SaveChangesAsync();
        }
        using var start = new Barrier(2);
        var complete = Task.Run(() => { using var db = Context(database.ConnectionString); Assert.True(start.SignalAndWait(TimeSpan.FromSeconds(15))); return new EfEmuService(db).CompleteWorkSession(id, new(null, null, "Выполнено", "Completed", null, 1), null, "test"); });
        var carry = Task.Run(() => { using var db = Context(database.ConnectionString); Assert.True(start.SignalAndWait(TimeSpan.FromSeconds(15))); return new EfEmuService(db).CarryOverForgottenWork(DateTimeOffset.UtcNow); });
        await Task.WhenAll(complete, carry);
        Assert.Equal(1, (complete.Result.Succeeded ? 1 : 0) + carry.Result);
        await using var verify = Context(database.ConnectionString);
        Assert.Equal(2, (await verify.EmuWorkSessions.SingleAsync()).RowVersion);
        Assert.Equal(1, await verify.EmuWorkAuditEvents.CountAsync());
    }

    [DbIntegrationFact]
    public async Task LegacyPhotoFlagsDoNotBlock54PointReportAndPointLookupsAreBatched()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var ids = await SeedRoute(database.ConnectionString);
        var counter = new PointQueryCounter();
        await using var db = Context(database.ConnectionString, counter);
        for (var i = 2; i <= 54; i++) db.RoutePoints.Add(new() { Id = Guid.NewGuid(), RouteId = ids.Route, Name = $"Point {i}", SequenceNo = i, IsRequired = true, RequiresPhoto = true, Status = "active" });
        await db.SaveChangesAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions()); var service = Patrol(db, cache);
        var created = service.Create(Request(ids.Employee, ids.Route)); Assert.True(created.Succeeded);
        // Simulate a pre-existing immutable revision. The flag must stay in its
        // history while the effective reporting rule is voluntary.
        await db.RouteRevisionPoints.ExecuteUpdateAsync(setters => setters.SetProperty(row => row.RequiresPhoto, true));
        db.ChangeTracker.Clear();
        var points = await db.RoutePoints.Where(row => row.RouteId == ids.Route).Select(row => row.Id).ToArrayAsync();
        var payload = new CompleteAssignmentDto(DateTimeOffset.UtcNow, "Замечание", null, "Test report", "Неисправность", null,
            PointResults: points.Select(id => new CompleteAssignmentPointDto(id, "Замечание", "Шум", "Неисправность", null)).ToArray());
        var badFile = service.Complete(created.Request!.AssignmentId!.Value, payload with {
            PhotoAttachments = [new("invalid.exe", "application/octet-stream", Convert.ToBase64String([1, 2, 3]))]
        });
        Assert.False(badFile!.Succeeded);
        counter.Lookups = 0; counter.BulkReads = 0;
        Assert.True(service.Complete(created.Request.AssignmentId.Value, payload)!.Succeeded);
        Assert.Equal(54, await db.PatrolResults.CountAsync());
        Assert.Equal(0, counter.Lookups); Assert.Equal(1, counter.BulkReads);
        Assert.True(await db.RouteRevisionPoints.AllAsync(row => row.RequiresPhoto));
        Assert.All(service.GetRoute(ids.Route)!.Points, point => Assert.False(point.RequiresPhoto));
    }

    private sealed class PointQueryCounter : DbCommandInterceptor
    {
        internal int Lookups, BulkReads;
        public override InterceptionResult<DbDataReader> ReaderExecuting(DbCommand command, CommandEventData data, InterceptionResult<DbDataReader> result) {
            if (command.CommandText.Contains("FROM route_points AS") && !command.CommandText.Contains("JOIN")) {
                if (command.CommandText.Contains("SELECT EXISTS")) Lookups++;
                else BulkReads++;
            }
            return result;
        }
    }

    private sealed class RouteLockProbe(Action action) : DbCommandInterceptor
    {
        public override InterceptionResult<int> NonQueryExecuting(DbCommand command, CommandEventData data, InterceptionResult<int> result) {
            if (command.CommandText.Contains("FROM routes") && command.CommandText.Contains("FOR UPDATE")) action(); return result;
        }
    }
    private sealed class PointReadGate(Action action) : DbCommandInterceptor
    {
        private bool called;
        public override InterceptionResult<DbDataReader> ReaderExecuting(DbCommand command, CommandEventData data, InterceptionResult<DbDataReader> result) {
            if (!called && command.CommandText.Contains("FROM route_points AS") && command.CommandText.Contains("ORDER BY")) { called = true; action(); } return result;
        }
    }
    private sealed class FailIntervalUpdate : DbCommandInterceptor
    {
        public override InterceptionResult<int> NonQueryExecuting(DbCommand command, CommandEventData data, InterceptionResult<int> result) {
            if (command.CommandText.Contains("UPDATE emu_work_participation_intervals")) throw new InvalidOperationException("Synthetic SQL failure"); return result;
        }
    }
}

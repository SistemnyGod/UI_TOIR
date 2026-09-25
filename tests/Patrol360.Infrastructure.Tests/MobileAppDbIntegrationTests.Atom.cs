using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Npgsql;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed partial class MobileAppDbIntegrationTests
{
    [DbIntegrationFact]
    public async Task AtomSwitchAndAppealPreserveLifecycleAndRejectForeignPerformer()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var created = UseMobileAccounts(provider, accounts => accounts.CreateAccount(new CreateMobileAccountDto(
            "Петров Иван Александрович", "selected", $"atom_{Guid.NewGuid():N}"[..18], "Обходчик",
            BindEmployee: true, RestrictToBoundDevice: false, TemporaryPassword: false,
            Password: "Patrol360!", ConfirmPassword: "Patrol360!", RequirePasswordChange: false)));
        var account = created.Account!;
        Assert.True(created.Succeeded);
        var employeeId = account.BoundEmployeeIds[0];
        ClearInProgressAssignments(database.ConnectionString, employeeId);
        var route = UseRoutes(provider, routes => routes.GetRoutes().First(item => item.Points.Count > 0));
        var token = UseMobileApp(provider, service => service.Login(new MobileLoginRequestDto(account.Login,
            "Patrol360!", "atom-test", "Atom test", "Android", "0.1.30"), "127.0.0.1")).Session!.AccessToken;
        MobileOutboxResponseDto Send(string type, Guid entity, Dictionary<string, object?> payload, string? operation = null) =>
            Assert.Single(UseMobileApp(provider, service => service.SaveOutbox(token, new MobileOutboxBatchDto([
                BuildLifecycleCommand(operation ?? Guid.NewGuid().ToString(), type, entity, entity, payload)]))));
        MobileBootstrapDto Bootstrap() => UseMobileApp(provider, service => service.GetBootstrap(token))!;
        var a = Guid.NewGuid(); var b = Guid.NewGuid();
        foreach (var assignmentId in new[] { a, b })
        {
            var requestId = CreateUnassignedPatrolRequest(database.ConnectionString, employeeId, account.BoundEmployees[0], route.Id, route.Name);
            var request = Assert.Single(Bootstrap().RequestBoard, item => item.RequestId == requestId);
            if (assignmentId == a)
            {
                var bootstrapWithManifest = Bootstrap();
                Assert.True(bootstrapWithManifest.PatrolSnapshotManifest);
                Assert.True(bootstrapWithManifest.BoundEmployeesComplete);
                var manifest = Assert.Single(bootstrapWithManifest.PatrolSnapshotManifests, item => item.RouteId == route.Id);
                Assert.True(manifest.IsComplete);
                Assert.Equal(route.VersionNo, manifest.RouteVersion);
                Assert.Equal(
                    bootstrapWithManifest.Points.Where(point => point.RouteId == route.Id).Select(point => (point.PointId, point.Revision)).OrderBy(item => item.PointId),
                    manifest.Points.Select(point => (point.PointId, point.Revision)).OrderBy(item => item.PointId));
            }
            var payload = new Dictionary<string, object?> { ["requestId"] = requestId, ["routeId"] = route.Id, ["requestRevision"] = request.Revision, ["employeeId"] = Guid.NewGuid() };
            Assert.Equal("rejected", Send("acceptPatrolRequest", assignmentId, payload).Status);
            payload["employeeId"] = "not-a-guid";
            Assert.Equal("rejected", Send("acceptPatrolRequest", assignmentId, payload).Status);
            payload["employeeId"] = employeeId;
            Assert.Equal("accepted", Send("acceptPatrolRequest", assignmentId, payload).Status);
        }
        Assert.Equal("accepted", Send("startPatrolAssignment", a, new() { ["assignmentId"] = a }).Status);
        Dictionary<string, object?> SwitchPayload(Guid from, Guid to) { var bootstrap = Bootstrap(); return new() {
            ["assignmentId"] = to, ["sourceAssignmentId"] = from,
            ["sourceRevision"] = bootstrap.Assignments.Single(item => item.AssignmentId == from).Revision,
            ["targetRevision"] = bootstrap.Assignments.Single(item => item.AssignmentId == to).Revision }; }
        var switchPayload = SwitchPayload(a, b);
        var switchOperation = Guid.NewGuid().ToString();
        Assert.Equal("accepted", Send("switchPatrolAssignment", b, switchPayload, switchOperation).Status);
        Assert.Equal("duplicate", Send("switchPatrolAssignment", b, switchPayload, switchOperation).Status);
        Assert.Equal(AssignmentPausedStatus, ReadAssignmentStatus(database.ConnectionString, a));
        Assert.Equal(AssignmentInProgressStatus, ReadAssignmentStatus(database.ConnectionString, b));
        Assert.Equal("accepted", Send("switchPatrolAssignment", a, SwitchPayload(b, a)).Status);
        Assert.Equal("conflict", Send("switchPatrolAssignment", b, switchPayload).Status);
        Assert.Equal(AssignmentInProgressStatus, ReadAssignmentStatus(database.ConnectionString, a));
        Assert.Equal(AssignmentPausedStatus, ReadAssignmentStatus(database.ConnectionString, b));
        var appealId = Guid.NewGuid();
        var appealPayload = new Dictionary<string, object?> { ["assignmentId"] = a, ["kind"] = "cancel", ["message"] = "Оборудование остановлено" };
        Assert.Equal("accepted", Send("createPatrolAppeal", appealId, appealPayload).Status);
        Assert.Equal("duplicate", Send("createPatrolAppeal", Guid.NewGuid(), appealPayload).Status);
        Assert.Equal(AssignmentInProgressStatus, ReadAssignmentStatus(database.ConnectionString, a));
        var appeal = Assert.Single(Bootstrap().PatrolAppeals);
        Assert.Equal("open", appeal.Status);
        using (var scope = provider.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<IMobilePatrolAppealService>();
            Assert.Throws<InvalidOperationException>(() => service.ResolvePatrolAppeal(appeal.Id, new("approve", "", appeal.Version, -1), null, "Диспетчер"));
        }
        using (var scope = provider.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<IMobilePatrolAppealService>();
            Assert.Equal("rejected", service.ResolvePatrolAppeal(appeal.Id, new("reject", "Продолжите обход", appeal.Version, appeal.AssignmentVersion), null, "Диспетчер")!.Status);
        }
        Assert.Equal("Продолжите обход", Assert.Single(Bootstrap().PatrolAppeals).Reply);
        Assert.Equal(AssignmentInProgressStatus, ReadAssignmentStatus(database.ConnectionString, a));
        var secondAppeal = Guid.NewGuid();
        Assert.Equal("accepted", Send("createPatrolAppeal", secondAppeal, appealPayload).Status);
        // Completion wins a later dispatcher approval; it must never cancel the finished report.
        using (var connection = new NpgsqlConnection(database.ConnectionString))
        { connection.Open(); using var command = connection.CreateCommand(); command.CommandText = "UPDATE assignments SET status = 'Завершено', lock_version = lock_version + 1 WHERE id = @id"; command.Parameters.AddWithValue("id", a); command.ExecuteNonQuery(); }
        var pending = Bootstrap().PatrolAppeals.Single(item => item.Id == secondAppeal);
        using (var scope = provider.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<IMobilePatrolAppealService>();
            Assert.Equal("obsolete", service.ResolvePatrolAppeal(pending.Id, new("approve", "", pending.Version, pending.AssignmentVersion - 1), null, "Диспетчер")!.Status);
        }
        Assert.Equal("Завершено", ReadAssignmentStatus(database.ConnectionString, a));
        // The old UI exposed fake conflict decisions. They must never acknowledge a resolution.
        using (var scope = provider.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<IMobilePatrolAppealService>();
            Assert.Throws<ArgumentException>(() => service.ResolvePatrolAppeal(pending.Id,
                new("saveCancellation", "", pending.Version, pending.AssignmentVersion), null, "Диспетчер"));
        }

        // Equal completion times exercise the stable ID tie-breaker in both paging contracts.
        using (var connection = new NpgsqlConnection(database.ConnectionString))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "UPDATE assignments SET status = 'Завершено', finished_at = '2100-01-01T00:00:00Z' WHERE id IN (@a, @b)";
            command.Parameters.AddWithValue("a", a); command.Parameters.AddWithValue("b", b);
            command.ExecuteNonQuery();
        }
        var firstPage = UseMobileApp(provider, service => service.GetPatrolReports(token, 1, 1))!;
        Assert.NotNull(firstPage.NextCursor);
        var nextPage = UseMobileApp(provider, service => service.GetPatrolReports(token, 1, 1, firstPage.NextCursor))!;
        var legacyPage = UseMobileApp(provider, service => service.GetPatrolReports(token, 2, 1))!;
        Assert.NotEqual(firstPage.Items[0].AssignmentId, nextPage.Items[0].AssignmentId);
        Assert.Equal(legacyPage.Items[0].AssignmentId, nextPage.Items[0].AssignmentId);
        Assert.Throws<ArgumentException>(() => UseMobileApp(provider, service => service.GetPatrolReports(token, 1, 25, "invalid")));
    }
}

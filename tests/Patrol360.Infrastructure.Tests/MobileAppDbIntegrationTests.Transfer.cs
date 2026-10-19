using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

// Handover of an unfinished patrol to another employee of the shift
// (transferPatrolAssignment, docs/patrol-handover-2026-10-19.md).
public sealed partial class MobileAppDbIntegrationTests
{
    [DbIntegrationFact]
    public async Task TransferOnSharedPhoneKeepsFilledPointsWithOriginalPerformer()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var shift = CreateTransferShift(provider, database.ConnectionString);
        var patrol = StartTransferPatrol(provider, database.ConnectionString, shift.SharedToken, shift.First);
        var filled = patrol.PointIds[0];

        var payload = TransferPayload(patrol, shift.First.Id, shift.Second.Id, [PointResult(filled)]);
        var operation = Guid.NewGuid().ToString();
        var accepted = SendTransfer(provider, shift.SharedToken, patrol, payload, operation);
        Assert.Equal("accepted", accepted.Status);
        Assert.Equal("duplicate", SendTransfer(provider, shift.SharedToken, patrol, payload, operation).Status);
        Assert.Equal(AssignmentInProgressStatus, ReadAssignmentStatus(database.ConnectionString, patrol.AssignmentId));
        Assert.Equal(shift.Second.Id, ReadAssignmentEmployee(database.ConnectionString, patrol.AssignmentId));

        // The handover is recorded once even though the command was replayed.
        var journal = UseTransfers(provider, service => service.GetPatrolTransfers(patrol.AssignmentId, 10));
        var row = Assert.Single(journal);
        Assert.Equal("sameDevice", row.Mode);
        Assert.Equal(1, row.CarriedPointCount);
        Assert.Equal(shift.First.Name, row.FromEmployeeName);
        Assert.Equal(shift.Second.Name, row.ToEmployeeName);

        // A repeated handover from the previous performer is now stale.
        Assert.Equal("conflict", SendTransfer(provider, shift.SharedToken, patrol,
            TransferPayload(patrol, shift.First.Id, shift.Second.Id, []), Guid.NewGuid().ToString()).Status);

        var completed = SendTransferPatrolCommand(provider, shift.SharedToken, patrol, "completePatrolAssignment", new()
        {
            ["assignmentId"] = patrol.AssignmentId,
            ["requestId"] = patrol.RequestId,
            ["baseRevision"] = accepted.ServerRevision,
            ["completedAtLocal"] = DateTimeOffset.UtcNow,
            ["pointResults"] = patrol.PointIds.Select(PointResult).ToArray(),
        });
        Assert.Equal("accepted", completed.Status);
        var performers = ReadResultPerformers(database.ConnectionString, patrol.AssignmentId);
        Assert.Equal(shift.First.Id, performers[filled]);
        Assert.All(patrol.PointIds.Skip(1), pointId => Assert.Equal(shift.Second.Id, performers[pointId]));
    }

    [DbIntegrationFact]
    public async Task TransferToAnotherPhoneMovesPatrolAndCarriesPointsWithPhotos()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var shift = CreateTransferShift(provider, database.ConnectionString);
        var patrol = StartTransferPatrol(provider, database.ConnectionString, shift.SharedToken, shift.First);
        var filled = patrol.PointIds[0];

        var candidates = UseMobileApp(provider, service => service.GetPatrolTransferCandidates(shift.SharedToken))!;
        Assert.True(Assert.Single(candidates, item => item.EmployeeId == shift.Second.Id).SameAccount);
        Assert.False(Assert.Single(candidates, item => item.EmployeeId == shift.Third.Id).SameAccount);

        // Photos must reach the server before the handover is accepted.
        var photoId = Guid.NewGuid().ToString();
        var withPhoto = TransferPayload(patrol, shift.First.Id, shift.Third.Id, [PointResult(filled, photoId)]);
        var missing = SendTransfer(provider, shift.SharedToken, patrol, withPhoto, Guid.NewGuid().ToString());
        Assert.Equal("rejected", missing.Status);
        Assert.Equal("transferPhotosMissing", missing.ReasonCode);
        Assert.NotNull(UseMobileApp(provider, service => service.UploadFile(shift.SharedToken, new MobileFileUploadCommand(
            photoId, patrol.AssignmentId, filled, null, null, PhotoSha256, 3, DateTimeOffset.UtcNow,
            $"{photoId}.jpg", "image/jpeg", new MemoryStream([1, 2, 3])))));
        Assert.Equal("accepted", SendTransfer(provider, shift.SharedToken, patrol, withPhoto, Guid.NewGuid().ToString()).Status);
        Assert.Equal(AssignmentPausedStatus, ReadAssignmentStatus(database.ConnectionString, patrol.AssignmentId));

        // The patrol leaves the shared phone and reaches the colleague's phone
        // with the filled point.
        Assert.DoesNotContain(UseMobileApp(provider, service => service.GetBootstrap(shift.SharedToken, assignmentSnapshots: true))!.Assignments,
            item => item.AssignmentId == patrol.AssignmentId);
        var otherBootstrap = UseMobileApp(provider, service => service.GetBootstrap(shift.OtherToken, assignmentSnapshots: true))!;
        Assert.True(otherBootstrap.PatrolTransfer);
        var received = Assert.Single(otherBootstrap.Assignments, item => item.AssignmentId == patrol.AssignmentId);
        var carried = Assert.Single(received.TransferredPointResults);
        Assert.Equal(filled, carried.PointId);
        Assert.Equal(shift.First.Id, carried.PerformerEmployeeId);
        Assert.Equal(1, carried.PhotoCount);
        Assert.Contains(UseMobileApp(provider, service => service.GetNotifications(shift.OtherToken, false)),
            item => item.Type == "patrolTransferred" && item.EntityId == patrol.AssignmentId.ToString());

        var resumed = SendTransferPatrolCommand(provider, shift.OtherToken, patrol, "resumePatrolAssignment",
            new() { ["assignmentId"] = patrol.AssignmentId });
        Assert.Equal("accepted", resumed.Status);
        // The receiving phone has no photo files of the carried point.
        var completed = SendTransferPatrolCommand(provider, shift.OtherToken, patrol, "completePatrolAssignment", new()
        {
            ["assignmentId"] = patrol.AssignmentId,
            ["requestId"] = patrol.RequestId,
            ["baseRevision"] = resumed.ServerRevision,
            ["completedAtLocal"] = DateTimeOffset.UtcNow,
            ["pointResults"] = patrol.PointIds.Select(pointId => PointResult(pointId)).ToArray(),
        });
        Assert.Equal("accepted", completed.Status);
        var performers = ReadResultPerformers(database.ConnectionString, patrol.AssignmentId);
        Assert.Equal(shift.First.Id, performers[filled]);
        Assert.All(patrol.PointIds.Skip(1), pointId => Assert.Equal(shift.Third.Id, performers[pointId]));
        Assert.Equal(1, ReadResultPhotos(database.ConnectionString, patrol.AssignmentId, filled));
        Assert.Equal("otherDevice", Assert.Single(UseTransfers(provider, service => service.GetPatrolTransfers(null, 50)),
            item => item.AssignmentId == patrol.AssignmentId).Mode);
    }

    [DbIntegrationFact]
    public async Task TransferRejectsBusyColleagueOnSharedPhone()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var shift = CreateTransferShift(provider, database.ConnectionString);
        var patrol = StartTransferPatrol(provider, database.ConnectionString, shift.SharedToken, shift.First);
        StartTransferPatrol(provider, database.ConnectionString, shift.SharedToken, shift.Second);

        var busy = SendTransfer(provider, shift.SharedToken, patrol,
            TransferPayload(patrol, shift.First.Id, shift.Second.Id, []), Guid.NewGuid().ToString());
        Assert.Equal("conflict", busy.Status);
        Assert.Equal("transferTargetBusy", busy.ReasonCode);
        Assert.Equal(shift.First.Id, ReadAssignmentEmployee(database.ConnectionString, patrol.AssignmentId));
        Assert.Empty(UseTransfers(provider, service => service.GetPatrolTransfers(patrol.AssignmentId, 10)));
    }

    private sealed record TransferEmployee(Guid Id, string Name);

    private sealed record TransferShift(TransferEmployee First, TransferEmployee Second, TransferEmployee Third, string SharedToken, string OtherToken);

    private sealed record TransferPatrol(Guid AssignmentId, Guid RequestId, IReadOnlyList<Guid> PointIds);

    private static TransferShift CreateTransferShift(ServiceProvider provider, string connectionString)
    {
        var employees = ReadUnboundEmployees(connectionString, 3);
        foreach (var employee in employees) ClearInProgressAssignments(connectionString, employee.Id);
        string CreateAndLogin(TransferEmployee employee, TransferEmployee? colleague)
        {
            var created = UseMobileAccounts(provider, accounts => accounts.CreateAccount(new CreateMobileAccountDto(
                employee.Name, "selected", $"tr_{Guid.NewGuid():N}"[..18], "Обходчик", BindEmployee: true,
                RestrictToBoundDevice: false, TemporaryPassword: false, Password: "Patrol360!", ConfirmPassword: "Patrol360!",
                RequirePasswordChange: false)));
            Assert.True(created.Succeeded);
            if (colleague is not null)
                Assert.NotNull(UseMobileAccounts(provider, accounts => accounts.AttachEmployee(created.Account!.Id,
                    new AttachMobileAccountEmployeeDto(colleague.Id, colleague.Name))).Account);
            return UseMobileApp(provider, service => service.Login(new MobileLoginRequestDto(created.Account!.Login,
                "Patrol360!", $"transfer-{Guid.NewGuid():N}", "Transfer test", "Android", "0.1.52"), "127.0.0.1")).Session!.AccessToken;
        }

        return new TransferShift(employees[0], employees[1], employees[2],
            CreateAndLogin(employees[0], employees[1]), CreateAndLogin(employees[2], null));
    }

    private static TransferPatrol StartTransferPatrol(ServiceProvider provider, string connectionString, string token, TransferEmployee employee)
    {
        var route = UseRoutes(provider, routes => routes.GetRoutes().First(item => item.Points.Count > 1));
        var requestId = CreateUnassignedPatrolRequest(connectionString, employee.Id, employee.Name, route.Id, route.Name);
        var board = Assert.Single(UseMobileApp(provider, service => service.GetBootstrap(token))!.RequestBoard, item => item.RequestId == requestId);
        var assignmentId = Guid.NewGuid();
        var patrol = new TransferPatrol(assignmentId, requestId, []);
        Assert.Equal("accepted", SendTransferPatrolCommand(provider, token, patrol, "acceptPatrolRequest", new()
        {
            ["requestId"] = requestId, ["routeId"] = route.Id, ["requestRevision"] = board.Revision, ["employeeId"] = employee.Id,
        }).Status);
        Assert.Equal("accepted", SendTransferPatrolCommand(provider, token, patrol, "startPatrolAssignment",
            new() { ["assignmentId"] = assignmentId }).Status);
        var assignment = Assert.Single(UseMobileApp(provider, service => service.GetBootstrap(token, assignmentSnapshots: true))!.Assignments,
            item => item.AssignmentId == assignmentId);
        return patrol with { PointIds = assignment.RouteSnapshot!.Points.OrderBy(point => point.OrderIndex).Select(point => point.PointId).ToArray() };
    }

    private static Dictionary<string, object?> PointResult(Guid pointId) => PointResult(pointId, null);

    private static Dictionary<string, object?> PointResult(Guid pointId, string? photoId) => new()
    {
        ["pointId"] = pointId,
        ["status"] = "ok",
        ["completedAtLocal"] = DateTimeOffset.UtcNow,
        ["photoClientFileIds"] = photoId is null ? Array.Empty<string>() : new[] { photoId },
    };

    private static Dictionary<string, object?> TransferPayload(TransferPatrol patrol, Guid from, Guid to, Dictionary<string, object?>[] points) => new()
    {
        ["assignmentId"] = patrol.AssignmentId,
        ["requestId"] = patrol.RequestId,
        ["fromEmployeeId"] = from,
        ["toEmployeeId"] = to,
        ["reason"] = "Конец смены",
        ["transferredAtLocal"] = DateTimeOffset.UtcNow,
        ["pointResults"] = points,
    };

    private static MobileOutboxResponseDto SendTransfer(ServiceProvider provider, string token, TransferPatrol patrol,
        Dictionary<string, object?> payload, string operation) =>
        SendTransferPatrolCommand(provider, token, patrol, "transferPatrolAssignment", payload, operation);

    private static MobileOutboxResponseDto SendTransferPatrolCommand(ServiceProvider provider, string token, TransferPatrol patrol,
        string type, Dictionary<string, object?> payload, string? operation = null) =>
        Assert.Single(UseMobileApp(provider, service => service.SaveOutbox(token, new MobileOutboxBatchDto([
            BuildLifecycleCommand(operation ?? Guid.NewGuid().ToString(), type, patrol.AssignmentId, patrol.AssignmentId, payload)]))));

    private static T UseTransfers<T>(ServiceProvider provider, Func<IPatrolTransferService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IPatrolTransferService>());
    }

    private static TransferEmployee[] ReadUnboundEmployees(string connectionString, int count)
    {
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT e.id, e.full_name FROM employees e
            WHERE e.full_name <> ''
              AND NOT EXISTS (SELECT 1 FROM mobile_account_employee_bindings b WHERE b.employee_id = e.id AND b.detached_at IS NULL)
              AND (SELECT count(*) FROM employees same WHERE same.full_name = e.full_name) = 1
            ORDER BY e.full_name
            LIMIT @count;
            """;
        command.Parameters.AddWithValue("count", count);
        using var reader = command.ExecuteReader();
        var rows = new List<TransferEmployee>();
        while (reader.Read()) rows.Add(new TransferEmployee(reader.GetGuid(0), reader.GetString(1)));
        Assert.Equal(count, rows.Count);
        return rows.ToArray();
    }

    private static Guid ReadAssignmentEmployee(string connectionString, Guid assignmentId)
    {
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT employee_id FROM assignments WHERE id = @id;";
        command.Parameters.AddWithValue("id", assignmentId);
        return (Guid)command.ExecuteScalar()!;
    }

    private static Dictionary<Guid, Guid> ReadResultPerformers(string connectionString, Guid assignmentId)
    {
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT route_point_id, employee_id FROM patrol_results WHERE assignment_id = @id AND route_point_id IS NOT NULL;";
        command.Parameters.AddWithValue("id", assignmentId);
        using var reader = command.ExecuteReader();
        var rows = new Dictionary<Guid, Guid>();
        while (reader.Read()) rows[reader.GetGuid(0)] = reader.GetGuid(1);
        return rows;
    }

    private static int ReadResultPhotos(string connectionString, Guid assignmentId, Guid pointId)
    {
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT photos FROM patrol_results WHERE assignment_id = @id AND route_point_id = @point;";
        command.Parameters.AddWithValue("id", assignmentId);
        command.Parameters.AddWithValue("point", pointId);
        return Convert.ToInt32(command.ExecuteScalar());
    }
}

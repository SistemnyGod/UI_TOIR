using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Npgsql;

namespace Patrol360.Infrastructure.Tests;

public sealed class AssignmentsDbIntegrationTests
{
    private static readonly Guid FreePatrolRequestId = Guid.Parse("99999999-0000-0000-0000-000000000003");
    private static readonly Guid FuelDepotRouteId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid SidorovEmployeeId = Guid.Parse("aaaaaaaa-3333-3333-3333-333333333333");

    [DbIntegrationFact]
    public async Task AssignmentLifecyclePersistsThroughPostgres()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var created = UseAssignments(provider, assignments => assignments.Create(new CreateAssignmentDto(
            FreePatrolRequestId,
            SidorovEmployeeId,
            FuelDepotRouteId,
            DateTimeOffset.UtcNow.AddDays(1),
            "День")));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Assignment);
        Assert.Equal(FreePatrolRequestId, created.Assignment!.PatrolRequestId);

        var duplicate = UseAssignments(provider, assignments => assignments.Create(new CreateAssignmentDto(
            FreePatrolRequestId,
            SidorovEmployeeId,
            FuelDepotRouteId,
            DateTimeOffset.UtcNow.AddDays(1),
            "День")));

        Assert.True(duplicate.Succeeded);
        Assert.Empty(duplicate.Errors);
        Assert.NotNull(duplicate.Assignment);
        Assert.Equal(created.Assignment.Id, duplicate.Assignment!.Id);

        var started = UseAssignments(provider, assignments => assignments.Start(created.Assignment.Id));
        Assert.NotNull(started);
        Assert.True(started!.Changed);
        Assert.Equal("В пути", started.Assignment.Status);

        var repeatedStart = UseAssignments(provider, assignments => assignments.Start(created.Assignment.Id));
        Assert.NotNull(repeatedStart);
        Assert.False(repeatedStart!.Changed);

        var routePointResults = await ReadRoutePointResultsAsync(database.ConnectionString, FuelDepotRouteId);
        var completed = UseAssignments(provider, assignments => assignments.Complete(created.Assignment.Id, new CompleteAssignmentDto(
            DateTimeOffset.UtcNow,
            "Подтверждено",
            null,
            "Тестовое завершение обхода.",
            null,
            null,
            0,
            routePointResults)));
        Assert.NotNull(completed);
        Assert.True(completed!.Changed);
        Assert.Equal(100, completed.Assignment.ProgressPercent);

        var repeatedComplete = UseAssignments(provider, assignments => assignments.Complete(created.Assignment.Id));
        Assert.NotNull(repeatedComplete);
        Assert.False(repeatedComplete!.Changed);

        var reloaded = UseAssignments(provider, assignments => assignments.GetAssignments()
            .Single(assignment => assignment.Id == created.Assignment.Id));

        Assert.Equal("Завершено", reloaded.Status);
        Assert.Equal(100, reloaded.ProgressPercent);
        Assert.NotNull(reloaded.FinishedAt);
    }

    [DbIntegrationFact]
    public async Task CreateAssignmentAcceptsNonUtcPlannedAtAndStoresUtc()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var plannedAt = new DateTimeOffset(2026, 5, 28, 10, 20, 0, TimeSpan.FromHours(5));
        var created = UseAssignments(provider, assignments => assignments.Create(new CreateAssignmentDto(
            FreePatrolRequestId,
            SidorovEmployeeId,
            FuelDepotRouteId,
            plannedAt,
            "Day")));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Assignment);
        Assert.Equal(TimeSpan.Zero, created.Assignment!.PlannedAt.Offset);
        Assert.Equal(plannedAt.ToUniversalTime(), created.Assignment.PlannedAt);
    }

    [DbIntegrationFact]
    public async Task CreatePatrolRequestUsesClientPlannedAtAndRejectsShiftConflict()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var scheduledDate = new DateOnly(2031, 5, 28);
        var plannedAt = new DateTimeOffset(2031, 5, 28, 8, 0, 0, TimeSpan.FromHours(5));
        var created = UseRequests(provider, requests => requests.Create(new CreatePatrolRequestDto(
            EmployeeId: SidorovEmployeeId,
            EmployeeName: null,
            RouteId: FuelDepotRouteId,
            RouteName: null,
            SourceResultId: null,
            ScheduledDate: scheduledDate,
            ScheduledTime: new TimeOnly(8, 0),
            Shift: "День",
            NotifyEmployee: true,
            NotificationText: null,
            Description: "Client plannedAt request",
            PlannedAt: plannedAt)));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Request);

        var assignment = UseAssignments(provider, assignments => assignments.GetAssignments()
            .Single(item => item.PatrolRequestId == created.Request!.Id));
        Assert.Equal(plannedAt.ToUniversalTime(), assignment.PlannedAt);
        Assert.Equal("Ожидает", assignment.Status);

        var duplicateShift = UseRequests(provider, requests => requests.Create(new CreatePatrolRequestDto(
            EmployeeId: SidorovEmployeeId,
            EmployeeName: null,
            RouteId: FuelDepotRouteId,
            RouteName: null,
            SourceResultId: null,
            ScheduledDate: scheduledDate,
            ScheduledTime: new TimeOnly(10, 0),
            Shift: "День",
            NotifyEmployee: true,
            NotificationText: null,
            Description: "Conflicting request",
            PlannedAt: plannedAt.AddHours(2))));

        Assert.False(duplicateShift.Succeeded);
        Assert.Contains("employee", duplicateShift.Errors.Keys);
        Assert.Contains("активное назначение", duplicateShift.Errors["employee"][0]);
    }

    [DbIntegrationFact]
    public async Task CreateAssignmentRejectsClosedRequestInsteadOfHittingUniqueIndex()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var created = UseAssignments(provider, assignments => assignments.Create(new CreateAssignmentDto(
            FreePatrolRequestId,
            SidorovEmployeeId,
            FuelDepotRouteId,
            DateTimeOffset.UtcNow.AddDays(1),
            "Day")));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Assignment);

        var cancelled = UseAssignments(provider, assignments => assignments.Cancel(created.Assignment!.Id));
        Assert.NotNull(cancelled);
        Assert.True(cancelled!.Changed);

        var repeated = UseAssignments(provider, assignments => assignments.Create(new CreateAssignmentDto(
            FreePatrolRequestId,
            SidorovEmployeeId,
            FuelDepotRouteId,
            DateTimeOffset.UtcNow.AddDays(1),
            "Day")));

        Assert.False(repeated.Succeeded);
        Assert.Null(repeated.Assignment);
        Assert.Contains("patrolRequestId", repeated.Errors.Keys);
    }

    [DbIntegrationFact]
    public async Task DashboardShiftCoverageIsZeroWithoutActiveAssignments()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();
        await CancelAllAssignmentsAsync(database.ConnectionString);

        var dashboard = UseDashboard(provider, query => query.GetSummary());

        Assert.Equal(0, dashboard.ActivePatrols);
        Assert.Equal(0, dashboard.ShiftCoveragePercent);
    }

    [DbIntegrationFact]
    public async Task CompleteAssignmentRequiresPointChecklistForRequiredRoutePoints()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var created = UseAssignments(provider, assignments => assignments.Create(new CreateAssignmentDto(
            FreePatrolRequestId,
            SidorovEmployeeId,
            FuelDepotRouteId,
            DateTimeOffset.UtcNow.AddDays(1),
            "Day")));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Assignment);

        var rejected = UseAssignments(provider, assignments => assignments.Complete(created.Assignment!.Id, new CompleteAssignmentDto(
            DateTimeOffset.UtcNow,
            "Подтверждено",
            null,
            "Legacy completion without checklist",
            null,
            null,
            0)));

        Assert.NotNull(rejected);
        Assert.False(rejected!.Changed);
        Assert.Contains("pointResults", rejected.Errors!.Keys);
        Assert.Contains("чек-лист", rejected.Errors["pointResults"][0]);
    }

    [DbIntegrationFact]
    public async Task CompleteAssignmentPersistsPointChecklist()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var created = UseAssignments(provider, assignments => assignments.Create(new CreateAssignmentDto(
            FreePatrolRequestId,
            SidorovEmployeeId,
            FuelDepotRouteId,
            DateTimeOffset.UtcNow.AddDays(1),
            "Day")));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Assignment);

        var routePointResults = await ReadRoutePointResultsAsync(database.ConnectionString, FuelDepotRouteId);
        var dashboardBefore = UseDashboard(provider, query => query.GetSummary());

        var completed = UseAssignments(provider, assignments => assignments.Complete(created.Assignment!.Id, new CompleteAssignmentDto(
            DateTimeOffset.UtcNow,
            "ok",
            null,
            "Checklist complete",
            null,
            null,
            0,
            routePointResults)));

        Assert.NotNull(completed);
        Assert.True(completed!.Changed);

        var savedResultCount = await CountPatrolResultsAsync(database.ConnectionString, created.Assignment.Id);
        Assert.Equal(routePointResults.Count, savedResultCount);

        var dashboard = UseDashboard(provider, query => query.GetSummary());
        Assert.Equal(dashboardBefore.CompletedToday + 1, dashboard.CompletedToday);
        Assert.Equal(dashboardBefore.CompletedPoints + routePointResults.Count, dashboard.CompletedPoints);
    }

    [DbIntegrationFact]
    public async Task CompleteAssignmentValidatesPointChecklistWithReadableMessagesAndIssues()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var created = UseAssignments(provider, assignments => assignments.Create(new CreateAssignmentDto(
            FreePatrolRequestId,
            SidorovEmployeeId,
            FuelDepotRouteId,
            DateTimeOffset.UtcNow.AddDays(1),
            "Day")));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Assignment);

        var routePointResults = await ReadRoutePointResultsAsync(database.ConnectionString, FuelDepotRouteId);
        var firstPhotoIndex = routePointResults.FindIndex(point => point.Photos > 0);
        Assert.True(firstPhotoIndex >= 0);
        var missingPhoto = routePointResults
            .Select((point, index) => index == firstPhotoIndex ? point with { Photos = 0, PhotoAttachments = [] } : point)
            .ToList();

        var rejected = UseAssignments(provider, assignments => assignments.Complete(created.Assignment!.Id, new CompleteAssignmentDto(
            DateTimeOffset.UtcNow,
            "Подтверждено",
            null,
            "Checklist validation",
            null,
            null,
            0,
            missingPhoto)));

        Assert.NotNull(rejected);
        Assert.False(rejected!.Changed);
        Assert.Contains("photos", rejected.Errors!.Keys);
        Assert.Contains("Для точек с фотофиксацией прикрепите файлы фото", rejected.Errors["photos"][0]);

        routePointResults[firstPhotoIndex] = routePointResults[firstPhotoIndex] with
        {
            Status = "Замечание",
            IssueType = "Повреждение",
            Severity = "Высокая",
            Photos = 1
        };

        var completed = UseAssignments(provider, assignments => assignments.Complete(created.Assignment!.Id, new CompleteAssignmentDto(
            DateTimeOffset.UtcNow,
            "Подтверждено",
            null,
            "Checklist complete",
            null,
            null,
            0,
            routePointResults)));

        Assert.NotNull(completed);
        Assert.True(completed!.Changed);

        var savedIssueCount = await CountPatrolResultIssuesAsync(database.ConnectionString, created.Assignment.Id);
        Assert.Equal(1, savedIssueCount);
        var savedAttachmentCount = await CountPatrolResultAttachmentsAsync(database.ConnectionString, created.Assignment.Id);
        Assert.Equal(routePointResults.Count, savedAttachmentCount);
    }

    [DbIntegrationFact]
    public async Task RoutePointNfcCodeMustBeUnique()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var route = UseRouteQuery(provider, routes => routes.GetRoute(FuelDepotRouteId));
        Assert.NotNull(route);
        var existingPoint = route!.Points.First(point => !string.IsNullOrWhiteSpace(point.NfcCode));

        var duplicate = UseRouteService(provider, routes => routes.CreateRoutePoint(FuelDepotRouteId, new CreateRoutePointDto(
            "Duplicate NFC",
            existingPoint.Zone,
            existingPoint.Type,
            existingPoint.NfcCode,
            existingPoint.Interval,
            existingPoint.ExpectedTime,
            "Active",
            true)));

        Assert.False(duplicate.Succeeded);
        Assert.Contains("tag", duplicate.Errors.Keys);
        Assert.Contains("NFC-метка уже используется", duplicate.Errors["tag"][0]);
    }

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

    private static T UseAssignments<T>(ServiceProvider provider, Func<IAssignmentService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IAssignmentService>());
    }

    private static T UseRequests<T>(ServiceProvider provider, Func<IPatrolRequestService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IPatrolRequestService>());
    }

    private static T UseDashboard<T>(ServiceProvider provider, Func<IPatrolDashboardQuery, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IPatrolDashboardQuery>());
    }

    private static T UseRouteQuery<T>(ServiceProvider provider, Func<IRouteCatalogQuery, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IRouteCatalogQuery>());
    }

    private static T UseRouteService<T>(ServiceProvider provider, Func<IRouteCatalogService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IRouteCatalogService>());
    }

    private static async Task<List<CompleteAssignmentPointDto>> ReadRoutePointResultsAsync(string connectionString, Guid routeId)
    {
        var rows = new List<CompleteAssignmentPointDto>();
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            select id, requires_photo
            from route_points
            where route_id = @route_id
            order by seq_no;
            """;
        command.Parameters.AddWithValue("route_id", routeId);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var pointId = reader.GetGuid(0);
            var requiresPhoto = reader.GetBoolean(1);
            rows.Add(new CompleteAssignmentPointDto(
                pointId,
                "ok",
                "Point checked",
                null,
                "-",
                requiresPhoto ? 1 : 0,
                requiresPhoto ? [CreateTestPhoto()] : []));
        }

        return rows;
    }

    private static CompleteAssignmentPhotoDto CreateTestPhoto() =>
        new("point-photo.jpg", "image/jpeg", Convert.ToBase64String([0x01, 0x02, 0x03, 0x04]));

    private static async Task CancelAllAssignmentsAsync(string connectionString)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "update assignments set status = 'Отменено';";
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<int> CountPatrolResultsAsync(string connectionString, Guid assignmentId)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "select count(*) from patrol_results where assignment_id = @assignment_id;";
        command.Parameters.AddWithValue("assignment_id", assignmentId);
        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

    private static async Task<int> CountPatrolResultIssuesAsync(string connectionString, Guid assignmentId)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            select count(*)
            from patrol_result_issues issue
            join patrol_results result on result.id = issue.patrol_result_id
            where result.assignment_id = @assignment_id;
            """;
        command.Parameters.AddWithValue("assignment_id", assignmentId);
        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

    private static async Task<int> CountPatrolResultAttachmentsAsync(string connectionString, Guid assignmentId)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            select count(*)
            from patrol_result_attachments attachment
            join patrol_results result on result.id = attachment.patrol_result_id
            where result.assignment_id = @assignment_id;
            """;
        command.Parameters.AddWithValue("assignment_id", assignmentId);
        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

}

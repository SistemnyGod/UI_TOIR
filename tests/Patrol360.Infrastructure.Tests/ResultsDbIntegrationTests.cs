using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class ResultsDbIntegrationTests
{
    private const int MaxExportRows = 5000;
    private static readonly Guid FirstDemoAssignmentId = Guid.Parse("eeeeeeee-0000-0000-0000-000000000001");
    private static readonly Guid SecondDemoAssignmentId = Guid.Parse("eeeeeeee-0000-0000-0000-000000000002");

    [DbIntegrationFact]
    public async Task ResultsListDetailAndRequestSourcePersistThroughPostgres()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var results = UseResults(provider, query => query.GetResults(new ResultFilterDto(null, null, null, null, null)));

        Assert.NotEmpty(results);

        var sourceResult = results[0];
        var detail = UseResults(provider, query => query.GetResult(sourceResult.Id));

        Assert.NotNull(detail);
        Assert.Equal(sourceResult.Id, detail!.Id);
        Assert.Equal(sourceResult.RouteId, detail.RouteId);

        var created = UseRequests(provider, requests => requests.Create(new CreatePatrolRequestDto(
            EmployeeId: sourceResult.EmployeeId,
            EmployeeName: sourceResult.Employee,
            RouteId: sourceResult.RouteId,
            RouteName: sourceResult.Route,
            SourceResultId: sourceResult.Id,
            ScheduledDate: DateOnly.FromDateTime(DateTime.UtcNow.Date.AddDays(1)),
            ScheduledTime: new TimeOnly(9, 0),
            Shift: null,
            NotifyEmployee: false,
            NotificationText: null,
            Description: "Follow-up from result")));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Request);
        Assert.Equal(sourceResult.Id, created.Request!.SourceResultId);
        Assert.Equal("Назначена", created.Request.Status);

        var assignment = UseAssignments(provider, assignments => assignments.GetAssignments()
            .Single(item => item.PatrolRequestId == created.Request.Id));
        Assert.Equal(created.Request.Id, assignment.PatrolRequestId);
        Assert.Equal(sourceResult.EmployeeId, assignment.EmployeeId);
        Assert.Equal(sourceResult.RouteId, assignment.RouteId);

        var actualDate = DateOnly.FromDateTime(sourceResult.ActualAt.UtcDateTime);
        var filtered = UseResults(provider, query => query.GetResults(new ResultFilterDto(
            sourceResult.Status,
            sourceResult.RouteId,
            sourceResult.EmployeeId,
            actualDate,
            actualDate)));

        Assert.Contains(filtered, item => item.Id == sourceResult.Id);

        var export = UseResults(provider, query => query.ExportResults(new ResultFilterDto(
            sourceResult.Status,
            sourceResult.RouteId,
            sourceResult.EmployeeId,
            actualDate,
            actualDate)));

        Assert.Equal("text/csv; charset=utf-8", export.ContentType);
        Assert.StartsWith("patrol-results-", export.FileName);
        var csv = Encoding.UTF8.GetString(export.Content);
        Assert.Contains("AssignmentId;Status;Point;Employee;Route;Territory;Shift;PlannedAt;ActualAt;Deviation;Photos;IssueType;Severity;Comment;RoutePointId;RoutePointSequence;RoutePointType;NfcCode;RequiresPhoto;PhotoStatus;AttachmentCount", csv);
        Assert.Contains("PhotoStatus", csv);
        Assert.Contains("AttachmentCount", csv);
        Assert.Contains(sourceResult.Route, csv);
        Assert.Contains(sourceResult.Employee, csv);
    }

    [DbIntegrationFact]
    public async Task ResultsPagingKeepsAssignmentRowsTogether()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();
        var now = DateTimeOffset.UtcNow.AddDays(30);
        await InsertPatrolResultAsync(database.ConnectionString, FirstDemoAssignmentId, "Paged point A", now);
        await InsertPatrolResultAsync(database.ConnectionString, FirstDemoAssignmentId, "Paged point B", now.AddMinutes(-1));
        await InsertPatrolResultAsync(database.ConnectionString, SecondDemoAssignmentId, "Other assignment point", now.AddMinutes(-10));

        var firstPage = UseResults(provider, query => query.GetResults(
            new ResultFilterDto(null, null, null, null, null),
            page: 1,
            pageSize: 1));

        Assert.True(firstPage.Count > 1);
        Assert.All(firstPage, item => Assert.Equal(FirstDemoAssignmentId, item.AssignmentId));
        Assert.Contains(firstPage, item => item.Point == "Paged point A");
        Assert.Contains(firstPage, item => item.Point == "Paged point B");
    }

    [DbIntegrationFact]
    public async Task ResultsFilterSelectsPagedAssignmentGroupAndReturnsAllRows()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();
        var now = DateTimeOffset.UtcNow.AddDays(31);
        var issueResultId = await InsertPatrolResultAsync(database.ConnectionString, FirstDemoAssignmentId, "Filtered issue point", now, "issue");
        var okResultId = await InsertPatrolResultAsync(database.ConnectionString, FirstDemoAssignmentId, "Filtered ok point", now.AddMinutes(-1), "ok");
        var actualDate = DateOnly.FromDateTime(now.UtcDateTime);

        var filtered = UseResults(provider, query => query.GetResults(
            new ResultFilterDto("issue", null, null, actualDate, actualDate),
            page: 1,
            pageSize: 1));

        Assert.Contains(filtered, item => item.Id == issueResultId);
        Assert.Contains(filtered, item => item.Id == okResultId);
        Assert.Contains(filtered, item => item.Status == "issue");
        Assert.Contains(filtered, item => item.Status == "ok");
        Assert.All(filtered, item => Assert.Equal(FirstDemoAssignmentId, item.AssignmentId));
    }

    [DbIntegrationFact]
    public async Task ResultsExportIsCappedAndMarkedWhenFilterMatchesTooManyRows()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();
        var actualAt = DateTimeOffset.UtcNow.AddDays(45);
        await InsertManyPatrolResultsAsync(database.ConnectionString, "export-cap", actualAt, MaxExportRows + 5);
        var actualDate = DateOnly.FromDateTime(actualAt.UtcDateTime);

        var export = UseResults(provider, query => query.ExportResults(new ResultFilterDto(
            "export-cap",
            null,
            null,
            actualDate,
            actualDate)));

        var csv = Encoding.UTF8.GetString(export.Content);
        var lines = csv.Split(["\r\n", "\n"], StringSplitOptions.RemoveEmptyEntries);
        Assert.True(export.Truncated);
        Assert.Equal(MaxExportRows, export.RowCount);
        Assert.Equal(MaxExportRows, export.MaxRows);
        Assert.Equal(MaxExportRows + 1, lines.Length);
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

    private static T UseResults<T>(ServiceProvider provider, Func<IPatrolResultQuery, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IPatrolResultQuery>());
    }

    private static T UseRequests<T>(ServiceProvider provider, Func<IPatrolRequestService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IPatrolRequestService>());
    }

    private static T UseAssignments<T>(ServiceProvider provider, Func<IAssignmentService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IAssignmentService>());
    }

    private static async Task<Guid> InsertPatrolResultAsync(
        string connectionString,
        Guid assignmentId,
        string pointName,
        DateTimeOffset actualAt,
        string status = "ok")
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        var resultId = Guid.NewGuid();
        command.CommandText = """
            insert into patrol_results (
                id,
                assignment_id,
                status,
                point_name,
                employee_name,
                route_name,
                territory,
                shift,
                planned_at,
                actual_at,
                deviation,
                comment,
                issue_type,
                severity,
                photos,
                created_at)
            values (
                @id,
                @assignment_id,
                @status,
                @point_name,
                @employee_name,
                @route_name,
                @territory,
                @shift,
                @planned_at,
                @actual_at,
                @deviation,
                @comment,
                @issue_type,
                @severity,
                @photos,
                @created_at);
            """;
        command.Parameters.AddWithValue("id", resultId);
        command.Parameters.AddWithValue("assignment_id", assignmentId);
        command.Parameters.AddWithValue("status", status);
        command.Parameters.AddWithValue("point_name", pointName);
        command.Parameters.AddWithValue("employee_name", "Paging Test Employee");
        command.Parameters.AddWithValue("route_name", "Paging Test Route");
        command.Parameters.AddWithValue("territory", "Paging Test Territory");
        command.Parameters.AddWithValue("shift", "day");
        command.Parameters.AddWithValue("planned_at", actualAt.AddMinutes(-15));
        command.Parameters.AddWithValue("actual_at", actualAt);
        command.Parameters.AddWithValue("deviation", "0");
        command.Parameters.AddWithValue("comment", "-");
        command.Parameters.AddWithValue("issue_type", "-");
        command.Parameters.AddWithValue("severity", "-");
        command.Parameters.AddWithValue("photos", 0);
        command.Parameters.AddWithValue("created_at", actualAt);

        await command.ExecuteNonQueryAsync();
        return resultId;
    }

    private static async Task InsertManyPatrolResultsAsync(
        string connectionString,
        string status,
        DateTimeOffset actualAt,
        int count)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO patrol_results (
                id,
                assignment_id,
                status,
                point_name,
                employee_name,
                route_name,
                territory,
                shift,
                planned_at,
                actual_at,
                deviation,
                comment,
                issue_type,
                severity,
                photos,
                created_at)
            SELECT
                ('10000000-0000-0000-0000-' || lpad(series.value::text, 12, '0'))::uuid,
                NULL,
                @status,
                'Export point ' || series.value,
                'Export Employee',
                'Export Route',
                'Export Territory',
                'day',
                @actual_at - interval '15 minutes',
                @actual_at + (series.value * interval '1 second'),
                '0',
                '-',
                '-',
                '-',
                0,
                @actual_at
            FROM generate_series(1, @count) AS series(value);
            """;
        command.Parameters.AddWithValue("status", status);
        command.Parameters.AddWithValue("actual_at", actualAt);
        command.Parameters.AddWithValue("count", count);

        await command.ExecuteNonQueryAsync();
    }
}

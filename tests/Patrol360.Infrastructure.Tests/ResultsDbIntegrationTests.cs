using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class ResultsDbIntegrationTests
{
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
        Assert.Contains("AssignmentId;Status;Point;Employee;Route;Territory;Shift;PlannedAt;ActualAt;Deviation;Photos;IssueType;Severity;Comment", csv);
        Assert.Contains(sourceResult.Route, csv);
        Assert.Contains(sourceResult.Employee, csv);
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
}

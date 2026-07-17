using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Application.Tests;

public class ApplicationSmokeTests
{
    [Fact]
    public void CreateRouteResultReportsSuccessOnlyWhenRouteExistsAndErrorsAreEmpty()
    {
        var route = CreateRoute();

        var success = new CreateRouteResult(route, new Dictionary<string, string[]>());
        var failed = new CreateRouteResult(null, new Dictionary<string, string[]>
        {
            ["name"] = ["Name is required"],
        });

        Assert.True(success.Succeeded);
        Assert.False(failed.Succeeded);
    }

    [Fact]
    public void RoutePointResultRequiresRoutePointAndEmptyErrors()
    {
        var route = CreateRoute();
        var point = new RoutePointDto(
            Guid.NewGuid(),
            SequenceNo: 1,
            Name: "Gate",
            Zone: "North",
            Type: "NFC",
            Tag: "NFC-001",
            Interval: "00:10",
            ExpectedTime: "00:05",
            Status: "Active",
            NfcCode: "NFC-001",
            IsRequired: true,
            RequiresPhoto: false,
            Description: "Motor inspection point",
            Instruction: "Scan the tag and inspect the motor");

        var success = new CreateRoutePointResult(route, point, new Dictionary<string, string[]>());
        var missingPoint = new CreateRoutePointResult(route, null, new Dictionary<string, string[]>());
        var failed = new CreateRoutePointResult(null, null, new Dictionary<string, string[]>
        {
            ["point"] = ["Point is required"],
        });

        Assert.True(success.Succeeded);
        Assert.False(missingPoint.Succeeded);
        Assert.False(failed.Succeeded);
    }

    [Fact]
    public void CreatePatrolRequestResultReportsSuccessOnlyWhenRequestExistsAndErrorsAreEmpty()
    {
        var request = new PatrolRequestDto(
            Guid.NewGuid(),
            Number: "REQ-20260518-0001",
            EmployeeId: Guid.NewGuid(),
            EmployeeName: "Ivan Petrov",
            RouteId: Guid.NewGuid(),
            RouteName: "North perimeter",
            SourceResultId: null,
            ScheduledDate: new DateOnly(2026, 5, 18),
            ScheduledTime: new TimeOnly(9, 30),
            NotifyEmployee: true,
            NotificationText: "Start patrol",
            Status: "New",
            CreatedAt: DateTimeOffset.Parse("2026-05-18T08:00:00+05:00"),
            Description: "Scheduled patrol");

        var success = new CreatePatrolRequestResult(request, new Dictionary<string, string[]>());
        var failed = new CreatePatrolRequestResult(null, new Dictionary<string, string[]>
        {
            ["employee"] = ["Employee is required"],
        });

        Assert.True(success.Succeeded);
        Assert.False(failed.Succeeded);
    }

    private static RouteDto CreateRoute() =>
        new(
            Guid.NewGuid(),
            Name: "Warehouse route",
            Description: "Warehouse inspection",
            Territory: "Warehouse",
            Status: "Active",
            Duration: "45 min",
            Distance: "1.5 km",
            Periodicity: "Daily",
            VersionNo: 1,
            Points: []);
}

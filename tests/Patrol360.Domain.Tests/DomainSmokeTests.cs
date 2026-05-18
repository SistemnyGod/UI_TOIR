namespace Patrol360.Domain.Tests;

public class DomainSmokeTests
{
    [Fact]
    public void PatrolRouteScenarioKeepsOrderedRequiredPoints()
    {
        var points = new[]
        {
            new RoutePoint(Guid.NewGuid(), SequenceNo: 1, Name: "Gate", NfcCode: "NFC-001", IsRequired: true),
            new RoutePoint(Guid.NewGuid(), SequenceNo: 2, Name: "Warehouse", NfcCode: null, IsRequired: false),
        };

        var route = new PatrolRoute(
            Guid.NewGuid(),
            Name: "North perimeter",
            Description: "Perimeter inspection",
            VersionNo: 1,
            Points: points);

        Assert.Equal("North perimeter", route.Name);
        Assert.Equal(1, route.VersionNo);
        Assert.Equal([1, 2], route.Points.Select(point => point.SequenceNo));
        Assert.True(route.Points[0].IsRequired);
        Assert.False(route.Points[1].IsRequired);
    }

    [Fact]
    public void PatrolAssignmentScenarioCapturesRouteVersionShiftAndProgress()
    {
        var plannedAt = DateTimeOffset.Parse("2026-05-18T08:00:00+05:00");
        var assignment = new PatrolAssignment(
            Guid.NewGuid(),
            RouteId: Guid.NewGuid(),
            RouteVersionId: Guid.NewGuid(),
            EmployeeId: Guid.NewGuid(),
            EmployeeName: "Ivan Petrov",
            Shift: ShiftType.Day,
            Status: PatrolAssignmentStatus.Active,
            PlannedAt: plannedAt,
            ProgressPercent: 45);

        Assert.Equal(ShiftType.Day, assignment.Shift);
        Assert.Equal(PatrolAssignmentStatus.Active, assignment.Status);
        Assert.Equal(plannedAt, assignment.PlannedAt);
        Assert.InRange(assignment.ProgressPercent, 0, 100);
    }
}

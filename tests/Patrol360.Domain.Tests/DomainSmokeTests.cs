namespace Patrol360.Domain.Tests;

public class DomainSmokeTests
{
    [Fact]
    public void PatrolRouteKeepsOrderedRoutePoints()
    {
        var point = new RoutePoint(
            Guid.NewGuid(),
            SequenceNo: 1,
            Name: "КПП",
            NfcCode: "NFC-001",
            IsRequired: true);

        var route = new PatrolRoute(
            Guid.NewGuid(),
            Name: "Северный периметр",
            Description: "Контроль периметра",
            VersionNo: 1,
            Points: [point]);

        Assert.Equal("Северный периметр", route.Name);
        Assert.Equal(1, route.VersionNo);
        Assert.Single(route.Points);
        Assert.True(route.Points[0].IsRequired);
    }
}

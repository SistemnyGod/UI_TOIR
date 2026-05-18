using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Application.Tests;

public class ApplicationSmokeTests
{
    [Fact]
    public void CreateRouteResultReportsSuccessOnlyWhenRouteExistsAndErrorsAreEmpty()
    {
        var route = new RouteDto(
            Guid.NewGuid(),
            Name: "Складской маршрут",
            Description: "Проверка склада",
            Territory: "Склад",
            Status: "Активен",
            Duration: "45 мин",
            Distance: "1.5 км",
            Periodicity: "Ежедневно",
            VersionNo: 1,
            Points: []);

        var success = new CreateRouteResult(route, new Dictionary<string, string[]>());
        var failed = new CreateRouteResult(null, new Dictionary<string, string[]>
        {
            ["name"] = ["Название обязательно"],
        });

        Assert.True(success.Succeeded);
        Assert.False(failed.Succeeded);
    }
}

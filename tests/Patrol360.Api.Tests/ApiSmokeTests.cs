using Patrol360.Api.Controllers;

namespace Patrol360.Api.Tests;

public class ApiSmokeTests
{
    [Fact]
    public void ApiAssemblyContainsHealthController()
    {
        var assembly = typeof(HealthController).Assembly;

        Assert.Equal("Patrol360.Api", assembly.GetName().Name);
        Assert.Contains(assembly.GetTypes(), type => type == typeof(HealthController));
    }
}

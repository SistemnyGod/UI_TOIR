using Microsoft.Extensions.Hosting;

namespace Patrol360.Worker.Tests;

public class WorkerSmokeTests
{
    [Fact]
    public void WorkerHostTypeIsBackgroundService()
    {
        Assert.True(typeof(Patrol360.Worker.Worker).IsAssignableTo(typeof(BackgroundService)));
    }
}

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Infrastructure;

namespace Patrol360.Infrastructure.Tests;

public class InfrastructureSmokeTests
{
    [Fact]
    public void AddPatrolInfrastructureRegistersApplicationPorts()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Patrol360"] = "Host=localhost;Port=5432;Database=patrol360;Username=patrol360;Password=patrol360_dev",
            })
            .Build();

        services.AddPatrolInfrastructure(configuration);

        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IPatrolDashboardQuery));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IRouteCatalogQuery));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IRouteCatalogService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IEmployeeDirectoryQuery));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IEmployeeDirectoryService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IMobileAccountService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IPatrolRequestService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IAssignmentService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IPatrolResultQuery));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IAuthSessionService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(ISiteUserAdminService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IEmuCatalogService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IEmuWorkService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IEmuPlanService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IEmuMaintenanceService));
    }
}

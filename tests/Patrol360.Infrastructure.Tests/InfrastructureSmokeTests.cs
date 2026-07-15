using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Patrol360.Application;
using Patrol360.Infrastructure;
using Patrol360.Infrastructure.Persistence.Migrations;

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
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IPatrolTimeZone));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IAuthSessionService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(ISiteUserAdminService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IEmuCatalogService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IEmuWorkService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IEmuPlanService));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IEmuMaintenanceService));
    }

    [Fact]
    public void AddPatrolInfrastructureRejectsInvalidPatrolTimeZone()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Patrol:TimeZone"] = "Not/A-Time-Zone"
            })
            .Build();

        var exception = Assert.Throws<InvalidOperationException>(() => services.AddPatrolInfrastructure(configuration));

        Assert.Contains("Patrol:TimeZone", exception.Message);
    }

    [Fact]
    public void PatrolTimeZoneUsesYekaterinburgBusinessDayBoundaries()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddPatrolInfrastructure(configuration);
        using var provider = services.BuildServiceProvider();
        var timeZone = provider.GetRequiredService<IPatrolTimeZone>();

        var date = new DateOnly(2026, 12, 31);

        Assert.Equal(new DateTimeOffset(2026, 12, 30, 19, 0, 0, TimeSpan.Zero), timeZone.StartOfDayUtc(date));
        Assert.Equal(new DateTimeOffset(2026, 12, 31, 19, 0, 0, TimeSpan.Zero), timeZone.StartOfNextDayUtc(date));
        Assert.Equal(date, timeZone.GetDate(new DateTimeOffset(2026, 12, 30, 21, 0, 0, TimeSpan.Zero)));
    }

    [Fact]
    public void PercoRepairMigrationsAreDiscoverableByEf()
    {
        AssertMigrationId<PercoIntegrationStage1>("20260602120000_PercoIntegrationStage1");
        AssertMigrationId<PercoIntegrationStage2>("20260602133000_PercoIntegrationStage2");
        AssertMigrationId<PercoIntegrationSchemaRepair>("20260603012000_PercoIntegrationSchemaRepair");
        AssertMigrationId<PercoAuthModeAndSecretChecks>("20260603150000_PercoAuthModeAndSecretChecks");
    }

    [Fact]
    public void PercoAccessReportsEndpointUsesReportModeWithoutCursorCutoff()
    {
        var serviceType = typeof(PercoIntegrationStage1).Assembly.GetType("Patrol360.Infrastructure.Persistence.EfPercoIntegrationService");
        Assert.NotNull(serviceType);

        var method = serviceType!.GetMethod(
            "IsAccessReportEventsEndpoint",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);

        Assert.NotNull(method);
        var result = (bool)method!.Invoke(null, ["/api/accessReports/events"])!;
        Assert.True(result);
    }

    [Fact]
    public void PercoWebPageEndpointDoesNotUseReportMode()
    {
        var serviceType = typeof(PercoIntegrationStage1).Assembly.GetType("Patrol360.Infrastructure.Persistence.EfPercoIntegrationService");
        Assert.NotNull(serviceType);

        var method = serviceType!.GetMethod(
            "IsAccessReportEventsEndpoint",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);

        Assert.NotNull(method);
        var result = (bool)method!.Invoke(null, ["/controlaccess/premisesaccess/all"])!;
        Assert.False(result);
    }

    private static void AssertMigrationId<TMigration>(string expected)
        where TMigration : Migration
    {
        var attribute = typeof(TMigration)
            .GetCustomAttributes(typeof(MigrationAttribute), inherit: false)
            .OfType<MigrationAttribute>()
            .SingleOrDefault();

        Assert.NotNull(attribute);
        Assert.Equal(expected, attribute!.Id);

        var dbContextAttribute = typeof(TMigration)
            .GetCustomAttributes(typeof(DbContextAttribute), inherit: false)
            .OfType<DbContextAttribute>()
            .SingleOrDefault();

        Assert.NotNull(dbContextAttribute);
        Assert.Equal("Patrol360.Infrastructure.Persistence.Patrol360DbContext", dbContextAttribute!.ContextType.FullName);
    }
}

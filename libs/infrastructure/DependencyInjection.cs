using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Patrol360.Application;
using Patrol360.Infrastructure.Attachments;
using Patrol360.Infrastructure.MobilePush;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddPatrolInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Patrol360")
            ?? "Host=localhost;Port=5432;Database=patrol360;Username=patrol360;Password=patrol360_dev";

        services.AddDbContext<Patrol360DbContext>(options => options
            .UseNpgsql(connectionString)
            .ConfigureWarnings(warnings => warnings.Ignore(RelationalEventId.PendingModelChangesWarning)));
        services.AddMemoryCache();
        services.AddSingleton<IAttachmentStore>(new LocalAttachmentStore(configuration));
        services.AddSingleton<IPatrolTimeZone>(new PatrolTimeZone(ResolvePatrolTimeZone(configuration)));

        var dataProtection = services
            .AddDataProtection()
            .SetApplicationName("Patrol360");
        var keyRingPath = configuration["DataProtection:KeyRingPath"];
        if (!string.IsNullOrWhiteSpace(keyRingPath))
        {
            Directory.CreateDirectory(keyRingPath);
            dataProtection.PersistKeysToFileSystem(new DirectoryInfo(keyRingPath));
        }

        services.AddScoped<Patrol360DbSeeder>();
        services.AddScoped<EfPatrolStore>();
        services.AddScoped<IPatrolDashboardQuery>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IRouteCatalogQuery>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IRouteCatalogService>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IEmployeeDirectoryQuery>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IEmployeeDirectoryService>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IMobileAccountService>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IMobileAppService, EfMobileAppService>();
        services.TryAddScoped<IMobilePushSender, FirebaseMobilePushSender>();
        services.AddScoped<IMobilePushDeliveryService, EfMobilePushDeliveryService>();
        services.AddScoped<IPatrolRequestService>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IAssignmentService>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IPatrolResultQuery, EfPatrolResultQuery>();
        services.AddScoped<IMobileSyncAdminService, EfMobileSyncAdminService>();
        services.AddScoped<IInventoryCatalogQuery, EfInventoryCatalogQuery>();
        services.AddScoped<IInventoryCatalogCommandService, EfInventoryCatalogCommandService>();
        services.AddScoped<IInventoryWorkflowService, EfInventoryWorkflowService>();
        services.AddScoped<IInventoryExportService, EfInventoryExportService>();
        services.AddScoped<IInventoryLegacyImportService, EfInventoryLegacyImportService>();
        services.AddScoped<EfEmuService>();
        services.AddScoped<IEmuCatalogService>(provider => provider.GetRequiredService<EfEmuService>());
        services.AddScoped<IEmuWorkService>(provider => provider.GetRequiredService<EfEmuService>());
        services.AddScoped<IEmuShiftService>(provider => provider.GetRequiredService<EfEmuService>());
        services.AddScoped<IEmuPlanService>(provider => provider.GetRequiredService<EfEmuService>());
        services.AddScoped<IEmuMaintenanceService>(provider => provider.GetRequiredService<EfEmuService>());
        services.AddScoped<IPercoIntegrationService, EfPercoIntegrationService>();
        services.AddScoped<IAuthSessionService, EfAuthSessionService>();
        services.AddScoped<ISiteUserAdminService, EfSiteUserAdminService>();
        services.AddScoped<ISystemNotificationService, EfSystemNotificationService>();

        return services;
    }

    private static TimeZoneInfo ResolvePatrolTimeZone(IConfiguration configuration)
    {
        var configuredId = configuration["Patrol:TimeZone"];
        var preferredId = string.IsNullOrWhiteSpace(configuredId) ? "Asia/Yekaterinburg" : configuredId.Trim();
        var candidates = preferredId.Equals("Asia/Yekaterinburg", StringComparison.OrdinalIgnoreCase)
            ? new[] { preferredId, "Ekaterinburg Standard Time" }
            : new[] { preferredId };

        foreach (var candidate in candidates)
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(candidate);
            }
            catch (TimeZoneNotFoundException)
            {
                // Try the platform-specific fallback, if configured.
            }
            catch (InvalidTimeZoneException)
            {
                // Fail below with a configuration-oriented message.
            }
        }

        throw new InvalidOperationException(
            $"Patrol:TimeZone '{preferredId}' is not a valid system time zone. " +
            "Use an IANA or Windows time-zone identifier available on this host.");
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddPatrolInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Patrol360")
            ?? "Host=localhost;Port=5432;Database=patrol360;Username=patrol360;Password=patrol360_dev";

        services.AddDbContext<Patrol360DbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<Patrol360DbSeeder>();
        services.AddScoped<EfPatrolStore>();
        services.AddScoped<IPatrolDashboardQuery>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IRouteCatalogQuery>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IRouteCatalogService>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IEmployeeDirectoryQuery>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IEmployeeDirectoryService>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IMobileAccountService>(provider => provider.GetRequiredService<EfPatrolStore>());
        services.AddScoped<IPatrolRequestService>(provider => provider.GetRequiredService<EfPatrolStore>());

        return services;
    }
}

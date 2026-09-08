using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed class BootstrapAdminSecurityTests
{
    [DbIntegrationFact]
    public async Task FreshDatabaseRequiresExplicitSecretAndExistingAdminIsNotReset()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var missing = Provider(database.ConnectionString, null);
        await Assert.ThrowsAsync<InvalidOperationException>(() => missing.InitializePatrolDatabaseAsync());
        using (var scope = missing.CreateScope())
        {
            Assert.Empty(await scope.ServiceProvider.GetRequiredService<Patrol360DbContext>().SiteUsers.ToListAsync());
        }

        using var configured = Provider(database.ConnectionString, "Unique-test-password-82!");
        await configured.InitializePatrolDatabaseAsync();
        string hash;
        using (var scope = configured.CreateScope())
        {
            var admin = await scope.ServiceProvider.GetRequiredService<Patrol360DbContext>().SiteUsers.SingleAsync();
            Assert.True(admin.RequirePasswordChange);
            hash = admin.PasswordHash;
        }

        await missing.InitializePatrolDatabaseAsync();
        using var existingScope = missing.CreateScope();
        Assert.Equal(hash, (await existingScope.ServiceProvider.GetRequiredService<Patrol360DbContext>()
            .SiteUsers.SingleAsync()).PasswordHash);
    }

    private static ServiceProvider Provider(string connection, string? password)
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Patrol360"] = connection,
            ["Patrol360:BootstrapAdminPassword"] = password,
        }).Build();
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(config);
        services.AddPatrolInfrastructure(config);
        return services.BuildServiceProvider();
    }
}

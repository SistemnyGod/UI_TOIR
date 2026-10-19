using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class InventoryLegacyImportIsolationTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ImportRequiresExplicitMigrationModeBeforeReadingOrWritingDatabases(bool dryRun)
    {
        using var db = new Patrol360DbContext(new DbContextOptionsBuilder<Patrol360DbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=unused;Username=unused;Password=unused").Options);
        var service = new EfInventoryLegacyImportService(db, new ConfigurationBuilder().Build());
        var result = await service.ImportAsync(new InventoryLegacyImportRequestDto(dryRun));
        Assert.False(result.Succeeded);
        Assert.Contains("migrationMode", result.Errors.Keys);
        Assert.Empty(db.ChangeTracker.Entries());
    }
}

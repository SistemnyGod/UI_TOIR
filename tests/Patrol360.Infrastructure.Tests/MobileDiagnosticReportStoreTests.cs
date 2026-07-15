using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure;

namespace Patrol360.Infrastructure.Tests;

public sealed class MobileDiagnosticReportStoreTests : IDisposable
{
    private readonly string rootPath = Path.Combine(Path.GetTempPath(), $"patrol360-mobile-diagnostics-{Guid.NewGuid():N}");

    [Fact]
    public void SameReportIsStoredOnceAndReturnedAsDuplicate()
    {
        using var provider = BuildProvider();
        var store = provider.GetRequiredService<IMobileDiagnosticReportStore>();
        var reportId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var report = new MobileStoredDiagnosticReport(
            Guid.NewGuid(),
            "mobile.test",
            "android-test",
            new MobileDiagnosticReportDto(
                reportId,
                "android-test",
                "0.1.19",
                "Android 16",
                now.AddDays(-1),
                now,
                now,
                2,
                [new MobileDiagnosticEntryDto("sync.failed", "Server unavailable", 3, now.AddHours(-2), now)]),
            now,
            "127.0.0.1");

        var first = store.Save(report);
        var repeated = store.Save(report);

        Assert.Equal("stored", first.Status);
        Assert.Equal("duplicate", repeated.Status);
        var file = Assert.Single(Directory.GetFiles(rootPath, "*.json", SearchOption.AllDirectories));
        using var document = JsonDocument.Parse(File.ReadAllText(file));
        Assert.Equal(reportId, document.RootElement.GetProperty("report").GetProperty("reportId").GetGuid());
    }

    public void Dispose()
    {
        if (Directory.Exists(rootPath))
        {
            Directory.Delete(rootPath, recursive: true);
        }
    }

    private ServiceProvider BuildProvider()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["MobileDiagnostics:StoragePath"] = rootPath,
            })
            .Build();
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddPatrolInfrastructure(configuration);
        return services.BuildServiceProvider();
    }
}

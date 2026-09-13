using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence.Inventory;

public static class PpeIssueDocumentPrintingServiceCollectionExtensions
{
    public const string GotenbergClientName = "PpeIssueDocumentGotenberg";

    public static IServiceCollection AddPpeIssueDocumentPrinting(this IServiceCollection services)
    {
        services.TryAddSingleton<PpeIssueDocumentPrintRuntime>();
        services.AddHttpClient(GotenbergClientName, (provider, client) =>
        {
            var configuration = provider.GetRequiredService<IConfiguration>();
            client.BaseAddress = new Uri(configuration["Gotenberg:BaseUrl"] ?? "http://gotenberg:3000", UriKind.Absolute);
            client.Timeout = Timeout.InfiniteTimeSpan;
        });
        services.TryAddScoped<IPpeIssueDocumentPrintService, PpeIssueDocumentPrintService>();
        services.TryAddScoped<IPpeDocxPdfConverter, PpeDocxPdfConverter>();
        return services;
    }
}

public sealed class PpeIssueDocumentPrintRuntime : IDisposable
{
    private const long MaxCacheBytes = 64L * 1024 * 1024;
    private readonly MemoryCache cache = new(new MemoryCacheOptions { SizeLimit = MaxCacheBytes });
    private readonly SemaphoreSlim conversionGate = new(4, 4);

    public bool TryGetValue(string key, out InventoryGeneratedFileDto? file) => cache.TryGetValue(key, out file);

    public Task<bool> TryEnterConversionAsync(CancellationToken cancellationToken) => conversionGate.WaitAsync(0, cancellationToken);

    public void ExitConversion() => conversionGate.Release();

    public void Set(string key, InventoryGeneratedFileDto file)
    {
        if (file.Content.LongLength <= 0 || file.Content.LongLength > MaxCacheBytes) return;
        cache.Set(
            key,
            file,
            new MemoryCacheEntryOptions
            {
                Size = file.Content.LongLength,
                SlidingExpiration = TimeSpan.FromMinutes(10),
                AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1)
            });
    }

    public void Dispose()
    {
        conversionGate.Dispose();
        cache.Dispose();
    }
}

using Microsoft.EntityFrameworkCore;
using Npgsql;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Api.Services;

public sealed record ApplicationReadinessResult(bool IsReady, string Dependency);

public interface IApplicationReadinessProbe
{
    Task<ApplicationReadinessResult> CheckAsync(CancellationToken cancellationToken);
}

public sealed class ApplicationReadinessProbe(
    IConfiguration configuration,
    Patrol360DbContext dbContext) : IApplicationReadinessProbe
{
    public async Task<ApplicationReadinessResult> CheckAsync(CancellationToken cancellationToken)
    {
        var connectionString = configuration.GetConnectionString("Patrol360");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return new ApplicationReadinessResult(false, "database");
        }

        try
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);

            if ((await dbContext.Database.GetPendingMigrationsAsync(cancellationToken)).Any())
            {
                return new ApplicationReadinessResult(false, "database-migrations");
            }
        }
        catch (NpgsqlException)
        {
            return new ApplicationReadinessResult(false, "database");
        }

        try
        {
            var storageDirectory = Path.Combine(AppContext.BaseDirectory, "mobile-files");
            Directory.CreateDirectory(storageDirectory);
            var probePath = Path.Combine(storageDirectory, $".readiness-{Guid.NewGuid():N}.tmp");
            await using (File.Create(probePath, 1, FileOptions.DeleteOnClose))
            {
            }
        }
        catch (IOException)
        {
            return new ApplicationReadinessResult(false, "mobile-files");
        }
        catch (UnauthorizedAccessException)
        {
            return new ApplicationReadinessResult(false, "mobile-files");
        }

        return new ApplicationReadinessResult(true, "ready");
    }
}

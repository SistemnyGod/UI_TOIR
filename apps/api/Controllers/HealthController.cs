using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("health")]
public sealed class HealthController(
    IConfiguration configuration,
    Patrol360DbContext dbContext) : ControllerBase
{
    [HttpGet("live")]
    public IActionResult Live() => Ok(new { status = "live" });

    [HttpGet("ready")]
    public async Task<IActionResult> Ready(CancellationToken cancellationToken)
    {
        var connectionString = configuration.GetConnectionString("Patrol360");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { status = "unready", dependency = "database" });
        }

        try
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);

            var pendingMigrations = await dbContext.Database
                .GetPendingMigrationsAsync(cancellationToken);
            if (pendingMigrations.Any())
            {
                return StatusCode(
                    StatusCodes.Status503ServiceUnavailable,
                    new { status = "unready", dependency = "database-migrations" });
            }
        }
        catch (NpgsqlException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { status = "unready", dependency = "database" });
        }

        try
        {
            var storageDirectory = Path.Combine(AppContext.BaseDirectory, "mobile-files");
            Directory.CreateDirectory(storageDirectory);
            var probePath = Path.Combine(storageDirectory, $".readiness-{Guid.NewGuid():N}.tmp");
            await using (System.IO.File.Create(probePath, 1, FileOptions.DeleteOnClose))
            {
                // Opening a delete-on-close stream proves the volume is writable
                // without leaving diagnostic files behind.
            }
        }
        catch (IOException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { status = "unready", dependency = "mobile-files" });
        }
        catch (UnauthorizedAccessException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { status = "unready", dependency = "mobile-files" });
        }

        return Ok(new { status = "ready" });
    }
}

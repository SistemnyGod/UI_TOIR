using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;

namespace Patrol360.Infrastructure.Persistence;

public static class Patrol360DatabaseInitializer
{
    private const string InitialMigrationId = "20260514190555_InitialPatrolCore";
    private const string EfProductVersion = "10.0.4";

    public static async Task InitializePatrolDatabaseAsync(
        this IServiceProvider serviceProvider,
        CancellationToken cancellationToken = default)
    {
        using var scope = serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
        var seeder = scope.ServiceProvider.GetRequiredService<Patrol360DbSeeder>();

        await MarkInitialMigrationIfLegacySchemaAsync(dbContext, cancellationToken);
        await dbContext.Database.MigrateAsync(cancellationToken);
        await seeder.SeedAsync(cancellationToken);
    }

    private static async Task MarkInitialMigrationIfLegacySchemaAsync(
        Patrol360DbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!await dbContext.Database.CanConnectAsync(cancellationToken))
        {
            return;
        }

        var hasMigrationsHistory = await TableExistsAsync(
            dbContext,
            "__EFMigrationsHistory",
            cancellationToken);

        if (hasMigrationsHistory)
        {
            var appliedMigrations = await dbContext.Database.GetAppliedMigrationsAsync(cancellationToken);
            if (appliedMigrations.Any())
            {
                return;
            }
        }

        if (!await TableExistsAsync(dbContext, "routes", cancellationToken))
        {
            return;
        }

        await dbContext.Database.ExecuteSqlRawAsync(
            $"""
            CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
                "MigrationId" character varying(150) NOT NULL,
                "ProductVersion" character varying(32) NOT NULL,
                CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
            );

            INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
            VALUES ('{InitialMigrationId}', '{EfProductVersion}')
            ON CONFLICT ("MigrationId") DO NOTHING;
            """,
            cancellationToken);
    }

    private static Task<bool> TableExistsAsync(
        Patrol360DbContext dbContext,
        string tableName,
        CancellationToken cancellationToken)
    {
        return dbContext.Database.SqlQueryRaw<bool>(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = {0}
                ) AS "Value"
                """,
                tableName)
            .SingleAsync(cancellationToken);
    }
}

using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;
using Xunit.Abstractions;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed class PatrolRequestPagingDbTests(ITestOutputHelper output)
{
    [DbIntegrationFact]
    public async Task HundredThousandRequestsHaveBoundedPagesAndExactIdLookup()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var capture = new SqlCapture();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Patrol360"] = database.ConnectionString,
            ["Patrol360:SeedDemoData"] = "false",
        }).Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddPatrolInfrastructure(configuration);
        services.AddSingleton<IConfiguration>(configuration);
        services.AddScoped(_ => new Patrol360DbContext(new DbContextOptionsBuilder<Patrol360DbContext>()
            .UseNpgsql(database.ConnectionString).AddInterceptors(capture).Options));
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO patrol_requests (id, number, employee_name, route_name, scheduled_date,
                notify_employee, notification_text, status, status_code, created_at, description)
            SELECT gen_random_uuid(), 'PERF-' || lpad(i::text, 6, '0'), 'Контрольный сотрудник',
                'Контрольный маршрут', DATE '2026-10-08' - (i % 300), false, '', 'Новая', 'new',
                TIMESTAMPTZ '2026-10-08 12:00:00+05' - i * INTERVAL '1 second', ''
            FROM generate_series(1, 100000) i;
            ANALYZE patrol_requests;
            """);
        var query = scope.ServiceProvider.GetRequiredService<IPatrolRequestService>();
        capture.Texts.Clear();
        var first = query.GetRequests(1, 50);
        Assert.Equal(50, first.Count);
        Assert.Equal("PERF-000001", first[0].Number);
        Assert.Contains(capture.Texts, text => text.Contains("LIMIT"));
        Assert.InRange(capture.Texts.Count, 1, 2);
        var second = query.GetRequests(2, 50);
        Assert.Equal("PERF-000051", second[0].Number);
        Assert.Empty(first.Select(row => row.Id).Intersect(second.Select(row => row.Id)));
        var last = query.GetRequests(2000, 50);
        Assert.Equal("PERF-100000", last[^1].Number);
        Assert.Empty(query.GetRequests(2001, 50));
        var exact = Assert.Single(query.GetRequests(1, 1, new PatrolRequestFilterDto(Id: last[^1].Id)));
        Assert.Equal(last[^1].Id, exact.Id);
        Assert.Empty(query.GetRequests(1, 1, new PatrolRequestFilterDto(Id: Guid.NewGuid())));

        const string sql = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM patrol_requests ORDER BY created_at DESC, id DESC LIMIT 50";
        var installed = await db.Database.SqlQueryRaw<string>(sql).ToListAsync();
        Assert.Contains("ix_patrol_requests_created_id", installed[0]);
        // Reproduce the former schema only in this disposable database.
        await db.Database.ExecuteSqlRawAsync("DROP INDEX ix_patrol_requests_created_id");
        var before = await db.Database.SqlQueryRaw<string>(sql).ToListAsync();
        // Benchmark candidate only on this disposable database, without changing the model.
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX test_request_order ON patrol_requests (created_at DESC, id DESC)");
        var after = await db.Database.SqlQueryRaw<string>(sql).ToListAsync();
        await db.Database.ExecuteSqlRawAsync("DROP INDEX test_request_order");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX ix_patrol_requests_created_id ON patrol_requests (created_at DESC, id DESC)");
        var result = JsonSerializer.Serialize(new { rows = 100000, pageSize = 50, before, after }, new JsonSerializerOptions { WriteIndented = true });
        output.WriteLine(result);
        var outputPath = Environment.GetEnvironmentVariable("PATROL360_REQUEST_PERF_OUTPUT");
        if (!string.IsNullOrWhiteSpace(outputPath)) await File.WriteAllTextAsync(outputPath, result);
        db.PatrolRequests.AddRange(new[] { "accepted", "Отправлена", "paused", "Закрыта" }.Select(status => new PatrolRequestEntity
        {
            Id = Guid.NewGuid(), Number = "GROUP-" + Guid.NewGuid().ToString("N"), Status = status,
            ScheduledDate = new DateOnly(2026, 10, 8), CreatedAt = DateTimeOffset.UtcNow,
        }));
        await db.SaveChangesAsync();
        Assert.Equal(2, query.GetRequests(1, 50, new PatrolRequestFilterDto(StatusGroup: "assigned")).Count);
        Assert.Single(query.GetRequests(1, 50, new PatrolRequestFilterDto(StatusGroup: "in_progress")));
        Assert.Single(query.GetRequests(1, 50, new PatrolRequestFilterDto(StatusGroup: "completed")));
        Assert.Single(query.GetRequests(1, 50, new PatrolRequestFilterDto(Status: "accepted")));
        Assert.Empty(query.GetRequests(1, 50, new PatrolRequestFilterDto(StatusGroup: "unknown")));
        Assert.False(db.Database.HasPendingModelChanges());
    }

    private sealed class SqlCapture : DbCommandInterceptor
    {
        public List<string> Texts { get; } = [];
        public override InterceptionResult<DbDataReader> ReaderExecuting(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
        {
            Texts.Add(command.CommandText);
            return result;
        }
    }
}

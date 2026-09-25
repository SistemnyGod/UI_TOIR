using System.Data.Common;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Npgsql;
using Patrol360.Application;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;
using Xunit.Abstractions;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed class InventoryCatalogPagingDbTests(ITestOutputHelper output)
{
    [DbIntegrationFact]
    public async Task PpeFilterAndPaginationRunInDatabaseWithBoundedQueries()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var capture = new SqlCapture();
        await using var db = new Patrol360DbContext(new DbContextOptionsBuilder<Patrol360DbContext>()
            .UseNpgsql(database.ConnectionString).AddInterceptors(capture).Options);
        var category = new InventoryCategoryEntity { Id = Guid.NewGuid(), Name = "PPE protection" };
        db.InventoryCategories.Add(category);
        var items = Enumerable.Range(0, 1200).Select(i => new InventoryItemEntity {
            Id = Guid.NewGuid(), Name = $"Fixture {i:D5}", Sku = $"PERF-{i:D5}", IsActive = true,
            ItemKind = (i % 6) switch { 0 => " pPe ", 1 => "sIz", 2 => "СПЕЦ", 3 => "GLOVE", _ => "tool" },
            CategoryId = i % 6 == 4 ? category.Id : null,
        }).ToList();
        db.InventoryItems.AddRange(items);
        db.InventoryItems.Add(new InventoryItemEntity { Id = Guid.NewGuid(), Name = "Archived", Sku = "ARCH", ItemKind = "ppe", IsActive = false });
        await db.SaveChangesAsync();
        await db.Database.ExecuteSqlRawAsync("ANALYZE");
        db.ChangeTracker.Clear();
        var query = new EfInventoryCatalogQuery(db);
        query.GetItems(new InventoryListQuery(PageSize: 25, PpeOnly: true)); // warm translation
        capture.Reset();
        var timer = Stopwatch.StartNew();
        var all = new List<Patrol360.Contracts.InventoryItemDto>();
        for (var page = 1; ; page++) {
            var result = query.GetItems(new InventoryListQuery(Page: page, PageSize: 100, Status: "active"));
            all.AddRange(result.Rows);
            if (page >= result.PageCount) break;
        }
        var baselineMs = timer.Elapsed.TotalMilliseconds;
        var baselineCommands = capture.Commands.Count;
        var expected = all.Where(x => x.ItemKind.Trim().Equals("ppe", StringComparison.OrdinalIgnoreCase)
            || x.ItemKind.Trim().Equals("siz", StringComparison.OrdinalIgnoreCase)
            || x.ItemKind.Contains("спец", StringComparison.OrdinalIgnoreCase)
            || x.ItemKind.Contains("glove", StringComparison.OrdinalIgnoreCase)
            || x.Category.Contains("ppe", StringComparison.OrdinalIgnoreCase)).Select(x => x.Id).ToHashSet();
        Assert.Equal(1000, expected.Count);
        capture.Reset(); timer.Restart();
        var first = query.GetItems(new InventoryListQuery(PageSize: 25, PpeOnly: true));
        var optimizedMs = timer.Elapsed.TotalMilliseconds;
        var optimizedCommands = capture.Commands.Count;
        Assert.Equal(expected.Count, first.Total);
        Assert.Equal(25, first.Rows.Count);
        Assert.All(first.Rows, row => Assert.Contains(row.Id, expected));
        Assert.Equal(3, optimizedCommands); // count + page + stock for page IDs
        var pageCommand = capture.Commands.Single(x => x.CommandText.Contains("LIMIT"));
        Assert.Contains("ILIKE", pageCommand.CommandText);
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        using var explain = pageCommand.Clone();
        explain.Connection = connection; explain.Transaction = null;
        explain.CommandText = "EXPLAIN (ANALYZE, BUFFERS) " + explain.CommandText;
        var plans = new List<string>();
        await using (var reader = await explain.ExecuteReaderAsync())
            while (await reader.ReadAsync()) plans.Add(reader.GetString(0));
        capture.Reset();
        var second = query.GetItems(new InventoryListQuery(Page: 2, PageSize: 25, PpeOnly: true));
        Assert.Empty(first.Rows.Select(x => x.Id).Intersect(second.Rows.Select(x => x.Id)));
        Assert.Equal(3, capture.Commands.Count);
        var categoryPage = query.GetItems(new InventoryListQuery(PageSize: 10, CategoryId: category.Id, PpeOnly: true));
        Assert.Equal(200, categoryPage.Total);
        Assert.All(categoryPage.Rows, row => Assert.Equal(category.Id, row.CategoryId));
        foreach (var size in new[] { 1, 50, 100 })
        {
            capture.Reset();
            Assert.Equal(size, query.GetItems(new InventoryListQuery(PageSize: size, PpeOnly: true)).Rows.Count);
            Assert.Equal(3, capture.Commands.Count);
        }
        capture.Reset();
        Assert.Equal(0, query.GetItems(new InventoryListQuery(Query: "does-not-exist", PpeOnly: true)).Total);
        Assert.Equal(2, capture.Commands.Count); // no stock query for an empty page
        var measured = new { rows = 1200, matching = 1000, pageSize = 25, baselineCommands, optimizedCommands, baselineMs, optimizedMs, plans };
        output.WriteLine(JsonSerializer.Serialize(measured));
        var outputPath = Environment.GetEnvironmentVariable("PATROL360_PERF_OUTPUT");
        if (!string.IsNullOrWhiteSpace(outputPath)) await File.WriteAllTextAsync(outputPath, JsonSerializer.Serialize(measured, new JsonSerializerOptions { WriteIndented = true }));
    }

    private sealed class SqlCapture : DbCommandInterceptor
    {
        public List<NpgsqlCommand> Commands { get; } = [];
        public void Reset() { foreach (var command in Commands) command.Dispose(); Commands.Clear(); }
        public override InterceptionResult<DbDataReader> ReaderExecuting(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
        {
            Commands.Add(((NpgsqlCommand)command).Clone());
            return result;
        }
    }
}

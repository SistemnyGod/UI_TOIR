using ClosedXML.Excel;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;
using Xunit.Abstractions;

namespace Patrol360.Infrastructure.Tests;

public sealed class PpeTestNormsXlsxFactAttribute : FactAttribute
{
    public PpeTestNormsXlsxFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PPE_TEST_NORMS_XLSX")))
        {
            Skip = "Set PPE_TEST_NORMS_XLSX to run against the local PPE source workbook.";
        }
    }
}

public sealed class PpeTestNormsXlsxDbIntegrationFactAttribute : FactAttribute
{
    public PpeTestNormsXlsxDbIntegrationFactAttribute()
    {
        if (!string.Equals(Environment.GetEnvironmentVariable("PATROL360_RUN_DB_INTEGRATION"), "true", StringComparison.OrdinalIgnoreCase))
        {
            Skip = "Set PATROL360_RUN_DB_INTEGRATION=true to run database integration tests.";
        }
        else if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PPE_TEST_NORMS_XLSX")))
        {
            Skip = "Set PPE_TEST_NORMS_XLSX to run against the local PPE source workbook.";
        }
    }
}

public sealed class InventoryPpeNormImportTests
{
    [PpeTestNormsXlsxFact]
    public void ReadPpeNormWorkbookChecksConfiguredSourceWorkbook()
    {
        var path = Environment.GetEnvironmentVariable("PPE_TEST_NORMS_XLSX");

        using var source = File.OpenRead(path!);
        var result = EfInventoryWorkflowService.ReadPpeNormWorkbook(source);

        Assert.Equal(448, result.ItemsCreated);
        Assert.Equal(34, result.Scopes.Count);
        Assert.Contains(result.Scopes, scope => scope.DepartmentName == "ЛАБОРАТОРИЯ");
        Assert.Contains(result.Scopes, scope => scope.DepartmentName == "ЭНЕРГО- МЕХАНИЧЕСКИ ОТДЕЛ");
    }

    [Fact]
    public void ReadPpeNormWorkbookKeepsDepartmentScopedPositionsAndImportMetadata()
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet("Нормы");
        sheet.Cell(10, 1).Value = "Цех А";
        sheet.Cell(11, 1).Value = 1;
        sheet.Cell(11, 2).Value = "Оператор";
        sheet.Cell(11, 3).Value = "Защита рук";
        sheet.Cell(11, 4).Value = "Перчатки";
        sheet.Cell(11, 5).Value = "2 пары на 12 мес.";
        sheet.Cell(11, 6).Value = "Пункт 1";
        sheet.Cell(12, 1).Value = 2;
        sheet.Cell(12, 4).Value = "Рукавицы";
        sheet.Cell(12, 5).Value = "1 шт. до износа";
        sheet.Cell(12, 6).Value = "Пункт 2";
        sheet.Cell(13, 1).Value = "Цех Б";
        sheet.Cell(14, 1).Value = 3;
        sheet.Cell(14, 2).Value = "Оператор";
        sheet.Cell(14, 3).Value = "Защита головы";
        sheet.Cell(14, 4).Value = "Каска";
        sheet.Cell(14, 5).Value = "1 шт. на 24 мес.";
        sheet.Cell(14, 6).Value = "Пункт 3";
        sheet.Cell(15, 1).Value = 4;
        sheet.Cell(15, 4).Value = "Жилет";
        sheet.Cell(15, 5).Value = "2 на 4 года";
        sheet.Cell(15, 6).Value = "Пункт 4";

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        stream.Position = 0;

        var result = EfInventoryWorkflowService.ReadPpeNormWorkbook(stream);

        Assert.Equal(2, result.Scopes.Count);
        Assert.Equal(4, result.ItemsCreated);
        Assert.Equal(2, result.GroupsCreated);

        var firstScope = Assert.Single(result.Scopes, scope => scope.DepartmentName == "Цех А");
        Assert.Equal("Оператор", firstScope.PositionName);
        var gloves = Assert.Single(firstScope.Rows, row => row.NormItemName == "Перчатки");
        Assert.Equal("2 пары на 12 мес.", gloves.IssuePeriodText);
        Assert.Equal("Пункт 1", gloves.NormPoint);
        Assert.Equal(2m, gloves.Quantity);
        Assert.Equal("пары", gloves.UnitSymbol);
        Assert.Equal(12, gloves.PeriodMonths);
        Assert.Null(gloves.LifeMonths);

        var mittens = Assert.Single(firstScope.Rows, row => row.NormItemName == "Рукавицы");
        Assert.Equal("шт.", mittens.UnitSymbol);
        Assert.Null(mittens.PeriodMonths);
        Assert.Null(mittens.LifeMonths);

        var secondScope = Assert.Single(result.Scopes, scope => scope.DepartmentName == "Цех Б");
        Assert.Equal("Оператор", secondScope.PositionName);
        Assert.Single(secondScope.Rows, row => row.NormItemName == "Каска");
        var vest = Assert.Single(secondScope.Rows, row => row.NormItemName == "Жилет");
        Assert.Equal("", vest.UnitSymbol);
        Assert.Equal(48, vest.PeriodMonths);
    }
}

[Collection("Postgres integration")]
public sealed class InventoryPpeNormImportDbTests(ITestOutputHelper output)
{
    [PpeTestNormsXlsxDbIntegrationFact]
    public async Task ConfiguredSourceWorkbookCanBeImportedTwiceWithoutOverwritingScopes()
    {
        var path = Environment.GetEnvironmentVariable("PPE_TEST_NORMS_XLSX");

        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        string firstNormItemName;
        await using (var source = File.OpenRead(path!))
        {
            firstNormItemName = EfInventoryWorkflowService.ReadPpeNormWorkbook(source).Scopes
                .SelectMany(scope => scope.Rows)
                .First(row => row.RowType == "item" && row.NormItemName.Length <= 260)
                .NormItemName;
        }
        context.InventoryItems.Add(new InventoryItemEntity
        {
            Id = Guid.NewGuid(), Name = firstNormItemName, Sku = "PPE-IMPORT-TEST", ItemKind = "ppe",
            IsActive = true, TrackingType = "quantity", CreatedAt = DateTimeOffset.UtcNow
        });
        context.SaveChanges();
        var service = new EfInventoryWorkflowService(context);
        var fileName = Path.GetFileName(path!) ?? "ppe-norms.xlsx";
        var stopwatch = Stopwatch.StartNew();

        InventoryCommandResult<InventoryPpeNormImportResultDto> first;
        InventoryCommandResult<InventoryPpeNormImportResultDto> second;
        await using (var source = File.OpenRead(path!))
        {
            first = service.ImportPpeNormSetsDraft(source, fileName);
        }
        await using (var source = File.OpenRead(path!))
        {
            second = service.ImportPpeNormSetsDraft(source, fileName);
        }
        stopwatch.Stop();
        output.WriteLine($"PPE source workbook repeat import: {stopwatch.ElapsedMilliseconds} ms; first={first.Value?.NormSetsCreated}; second={second.Value?.NormSetsCreated}");

        Assert.True(first.Succeeded);
        Assert.True(second.Succeeded);
        Assert.Equal(34, first.Value!.NormSetsCreated);
        Assert.Equal(34, second.Value!.NormSetsCreated);
        Assert.Equal(448, first.Value!.ItemsCreated);
        Assert.Equal(448, second.Value!.ItemsCreated);
        Assert.Equal(68, context.InventoryPpeNormSets.Count());
        Assert.Equal(896, context.InventoryPpeNormRows.Count(row => row.RowType == "item"));
        Assert.All(context.InventoryPpeNormSets, norm =>
        {
            Assert.Equal("draft", norm.Status);
            Assert.True(norm.RequiresReview);
            Assert.False(norm.ScopeConfirmed);
            Assert.Equal("[]", norm.PositionAliasesJson);
        });
        Assert.All(context.InventoryPpeNormCatalogMappings, mapping => Assert.False(mapping.IsApproved));
        Assert.All(
            context.InventoryPpeNormSets.AsNoTracking()
                .GroupBy(norm => new { norm.DepartmentName, norm.PositionName }),
            scope => Assert.Equal(2, scope.Select(norm => norm.VersionName).Distinct(StringComparer.OrdinalIgnoreCase).Count()));
    }

    [DbIntegrationFact]
    public async Task ConcurrentPublishOfDraftsInOneScopeLeavesExactlyOneActiveNorm()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var setup = CreateContext(database.ConnectionString);
        var firstId = AddDraftNorm(setup, "scope-race-1");
        var secondId = AddDraftNorm(setup, "scope-race-2");
        setup.ChangeTracker.Clear();

        await using var firstContext = CreateContext(database.ConnectionString);
        await using var secondContext = CreateContext(database.ConnectionString);
        var first = new EfInventoryWorkflowService(firstContext);
        var second = new EfInventoryWorkflowService(secondContext);
        var request = new PublishInventoryPpeNormSetDto(1, ConfirmReviewed: true);
        var results = await Task.WhenAll(
            Task.Run(() => first.PublishPpeNormSet(firstId, request)),
            Task.Run(() => second.PublishPpeNormSet(secondId, request)));

        Assert.Contains(results, result => result.Succeeded);
        await using var verify = CreateContext(database.ConnectionString);
        Assert.Equal(1, verify.InventoryPpeNormSets.Count(norm =>
            norm.DepartmentName == "Конкурентный цех"
            && norm.PositionName == "Конкурентный оператор"
            && norm.Status == "active"
            && norm.ArchivedAt == null));
    }

    private static Patrol360DbContext CreateContext(string connectionString) =>
        new(new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(connectionString).Options);

    private static Guid AddDraftNorm(Patrol360DbContext context, string versionName)
    {
        var now = DateTimeOffset.UtcNow;
        var norm = new InventoryPpeNormSetEntity
        {
            Id = Guid.NewGuid(), DepartmentName = "Конкурентный цех", PositionName = "Конкурентный оператор",
            PositionAliasesJson = "[]", ScopeConfirmed = true, VersionName = versionName, SourceName = "synthetic",
            Status = "draft", RequiresReview = true, Version = 1, CreatedAt = now, UpdatedAt = now
        };
        norm.Rows.Add(new InventoryPpeNormRowEntity
        {
            Id = Guid.NewGuid(), NormSetId = norm.Id, RowType = "item", SortOrder = 0, NormItemName = "Тестовая каска",
            NormPoint = "п. 1", IssuePeriodText = "1 шт. на 12 мес.", Quantity = 1, QuantityText = "1 шт.",
            UnitSymbol = "шт.", PeriodMonths = 12, RequirementKey = Guid.NewGuid()
        });
        context.InventoryPpeNormSets.Add(norm);
        context.SaveChanges();
        return norm.Id;
    }
}

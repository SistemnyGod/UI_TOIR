using System.Data.Common;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;
using Xunit.Abstractions;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed class PpeIssueDocumentDbTests(ITestOutputHelper output)
{
    private static readonly DateOnly Today = new(2026, 4, 1);

    [DbIntegrationFact]
    public async Task SaveAndConfirmCreatesOneFactWithoutWarehouseMovementsAndIsIdempotent()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));

        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester");

        Assert.True(saved.Succeeded);
        var confirmed = service.ConfirmIssueDocument(saved.Value!.Id, new(saved.Value!.Version, "issue-001"), "tester");
        var repeated = service.ConfirmIssueDocument(saved.Value!.Id, new(saved.Value!.Version, "issue-001"), "tester");

        Assert.True(confirmed.Succeeded);
        Assert.True(repeated.Succeeded);
        Assert.NotNull(confirmed.Value);
        Assert.Equal("confirmed", repeated.Value!.Status);
        Assert.Equal(confirmed.Value!.Version, repeated.Value!.Version);
        Assert.Equal(1, context.InventoryPpeCardLines.Count(line => line.IssueDocumentId == saved.Value!.Id));
        Assert.Empty(context.InventoryStockMoves);
    }

    [DbIntegrationFact]
    public async Task SaveRejectsStaleDraftEdit()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester");
        var updated = service.SaveIssueDocument(saved.Value!.Id, Request(fixture, Today, saved.Value!.Version), "tester");

        var stale = service.SaveIssueDocument(saved.Value!.Id, Request(fixture, Today, saved.Value!.Version), "tester");

        Assert.True(updated.Succeeded);
        Assert.False(stale.Succeeded);
        Assert.Contains("conflict", stale.Errors.Keys);
    }

    [DbIntegrationFact]
    public async Task ConfirmedDocumentKeepsCatalogSnapshotAfterCatalogChanges()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester");
        var confirmed = service.ConfirmIssueDocument(saved.Value!.Id, new(saved.Value!.Version, "snapshot-001"), "tester");

        Assert.True(confirmed.Succeeded);

        fixture.Item.Name = "Каска изменена после сохранения";
        fixture.Item.DefaultUnitPriceMinor = 99_999;
        context.SaveChanges();
        context.ChangeTracker.Clear();

        var loaded = service.GetIssueDocument(saved.Value!.Id);

        Assert.True(loaded.Succeeded);
        var line = Assert.Single(loaded.Value!.Content.Lines);
        Assert.Equal("Каска синтетическая", line.ItemName);
        Assert.Equal(1_000, line.UnitPriceMinor);
        Assert.Equal("Каска по норме", Assert.Single(loaded.Value!.Content.NormRows).NormItemName);
    }

    [DbIntegrationFact]
    public async Task ReturnedFactStillCountsInRollingNormHistory()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context, normQuantity: 1);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var first = service.SaveIssueDocument(null, Request(fixture, Today), "tester");
        var confirmed = service.ConfirmIssueDocument(first.Value!.Id, new(first.Value!.Version, "returned-001"), "tester");
        Assert.True(confirmed.Succeeded);

        var issued = Assert.Single(context.InventoryPpeCardLines);
        issued.Status = "returned";
        issued.ReturnedAt = DateTimeOffset.UtcNow;
        context.SaveChanges();

        var next = service.SaveIssueDocument(null, Request(fixture, Today), "tester");

        Assert.True(next.Succeeded);
        var entitlement = Assert.Single(next.Value!.Validation.Entitlements);
        Assert.Equal(1m, entitlement.AlreadyIssuedQuantity);
        Assert.Contains(next.Value!.Validation.Errors, error => error.Code == "exception_reason");
    }

    [DbIntegrationFact]
    public async Task SameNormCanUseTwoApprovedProductsAndCombinesTheirDates()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var secondItem = AddApprovedAlternative(context, fixture);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var request = new SavePpeIssueDocumentDto(
            fixture.Employee.Id, fixture.Norm.Id, Today, "Тестовый ответственный", "Тестовое основание", null,
            [
                new PpeIssueDocumentLineInput(Guid.NewGuid(), fixture.Row.Id, fixture.Item.Id, Today, 1, 1_000),
                new PpeIssueDocumentLineInput(Guid.NewGuid(), fixture.Row.Id, secondItem.Id, Today.AddDays(1), 1, 1_100)
            ]);

        var saved = service.SaveIssueDocument(null, request, "tester");

        Assert.True(saved.Succeeded);
        Assert.Empty(saved.Value!.Validation.Errors);
        Assert.Equal(2, saved.Value!.Validation.Entitlements.Count);
        Assert.Equal(1m, saved.Value!.Validation.Entitlements[1].AvailableQuantity);
    }

    [DbIntegrationFact]
    public async Task UnknownLegacyRevisionHistoryRequiresManualConfirmation()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        AddUnknownLegacyHistory(context, fixture);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));

        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester");

        Assert.True(saved.Succeeded);
        Assert.Contains(saved.Value!.Validation.Warnings, warning => warning.Code == "manual_control");
        Assert.Contains(saved.Value!.Validation.Errors, error => error.Code == "manual_confirmation");
    }

    [DbIntegrationFact]
    public async Task KnownUnrelatedDocumentHistoryDoesNotRequireManualConfirmation()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        AddKnownUnrelatedDocumentHistory(context, fixture);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));

        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester");

        Assert.True(saved.Succeeded);
        Assert.DoesNotContain(saved.Value!.Validation.Errors, error => error.Code == "manual_confirmation");
        Assert.Equal(0, Assert.Single(saved.Value.Validation.Entitlements).AlreadyIssuedQuantity);
    }

    [DbIntegrationFact]
    public async Task ConcurrentLegacyMigrationReturnsTheSameSingleDocument()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        Guid cardId;
        await using (var setup = CreateContext(database.ConnectionString))
        {
            var fixture = Seed(setup);
            cardId = AddLegacyDraft(setup, fixture).Id;
        }

        await using var firstContext = CreateContext(database.ConnectionString);
        await using var secondContext = CreateContext(database.ConnectionString);
        var results = await Task.WhenAll(
            Task.Run(() => new EfInventoryWorkflowService(firstContext, new FixedClock(Today)).MigratePpeLegacyDraft(cardId, "tester-a")),
            Task.Run(() => new EfInventoryWorkflowService(secondContext, new FixedClock(Today)).MigratePpeLegacyDraft(cardId, "tester-b")));

        Assert.All(results, result => Assert.True(result.Succeeded));
        Assert.Single(results.Select(result => result.Value!.DocumentId).Distinct());
        await using var verify = CreateContext(database.ConnectionString);
        Assert.Single(verify.Set<PpeIssueDocumentEntity>().Where(document => document.LegacyCardId == cardId));
    }

    [DbIntegrationFact]
    public async Task PendingDraftAcceptsExplicitNormRevisionChange()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester");

        fixture.Norm.Version += 1;
        fixture.Norm.UpdatedAt = DateTimeOffset.UtcNow;
        context.SaveChanges();
        var updated = service.SaveIssueDocument(saved.Value!.Id, Request(fixture, Today, saved.Value!.Version) with { AcceptNormChange = true }, "tester");

        Assert.True(updated.Succeeded);
        Assert.Equal(2, updated.Value!.Content.NormSetVersion);
    }

    [DbIntegrationFact]
    public async Task ConcurrentConfirmIsAtomicAndWritesOneFactAndAuditEvent()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var setup = CreateContext(database.ConnectionString);
        var fixture = Seed(setup);
        var setupService = new EfInventoryWorkflowService(setup, new FixedClock(Today));
        var saved = setupService.SaveIssueDocument(null, Request(fixture, Today), "tester");
        var request = new ConfirmPpeIssueDocumentDto(saved.Value!.Version, "race-001");
        setup.ChangeTracker.Clear();

        await using var firstContext = CreateContext(database.ConnectionString);
        await using var secondContext = CreateContext(database.ConnectionString);
        var firstService = new EfInventoryWorkflowService(firstContext, new FixedClock(Today));
        var secondService = new EfInventoryWorkflowService(secondContext, new FixedClock(Today));
        var results = await Task.WhenAll(
            Task.Run(() => firstService.ConfirmIssueDocument(saved.Value!.Id, request, "tester-a")),
            Task.Run(() => secondService.ConfirmIssueDocument(saved.Value!.Id, request, "tester-b")));

        Assert.All(results, result => Assert.True(result.Succeeded));
        await using var verify = CreateContext(database.ConnectionString);
        Assert.Equal(1, verify.InventoryPpeCardLines.Count(line => line.IssueDocumentId == saved.Value!.Id));
        Assert.Equal(1, verify.InventorySystemLogs.Count(log => log.EntityId == saved.Value!.Id && log.Action == "confirmed"));
    }

    [DbIntegrationFact]
    public async Task ApplicableGetSaveAndConfirmUseBoundedDatabaseCommands()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var commands = new CommandCounter();
        await using var context = CreateContext(database.ConnectionString, commands);
        var fixture = Seed(context);
        commands.Reset();
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var stopwatch = Stopwatch.StartNew();

        var applicable = service.GetApplicablePpeNorms(fixture.Employee.Id, Today);
        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester");
        var confirmed = service.ConfirmIssueDocument(saved.Value!.Id, new(saved.Value!.Version, "metrics-001"), "tester");
        stopwatch.Stop();
        output.WriteLine($"PPE issue document apply/get/save/confirm: {stopwatch.ElapsedMilliseconds} ms; SQL commands={commands.Count}");

        Assert.Single(applicable);
        Assert.True(confirmed.Succeeded);
        Assert.True(commands.Count <= 40, $"Expected bounded command count; actual {commands.Count}.");
    }

    [DbIntegrationFact]
    public async Task ConfirmBlocksFutureIssueDate()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var saved = service.SaveIssueDocument(null, Request(fixture, Today.AddDays(1)), "tester");

        Assert.True(saved.Succeeded);
        Assert.Contains(saved.Value!.Validation.Warnings, warning => warning.Code == "future_date");
        var confirmed = service.ConfirmIssueDocument(saved.Value!.Id, new(saved.Value!.Version, "future-001"), "tester");

        Assert.False(confirmed.Succeeded);
        Assert.Contains(confirmed.Errors.Values.SelectMany(errors => errors), error => error.Contains("Будущая дата", StringComparison.Ordinal));
        Assert.Empty(context.InventoryPpeCardLines);
    }

    [DbIntegrationFact]
    public async Task SaveBlocksUnapprovedMapping()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context, approved: false);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));

        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester");

        Assert.False(saved.Succeeded);
        Assert.Contains("mapping", saved.Errors.Keys);
        Assert.Empty(context.Set<PpeIssueDocumentEntity>());
    }

    private static Fixture Seed(Patrol360DbContext context, bool approved = true, decimal normQuantity = 2)
    {
        var now = DateTimeOffset.UtcNow;
        var unit = new InventoryUnitEntity { Id = Guid.NewGuid(), Name = "Штука", Symbol = "шт." };
        var employee = new EmployeeEntity
        {
            Id = Guid.NewGuid(), FullName = "Синтетический Оператор", PersonnelNo = $"TEST-{Guid.NewGuid():N}"[..16],
            Department = "Синтетический цех", Position = "Оператор", Status = "active"
        };
        var item = new InventoryItemEntity
        {
            Id = Guid.NewGuid(), Name = "Каска синтетическая", Sku = $"PPE-{Guid.NewGuid():N}"[..16], UnitId = unit.Id,
            ItemKind = "ppe", NormItemName = "Каска по норме", ActualItemName = "Каска синтетическая",
            DefaultUnitPriceMinor = 1_000, IsActive = true, TrackingType = "quantity", CreatedAt = now
        };
        var norm = new InventoryPpeNormSetEntity
        {
            Id = Guid.NewGuid(), DepartmentName = employee.Department, PositionName = employee.Position,
            PositionAliasesJson = "[\"Оператор\"]", ScopeConfirmed = true, VersionName = "test-1",
            SourceName = "synthetic", Status = "active", Version = 1, CreatedAt = now, UpdatedAt = now
        };
        var row = new InventoryPpeNormRowEntity
        {
            Id = Guid.NewGuid(), NormSetId = norm.Id, RowType = "item", SortOrder = 0, NormItemName = "Каска по норме",
            NormPoint = "п. 1", IssuePeriodText = "1 шт. на 12 мес.", Quantity = normQuantity, QuantityText = $"{normQuantity:0.###} шт.",
            PeriodMonths = 12, UnitSymbol = "шт.", RequirementKey = Guid.NewGuid()
        };
        var mapping = new InventoryPpeNormCatalogMappingEntity
        {
            Id = Guid.NewGuid(), NormRowId = row.Id, ItemId = item.Id, IsDefault = true, IsApproved = approved,
            NormUnitsPerItem = 1, ApprovedBy = approved ? "ОТ" : string.Empty,
            ApprovalEvidence = approved ? "synthetic approval" : string.Empty, DefaultUnitPriceMinor = 1_000,
            CreatedAt = now, UpdatedAt = now
        };
        row.Mappings.Add(mapping);
        norm.Rows.Add(row);
        context.AddRange(unit, employee, item, norm);
        context.SaveChanges();
        return new(employee, item, norm, row);
    }

    private static InventoryItemEntity AddApprovedAlternative(Patrol360DbContext context, Fixture fixture)
    {
        var item = new InventoryItemEntity
        {
            Id = Guid.NewGuid(), Name = "Каска синтетическая альтернативная", Sku = $"PPE-{Guid.NewGuid():N}"[..16],
            UnitId = fixture.Item.UnitId, ItemKind = "ppe", NormItemName = fixture.Row.NormItemName,
            ActualItemName = "Каска синтетическая альтернативная", DefaultUnitPriceMinor = 1_100,
            IsActive = true, TrackingType = "quantity", CreatedAt = DateTimeOffset.UtcNow
        };
        var mapping = new InventoryPpeNormCatalogMappingEntity
        {
            Id = Guid.NewGuid(), NormRowId = fixture.Row.Id, ItemId = item.Id, IsDefault = false,
            IsApproved = true, NormUnitsPerItem = 1, ApprovedBy = "ОТ", ApprovalEvidence = "synthetic alternative",
            DefaultUnitPriceMinor = 1_100, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
        };
        context.AddRange(item, mapping);
        context.SaveChanges();
        return item;
    }

    private static void AddUnknownLegacyHistory(Patrol360DbContext context, Fixture fixture)
    {
        var card = new InventoryPpeCardEntity
        {
            Id = Guid.NewGuid(), EmployeeId = fixture.Employee.Id, Position = fixture.Employee.Position,
            Status = "active", Version = 1, CreatedAt = DateTimeOffset.UtcNow
        };
        var row = new InventoryPpeCardNormRowEntity
        {
            Id = Guid.NewGuid(), CardId = card.Id, RowType = "item", SortOrder = 0, NormItemName = "Старая неизвестная норма",
            NormPoint = "", IssuePeriodText = "", Quantity = 1, QuantityText = "1 шт."
        };
        var line = new InventoryPpeCardLineEntity
        {
            Id = Guid.NewGuid(), CardId = card.Id, CardNormRowId = row.Id, ItemId = fixture.Item.Id, Quantity = 1,
            UnitPriceMinor = 1_000, Status = "issued", IssuedAt = DateTimeOffset.UtcNow, PrintItemName = row.NormItemName
        };
        context.AddRange(card, row, line);
        context.SaveChanges();
    }

    private static void AddKnownUnrelatedDocumentHistory(Patrol360DbContext context, Fixture fixture)
    {
        var card = new InventoryPpeCardEntity
        {
            Id = Guid.NewGuid(), EmployeeId = fixture.Employee.Id, Position = fixture.Employee.Position,
            Status = "active", Version = 1, CreatedAt = DateTimeOffset.UtcNow
        };
        var unrelatedRequirement = Guid.NewGuid();
        var document = new PpeIssueDocumentEntity
        {
            Id = Guid.NewGuid(), EmployeeId = fixture.Employee.Id, NormSetId = fixture.Norm.Id, Version = 2,
            Status = "confirmed", ContentJson = "{}", ValidationJson = "{}", CreatedAt = DateTimeOffset.UtcNow,
            ConfirmedAt = DateTimeOffset.UtcNow, CreatedBy = "fixture", IdempotencyKey = $"fixture-{Guid.NewGuid():N}"
        };
        var row = new InventoryPpeCardNormRowEntity
        {
            Id = Guid.NewGuid(), CardId = card.Id, RowType = "item", SortOrder = 0, NormItemName = "Другое известное требование",
            NormPoint = "п. 2", IssuePeriodText = "1 шт. на 12 мес.", Quantity = 1, QuantityText = "1 шт."
        };
        var line = new InventoryPpeCardLineEntity
        {
            Id = Guid.NewGuid(), CardId = card.Id, CardNormRowId = row.Id, IssueDocumentId = document.Id,
            IssueDate = Today, RequirementKey = unrelatedRequirement, NormUnitsPerItem = 1, ItemId = fixture.Item.Id,
            Quantity = 1, UnitPriceMinor = 1_000, Status = "issued", IssuedAt = DateTimeOffset.UtcNow,
            PrintItemName = row.NormItemName
        };
        context.AddRange(card, document, row, line);
        context.SaveChanges();
    }

    private static InventoryPpeCardEntity AddLegacyDraft(Patrol360DbContext context, Fixture fixture)
    {
        var card = new InventoryPpeCardEntity
        {
            Id = Guid.NewGuid(), EmployeeId = fixture.Employee.Id, Position = fixture.Employee.Position,
            Status = "draft", Version = 1, CreatedAt = new DateTimeOffset(Today.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            NormSetId = fixture.Norm.Id, ResponsibleName = "Тестовый ответственный", Basis = "Тестовое основание"
        };
        var row = new InventoryPpeCardNormRowEntity
        {
            Id = Guid.NewGuid(), CardId = card.Id, SourceNormRowId = fixture.Row.Id, RowType = "item", SortOrder = 0,
            NormItemName = fixture.Row.NormItemName, NormPoint = fixture.Row.NormPoint,
            IssuePeriodText = fixture.Row.IssuePeriodText, Quantity = fixture.Row.Quantity,
            QuantityText = fixture.Row.QuantityText, MappedItemId = fixture.Item.Id, DraftQuantity = 1,
            DraftIssuedAt = new DateTimeOffset(Today.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero), DraftUnitPriceMinor = 1_000
        };
        context.AddRange(card, row);
        context.SaveChanges();
        return card;
    }

    private static SavePpeIssueDocumentDto Request(Fixture fixture, DateOnly issueDate, long? expectedVersion = null) =>
        new(fixture.Employee.Id, fixture.Norm.Id, issueDate, "Тестовый ответственный", "Тестовое основание", null,
            [new PpeIssueDocumentLineInput(Guid.NewGuid(), fixture.Row.Id, fixture.Item.Id, issueDate, 1, 1_000)], expectedVersion);

    private static Patrol360DbContext CreateContext(string connectionString, CommandCounter? commands = null)
    {
        var builder = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(connectionString);
        if (commands is not null) builder.AddInterceptors(commands);
        return new(builder.Options);
    }

    private sealed record Fixture(EmployeeEntity Employee, InventoryItemEntity Item, InventoryPpeNormSetEntity Norm, InventoryPpeNormRowEntity Row);

    private sealed class FixedClock(DateOnly today) : IPatrolTimeZone
    {
        public TimeZoneInfo Zone { get; } = TimeZoneInfo.Utc;
        public DateOnly Today { get; } = today;
        public DateTimeOffset ToUtc(DateOnly date, TimeOnly time) => new(date.ToDateTime(time), TimeSpan.Zero);
        public DateTimeOffset StartOfDayUtc(DateOnly date) => ToUtc(date, TimeOnly.MinValue);
        public DateTimeOffset StartOfNextDayUtc(DateOnly date) => StartOfDayUtc(date.AddDays(1));
        public DateOnly GetDate(DateTimeOffset instant) => DateOnly.FromDateTime(instant.UtcDateTime);
        public TimeOnly GetTime(DateTimeOffset instant) => TimeOnly.FromDateTime(instant.UtcDateTime);
    }

    private sealed class CommandCounter : DbCommandInterceptor
    {
        private int count;
        public int Count => Volatile.Read(ref count);
        public void Reset() => Interlocked.Exchange(ref count, 0);

        public override InterceptionResult<DbDataReader> ReaderExecuting(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
        {
            Interlocked.Increment(ref count);
            return base.ReaderExecuting(command, eventData, result);
        }

        public override InterceptionResult<int> NonQueryExecuting(
            DbCommand command, CommandEventData eventData, InterceptionResult<int> result)
        {
            Interlocked.Increment(ref count);
            return base.NonQueryExecuting(command, eventData, result);
        }

        public override InterceptionResult<object> ScalarExecuting(
            DbCommand command, CommandEventData eventData, InterceptionResult<object> result)
        {
            Interlocked.Increment(ref count);
            return base.ScalarExecuting(command, eventData, result);
        }
    }
}

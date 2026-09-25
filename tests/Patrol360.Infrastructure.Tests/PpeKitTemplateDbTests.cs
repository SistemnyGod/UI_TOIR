using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;
using Patrol360.Infrastructure.Persistence.Inventory;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed class PpeKitTemplateDbTests
{
    [DbIntegrationFact]
    public async Task ExistingTemplateCanAddAndRemoveCompositionLines()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = Context(database.ConnectionString);
        var fixture = SeedNorm(context); var owner = Guid.NewGuid();
        var service = new EfPpeKitTemplateService(context);
        var original = Request(fixture, "Состав", false);
        var saved = service.Create(original, owner, "Владелец", false).Value!;
        var extra = original.Lines[0] with { NormRowId = Guid.NewGuid(), ItemName = "Дополнительная позиция" };
        var expanded = service.Update(saved.Id, new(saved.Version, saved.Name, false, [original.Lines[0], extra]), owner, false);
        Assert.True(expanded.Succeeded, string.Join("; ", expanded.Errors.Values.SelectMany(x => x)));
        Assert.Equal(2, expanded.Value!.Lines.Count);
        context.ChangeTracker.Clear();
        var reduced = service.Update(saved.Id, new(expanded.Value.Version, saved.Name, false, [extra]), owner, false);
        Assert.True(reduced.Succeeded);
        Assert.Equal(extra.NormRowId, Assert.Single(reduced.Value!.Lines).NormRowId);
        context.ChangeTracker.Clear();
        Assert.Equal(extra.NormRowId, Assert.Single(context.InventoryPpeIssueTemplateLines).NormRowId);
    }

    [DbIntegrationFact]
    public async Task MigrationPreservesPopulatedLegacyTemplateAndLongName()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = Context(database.ConnectionString);
        var migrator = context.GetService<IMigrator>();
        await migrator.MigrateAsync("20260908103000_IncrementalPercoPresenceRebuild");
        var id = Guid.NewGuid(); var longName = new string('Ш', 150);
        await using (var connection = new NpgsqlConnection(database.ConnectionString))
        {
            await connection.OpenAsync();
            await using var insert = connection.CreateCommand();
            insert.CommandText = "INSERT INTO inventory.ppe_issue_templates (id, legacy_id, name, is_archived) VALUES (@id, 712, @name, false)";
            insert.Parameters.AddWithValue("id", id); insert.Parameters.AddWithValue("name", longName); await insert.ExecuteNonQueryAsync();
        }
        await context.Database.MigrateAsync(); context.ChangeTracker.Clear();
        var retained = await context.InventoryPpeIssueTemplates.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal(712, retained.LegacyId); Assert.Equal(longName, retained.Name); Assert.Equal(Guid.Empty, retained.OwnerUserId); Assert.Equal(Guid.Empty, retained.NormSetId); Assert.Empty(retained.Lines);
    }

    [DbIntegrationFact]
    public async Task ReadsExposeOnlyOwnerAndSharedTemplatesAndPrivateOwnerCannotBeMutated()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = Context(database.ConnectionString);
        var fixture = SeedNorm(context);
        var owner = Guid.NewGuid(); var other = Guid.NewGuid();
        var service = new EfPpeKitTemplateService(context);
        var personal = service.Create(Request(fixture, "Личный", false), owner, "Владелец", false).Value!;
        var shared = service.Create(Request(fixture, "Общий", true), owner, "Владелец", true).Value!;

        var ownerRows = service.Get(owner);
        Assert.Equal(2, ownerRows.Count); Assert.Contains(ownerRows, x => x.Id == personal.Id); Assert.Contains(ownerRows, x => x.Id == shared.Id);
        Assert.Equal([shared.Id], service.Get(other).Select(x => x.Id).ToArray());
        var denied = service.Rename(personal.Id, new(personal.Version, "Чужое имя"), other, true);
        Assert.False(denied.Succeeded);
        Assert.Contains("id", denied.Errors.Keys);
        Assert.Equal("Личный", service.Get(owner).Single(x => x.Id == personal.Id).Name);
    }

    [DbIntegrationFact]
    public async Task SharedMutationsRequireNormManagementAndStaleVersionsConflict()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var owner = Guid.NewGuid(); var editor = Guid.NewGuid(); PpeKitTemplateDto shared;
        await using (var setup = Context(database.ConnectionString))
        {
            var fixture = SeedNorm(setup);
            shared = new EfPpeKitTemplateService(setup).Create(Request(fixture, "Общий", true), owner, "Владелец", true).Value!;
        }
        await using var context = Context(database.ConnectionString);
        var service = new EfPpeKitTemplateService(context);
        var denied = service.Rename(shared.Id, new(shared.Version, "Запрещено"), editor, false);
        Assert.False(denied.Succeeded); Assert.Contains("permission", denied.Errors.Keys);
        var renamed = service.Rename(shared.Id, new(shared.Version, "Разрешено"), editor, true);
        Assert.True(renamed.Succeeded);
        var stale = service.Archive(shared.Id, new(shared.Version), editor, true);
        Assert.False(stale.Succeeded); Assert.Contains("conflict", stale.Errors.Keys);
        // Each API mutation has a fresh scoped DbContext; discard the deliberately stale tracked state.
        context.ChangeTracker.Clear();
        var madePrivate = service.Update(shared.Id, new(renamed.Value!.Version, renamed.Value.Name, false,
            renamed.Value.Lines.Select(x => new SavePpeKitTemplateLineDto(x.NormRowId, x.ItemId, x.ItemName, x.UnitSymbol, x.Quantity, x.LifeMonths, x.UnitPriceMinor)).ToList()), editor, true);
        Assert.True(madePrivate.Succeeded, string.Join("; ", madePrivate.Errors.SelectMany(x => x.Value.Select(value => $"{x.Key}: {value}")))); Assert.Equal(owner, madePrivate.Value!.OwnerUserId);
        Assert.DoesNotContain(service.Get(editor), x => x.Id == shared.Id);
        Assert.Contains(service.Get(owner), x => x.Id == shared.Id);
    }

    [DbIntegrationFact]
    public async Task ConcurrencyTokenRejectsTwoEditorsThatLoadedTheSameVersion()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        var owner = Guid.NewGuid(); PpeKitTemplateDto template;
        await using (var setup = Context(database.ConnectionString)) { var fixture = SeedNorm(setup); template = new EfPpeKitTemplateService(setup).Create(Request(fixture, "Исходный", false), owner, "Владелец", false).Value!; }
        await using var firstContext = Context(database.ConnectionString); await using var secondContext = Context(database.ConnectionString);
        _ = firstContext.InventoryPpeIssueTemplates.Single(x => x.Id == template.Id);
        _ = secondContext.InventoryPpeIssueTemplates.Single(x => x.Id == template.Id);
        var first = new EfPpeKitTemplateService(firstContext).Rename(template.Id, new(template.Version, "Первый"), owner, false);
        var second = new EfPpeKitTemplateService(secondContext).Rename(template.Id, new(template.Version, "Второй"), owner, false);
        Assert.True(first.Succeeded);
        Assert.False(second.Succeeded); Assert.Contains("conflict", second.Errors.Keys);
    }

    [DbIntegrationFact]
    public async Task ApplyRejectsArchivedChangedOrUnapprovedMappings()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = Context(database.ConnectionString);
        var fixture = SeedNorm(context); var owner = Guid.NewGuid(); var service = new EfPpeKitTemplateService(context);
        var valid = service.Create(Request(fixture, "Проверяемый", false), owner, "Владелец", false).Value!;
        Assert.True(service.Apply(valid.Id, fixture.Norm.Id, owner).Succeeded);
        Assert.Contains("normSetId", service.Apply(valid.Id, Guid.NewGuid(), owner).Errors.Keys);
        fixture.Mapping.IsApproved = false; context.SaveChanges();
        Assert.Contains("mapping", service.Apply(valid.Id, fixture.Norm.Id, owner).Errors.Keys);
        fixture.Mapping.IsApproved = true; context.SaveChanges();
        fixture.Item.Name = "Каска из текущего каталога"; context.SaveChanges();
        Assert.Equal("Каска из текущего каталога", Assert.Single(service.Apply(valid.Id, fixture.Norm.Id, owner).Value!.Lines).ItemName);
        fixture.Item.IsActive = false; context.SaveChanges();
        Assert.Contains("itemId", service.Apply(valid.Id, fixture.Norm.Id, owner).Errors.Keys);
        fixture.Item.IsActive = true; context.SaveChanges();
        var archived = service.Archive(valid.Id, new(valid.Version), owner, false);
        Assert.True(archived.Succeeded);
        Assert.Contains("id", service.Apply(valid.Id, fixture.Norm.Id, owner).Errors.Keys);
    }

    [DbIntegrationFact]
    public async Task PersistedContractContainsNoEmployeeSizeOrIssueDateFields()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = Context(database.ConnectionString);
        var fixture = SeedNorm(context); var owner = Guid.NewGuid();
        var saved = new EfPpeKitTemplateService(context).Create(Request(fixture, "Без персональных данных", false), owner, "Владелец", false).Value!;
        var json = JsonSerializer.Serialize(saved, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.DoesNotContain("employee", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("size", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("issueDate", json, StringComparison.OrdinalIgnoreCase);
        var line = Assert.Single(context.InventoryPpeIssueTemplateLines);
        Assert.Equal(fixture.Row.Id, line.NormRowId); Assert.Equal(fixture.Item.Id, line.ItemId); Assert.Equal(2, line.Quantity); Assert.Equal(18, line.LifeMonths); Assert.Equal(1_500, line.UnitPriceMinor);
    }

    [DbIntegrationFact]
    public async Task CreateValidatesNullLinesAndOwnerIdentityWithoutWriting()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = Context(database.ConnectionString); var fixture = SeedNorm(context); var service = new EfPpeKitTemplateService(context);
        var missingLines = service.Create(new("Шаблон", fixture.Norm.Id, false, null!), Guid.NewGuid(), "Владелец", false);
        var missingOwner = service.Create(Request(fixture, "Шаблон", false), Guid.Empty, "", false);
        var invalidQuantity = service.Create(new("Шаблон", fixture.Norm.Id, false, [new(fixture.Row.Id, fixture.Item.Id, fixture.Item.Name, "шт.", 1.0001m, 12, 100)]), Guid.NewGuid(), "Владелец", false);
        var nullLine = service.Create(new("Шаблон", fixture.Norm.Id, false, [null!]), Guid.NewGuid(), "Владелец", false);
        Assert.Contains("lines", missingLines.Errors.Keys); Assert.Contains("userId", missingOwner.Errors.Keys); Assert.Contains("lines", invalidQuantity.Errors.Keys); Assert.Contains("lines", nullLine.Errors.Keys);
        Assert.Empty(context.InventoryPpeIssueTemplates);
    }

    private static CreatePpeKitTemplateDto Request(Fixture f, string name, bool shared) => new(name, f.Norm.Id, shared, [new(f.Row.Id, f.Item.Id, f.Item.Name, "шт.", 2, 18, 1_500)]);
    private static Patrol360DbContext Context(string connection) => new(new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(connection).Options);
    private static Fixture SeedNorm(Patrol360DbContext context)
    {
        var now = DateTimeOffset.UtcNow; var unit = new InventoryUnitEntity { Id = Guid.NewGuid(), Name = "Штука", Symbol = "шт." };
        var item = new InventoryItemEntity { Id = Guid.NewGuid(), Name = "Каска", Sku = $"KIT-{Guid.NewGuid():N}"[..16], UnitId = unit.Id, ItemKind = "ppe", IsActive = true, TrackingType = "quantity", CreatedAt = now };
        var norm = new InventoryPpeNormSetEntity { Id = Guid.NewGuid(), DepartmentName = "Цех", PositionName = "Рабочий", PositionAliasesJson = "[]", ScopeConfirmed = true, VersionName = "kit-test", SourceName = "test", Status = "active", Version = 1, CreatedAt = now, UpdatedAt = now };
        var row = new InventoryPpeNormRowEntity { Id = Guid.NewGuid(), NormSetId = norm.Id, RowType = "item", NormItemName = "Каска", Quantity = 1, QuantityText = "1 шт.", UnitSymbol = "шт.", RequirementKey = Guid.NewGuid() };
        var mapping = new InventoryPpeNormCatalogMappingEntity { Id = Guid.NewGuid(), NormRowId = row.Id, ItemId = item.Id, IsApproved = true, IsDefault = true, NormUnitsPerItem = 1, ApprovedBy = "ОТ", ApprovalEvidence = "test", CreatedAt = now, UpdatedAt = now };
        row.Mappings.Add(mapping); norm.Rows.Add(row); context.AddRange(unit, item, norm); context.SaveChanges(); return new(norm, row, item, mapping);
    }
    private sealed record Fixture(InventoryPpeNormSetEntity Norm, InventoryPpeNormRowEntity Row, InventoryItemEntity Item, InventoryPpeNormCatalogMappingEntity Mapping);
}

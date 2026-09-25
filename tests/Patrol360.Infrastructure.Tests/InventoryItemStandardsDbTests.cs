using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed class InventoryItemStandardsDbTests
{
    [DbIntegrationFact]
    public async Task CatalogRoundTripSupportsMultipleStandardsAndLegacyUpdatePreservesThem()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var db = new Patrol360DbContext(new DbContextOptionsBuilder<Patrol360DbContext>()
            .UseNpgsql(database.ConnectionString).Options);
        var commands = new EfInventoryCatalogCommandService(db);
        var created = commands.CreateItem(new UpsertInventoryItemDto(
            "Каска со стандартами", "STD-1", ItemKind: "ppe", IsConsumable: false, TrackLife: true,
            Standards:
            [
                new("ГОСТ 12.4.128-83", "Каски защитные"),
                new("ТР ТС 019/2011", "О безопасности СИЗ")
            ]));

        Assert.True(created.Succeeded);
        Assert.Equal(2, created.Value!.Standards!.Count);

        // An older client does not send Standards. Its ordinary edit must not erase catalog data.
        var legacyUpdate = commands.UpdateItem(created.Value.Id, new UpsertInventoryItemDto(
            "Каска после редактирования", "STD-1", ItemKind: "ppe", IsConsumable: false, TrackLife: true));

        Assert.True(legacyUpdate.Succeeded);
        Assert.Equal(new[] { "ГОСТ 12.4.128-83", "ТР ТС 019/2011" },
            legacyUpdate.Value!.Standards!.Select(x => x.Designation));
        db.ChangeTracker.Clear();
        var queried = new EfInventoryCatalogQuery(db).GetItems(new(ItemId: created.Value.Id));
        Assert.Equal("Каски защитные", Assert.Single(queried.Rows).Standards![0].Name);
    }

    [DbIntegrationFact]
    public async Task CatalogRejectsMissingDesignationAndExcessiveStandardLists()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var db = new Patrol360DbContext(new DbContextOptionsBuilder<Patrol360DbContext>()
            .UseNpgsql(database.ConnectionString).Options);
        var commands = new EfInventoryCatalogCommandService(db);

        var missingDesignation = commands.CreateItem(new UpsertInventoryItemDto(
            "Некорректная каска", ItemKind: "ppe", IsConsumable: false, TrackLife: true,
            Standards: [new("", "Название без обозначения")]));
        var tooMany = commands.CreateItem(new UpsertInventoryItemDto(
            "Слишком много стандартов", ItemKind: "ppe", IsConsumable: false, TrackLife: true,
            Standards: Enumerable.Range(1, 51).Select(x => new InventoryItemStandardDto($"ГОСТ {x}")).ToList()));

        Assert.False(missingDesignation.Succeeded);
        Assert.Contains("standards", missingDesignation.Errors.Keys);
        Assert.False(tooMany.Succeeded);
        Assert.Contains("standards", tooMany.Errors.Keys);
    }
}

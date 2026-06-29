using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class InventoryWorkflowDbIntegrationTests
{
    [DbIntegrationFact]
    public async Task CustodyRecordCanBeTransferredAndKeepsHistory()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employees = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 2)).Rows);
        Assert.True(employees.Count >= 2);
        var item = CreateItem(provider);

        var created = UseWorkflow(provider, workflow => workflow.CreateCustodyRecord(new CreateInventoryCustodyRecordDto(
            employees[0].Id,
            item.Id,
            WarehouseId: null,
            Quantity: 1,
            Comment: "Initial issue")));
        Assert.True(created.Succeeded);
        Assert.NotNull(created.Value);
        Assert.Equal(employees[0].FullName, created.Value!.EmployeeName);

        var duplicateIssue = UseWorkflow(provider, workflow => workflow.CreateCustodyRecord(new CreateInventoryCustodyRecordDto(
            employees[1].Id,
            item.Id,
            WarehouseId: null,
            Quantity: 1,
            Comment: "Duplicate issue must be rejected")));
        Assert.False(duplicateIssue.Succeeded);
        Assert.True(duplicateIssue.Errors.ContainsKey("itemId"));

        var transferredAt = DateTimeOffset.Parse("2026-06-29T09:30:00Z");
        var transferred = UseWorkflow(provider, workflow => workflow.TransferCustodyRecord(
            created.Value.Id,
            new TransferInventoryCustodyRecordDto(
                Guid.Empty,
                transferredAt,
                "Shift handoff",
                ToEmployeeId: employees[1].Id,
                FromEmployeeId: employees[0].Id)));

        Assert.True(transferred.Succeeded);
        Assert.NotNull(transferred.Value);
        Assert.Equal(employees[1].FullName, transferred.Value!.EmployeeName);
        Assert.Equal("in_use", transferred.Value.Status);
        Assert.Null(transferred.Value.ClosedAt);
        Assert.Contains("Shift handoff", transferred.Value.Comment, StringComparison.Ordinal);

        var history = UseWorkflow(provider, workflow => workflow.GetCustodyRecordHistory(
            created.Value.Id,
            new InventoryListQuery(PageSize: 10)));
        Assert.Contains(history.Rows, row =>
            row.Action == "transferred"
            && row.Description.Contains(employees[0].FullName, StringComparison.Ordinal)
            && row.Description.Contains(employees[1].FullName, StringComparison.Ordinal)
            && row.Description.Contains("Shift handoff", StringComparison.Ordinal));

        var systemHistory = UseWorkflow(provider, workflow => workflow.GetHistory(new InventoryListQuery(
            PageSize: 10,
            EntityType: "custody_record",
            Action: "transferred")));
        Assert.Contains(systemHistory.Rows, row =>
            row.Description.Contains(employees[0].FullName, StringComparison.Ordinal)
            && row.Description.Contains(employees[1].FullName, StringComparison.Ordinal));

        var returned = UseWorkflow(provider, workflow => workflow.UpdateCustodyRecordStatus(
            created.Value.Id,
            new UpdateInventoryStatusDto("returned", "Returned after transfer")));
        Assert.True(returned.Succeeded);
        Assert.Equal("returned", returned.Value!.Status);
        Assert.Equal(employees[1].FullName, returned.Value.EmployeeName);

        var reissued = UseWorkflow(provider, workflow => workflow.CreateCustodyRecord(new CreateInventoryCustodyRecordDto(
            employees[0].Id,
            item.Id,
            WarehouseId: null,
            Quantity: 1,
            Comment: "Reissue after return")));
        Assert.True(reissued.Succeeded);
        Assert.NotNull(reissued.Value);

        var lost = UseWorkflow(provider, workflow => workflow.UpdateCustodyRecordStatus(
            reissued.Value!.Id,
            new UpdateInventoryStatusDto("lost", "Defective item")));
        Assert.True(lost.Succeeded);
        Assert.Equal("lost", lost.Value!.Status);

        var transferLost = UseWorkflow(provider, workflow => workflow.TransferCustodyRecord(
            reissued.Value.Id,
            new TransferInventoryCustodyRecordDto(Guid.Empty, ToEmployeeId: employees[1].Id)));
        Assert.False(transferLost.Succeeded);
        Assert.True(transferLost.Errors.ContainsKey("status"));

        var issueLost = UseWorkflow(provider, workflow => workflow.CreateCustodyRecord(new CreateInventoryCustodyRecordDto(
            employees[1].Id,
            item.Id,
            WarehouseId: null,
            Quantity: 1,
            Comment: "Lost item must not be reissued")));
        Assert.False(issueLost.Succeeded);
        Assert.True(issueLost.Errors.ContainsKey("itemId"));

        var writeOffItem = CreateItem(provider);
        var writeOffRecord = UseWorkflow(provider, workflow => workflow.CreateCustodyRecord(new CreateInventoryCustodyRecordDto(
            employees[0].Id,
            writeOffItem.Id,
            WarehouseId: null,
            Quantity: 1,
            Comment: "Write off scenario")));
        Assert.True(writeOffRecord.Succeeded);
        Assert.NotNull(writeOffRecord.Value);

        var writtenOff = UseWorkflow(provider, workflow => workflow.UpdateCustodyRecordStatus(
            writeOffRecord.Value!.Id,
            new UpdateInventoryStatusDto("written_off", "Written off")));
        Assert.True(writtenOff.Succeeded);
        Assert.Equal("written_off", writtenOff.Value!.Status);

        var reissueWrittenOff = UseWorkflow(provider, workflow => workflow.CreateCustodyRecord(new CreateInventoryCustodyRecordDto(
            employees[1].Id,
            writeOffItem.Id,
            WarehouseId: null,
            Quantity: 1,
            Comment: "Written off item must not be reissued")));
        Assert.False(reissueWrittenOff.Succeeded);
        Assert.True(reissueWrittenOff.Errors.ContainsKey("itemId"));
    }

    private static ServiceProvider BuildProvider(string connectionString)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Patrol360"] = connectionString,
                ["Patrol360:SeedDemoData"] = "true",
            })
            .Build();

        services.AddPatrolInfrastructure(configuration);
        services.AddSingleton<IConfiguration>(configuration);

        return services.BuildServiceProvider();
    }

    private static InventoryItemDto CreateItem(ServiceProvider provider)
    {
        var item = UseCommand(provider, command => command.CreateItem(new UpsertInventoryItemDto(
            $"Рация для передачи {Guid.NewGuid():N}",
            Sku: $"TR-{Guid.NewGuid():N}"[..16],
            ItemKind: "custody",
            DefaultUnitPriceMinor: 10_000,
            TrackingType: "quantity",
            Comment: "Created by custody transfer integration test")));

        Assert.True(item.Succeeded);
        Assert.NotNull(item.Value);
        return item.Value!;
    }

    private static T UseWorkflow<T>(ServiceProvider provider, Func<IInventoryWorkflowService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IInventoryWorkflowService>());
    }

    private static T UseCommand<T>(ServiceProvider provider, Func<IInventoryCatalogCommandService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IInventoryCatalogCommandService>());
    }
}

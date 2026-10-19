using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Xunit.Abstractions;

namespace Patrol360.Infrastructure.Tests;

public sealed partial class PpeIssueDocumentDbTests
{
    [DbIntegrationFact]
    public async Task BlankRequirementBlocksReadinessAndManualRenameRevokesApproval()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        fixture.Row.NormItemName = ""; context.SaveChanges();
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        Assert.Contains(service.GetPpeNormSet(fixture.Norm.Id).Value!.NormSet.Readiness!.Blockers, blocker => blocker.RowId == fixture.Row.Id && blocker.Code == "rules");
        var saved = service.SetPpeNormRowRules(fixture.Row.Id, new PpeNormRowRulesDto(fixture.Norm.Version, fixture.Row.UnitSymbol,
            fixture.Row.PeriodMonths, fixture.Row.LifeMonths, null, "", NormItemName: "Требование из проверенного документа"), "reviewer");
        Assert.True(saved.Succeeded);
        Assert.All(fixture.Row.Mappings, mapping => Assert.False(mapping.IsApproved));
        Assert.False(saved.Value!.Readiness!.IsReady);
    }
    [DbIntegrationFact]
    public async Task ConcurrentCreationWithSameClientIdProducesOneDocument()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var setup = CreateContext(database.ConnectionString);
        var fixture = Seed(setup);
        var request = Request(fixture, Today) with { ClientDocumentId = Guid.NewGuid() };
        InventoryCommandResult<PpeIssueDocumentDto> Save()
        {
            using var db = CreateContext(database.ConnectionString);
            return new EfInventoryWorkflowService(db, new FixedClock(Today)).SaveIssueDocument(null, request, "owner");
        }
        var results = await Task.WhenAll(Task.Run(Save), Task.Run(Save));
        Assert.All(results, result => Assert.True(result.Succeeded, string.Join("; ", result.Errors.Values.SelectMany(x => x))));
        Assert.All(results, result => Assert.Equal(request.ClientDocumentId, result.Value!.Id));
        Assert.Single(setup.Set<Patrol360.Infrastructure.Persistence.Entities.PpeIssueDocumentEntity>().AsNoTracking());
    }
    [DbIntegrationFact]
    public async Task LostCreationResponseReplaysSameDocumentAndRejectsAnotherOwnerOrScope()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var request = Request(fixture, Today) with { ClientDocumentId = Guid.NewGuid() };
        var first = service.SaveIssueDocument(null, request, "owner");
        context.ChangeTracker.Clear();
        var replay = service.SaveIssueDocument(null, request with { Basis = "Ignored retry content" }, "owner");
        Assert.True(first.Succeeded); Assert.True(replay.Succeeded);
        Assert.Equal(request.ClientDocumentId, replay.Value!.Id);
        Assert.Equal(first.Value!.Version, replay.Value.Version);
        Assert.Equal(first.Value.Content.Basis, replay.Value.Content.Basis);
        Assert.Single(context.Set<Patrol360.Infrastructure.Persistence.Entities.PpeIssueDocumentEntity>());
        Assert.Contains("conflict", service.SaveIssueDocument(null, request, "another-owner").Errors.Keys);
        Assert.Contains("conflict", service.SaveIssueDocument(null, request with { EmployeeId = Guid.NewGuid() }, "owner").Errors.Keys);
        Assert.Contains("conflict", service.SaveIssueDocument(null, request with { NormSetId = Guid.NewGuid() }, "owner").Errors.Keys);
    }

    [DbIntegrationFact]
    public async Task ReadinessRejectsUnapprovedOrdinaryRequirementAndAcceptsExplicitAlternative()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var missing = new Patrol360.Infrastructure.Persistence.Entities.InventoryPpeNormRowEntity
        {
            Id = Guid.NewGuid(), NormSetId = fixture.Norm.Id, RowType = "item", NormItemName = "Неподобранное требование",
            SortOrder = 1, NormPoint = "Тестовый пункт 2", Quantity = 1, UnitSymbol = "шт.", PeriodMonths = 12, RequirementKey = Guid.NewGuid()
        };
        fixture.Norm.Rows.Add(missing); context.Add(missing); context.SaveChanges();
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var readiness = service.GetPpeNormSet(fixture.Norm.Id).Value!.NormSet.Readiness!;
        Assert.False(readiness.IsReady); Assert.Equal(2, readiness.RequiredCount);
        Assert.Contains(readiness.Blockers, x => x.RowId == missing.Id && x.Code == "mapping");
        fixture.Row.AlternativeGroup = missing.AlternativeGroup = "explicit-alternative"; missing.Quantity = fixture.Row.Quantity; context.SaveChanges();
        readiness = service.GetPpeNormSet(fixture.Norm.Id).Value!.NormSet.Readiness!;
        Assert.True(readiness.IsReady); Assert.Equal(1, readiness.RequiredCount); Assert.Equal(1, readiness.ApprovedCount);
        missing.Quantity = 3; context.SaveChanges();
        Assert.Contains(service.GetPpeNormSet(fixture.Norm.Id).Value!.NormSet.Readiness!.Blockers, x => x.Code == "alternatives");
    }
}

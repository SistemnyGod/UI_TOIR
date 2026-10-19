using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

public sealed partial class PpeIssueDocumentDbTests
{
    [DbIntegrationFact]
    public async Task LegacyAddRejectsOverNormAndMissingSizeWithoutCreatingFacts()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context, normQuantity: 1);
        var card = AddLegacyDraft(context, fixture);
        var cardRow = context.InventoryPpeCardNormRows.Single(x => x.CardId == card.Id);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var request = new UpsertInventoryPpeCardLineDto(fixture.Item.Id, null, 999, 1_000, "issued",
            IssuedAt: new FixedClock(Today).StartOfDayUtc(Today), CardNormRowId: cardRow.Id);
        var rejected = service.AddPpeCardLine(card.Id, request);
        Assert.False(rejected.Succeeded);
        Assert.Contains("exception_reason", rejected.Errors.Keys);
        fixture.Item.TrackingType = "size_quantity"; context.SaveChanges();
        var noSize = service.AddPpeCardLine(card.Id, request with { Quantity = 1 });
        Assert.False(noSize.Succeeded); Assert.Contains("size", noSize.Errors.Keys);
        Assert.Empty(context.InventoryPpeCardLines);
        var issued = service.AddPpeCardLine(card.Id, request with { Quantity = 1, SizeText = "M" });
        Assert.True(issued.Succeeded);
        var fact = Assert.Single(context.InventoryPpeCardLines);
        Assert.Equal(fixture.Row.RequirementKey, fact.RequirementKey);
        Assert.Equal(Today, fact.IssueDate);
        Assert.Empty(context.InventoryStockMoves);
    }

    [DbIntegrationFact]
    public async Task LegacyStatusTransitionCannotIssueAnOversizedDraft()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context, normQuantity: 1); var card = AddLegacyDraft(context, fixture);
        var cardRow = context.InventoryPpeCardNormRows.Single(x => x.CardId == card.Id);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var draft = service.AddPpeCardLine(card.Id, new(fixture.Item.Id, null, 999, 1_000, "not_issued", CardNormRowId: cardRow.Id));
        Assert.True(draft.Succeeded);
        // Supply a test date on the draft, as old clients do before the status operation.
        context.InventoryPpeCardLines.Single().IssuedAt = new FixedClock(Today).StartOfDayUtc(Today); context.SaveChanges();
        var issue = service.UpdatePpeCardLineStatus(card.Id, draft.Value!.Id, new("issued"));
        Assert.False(issue.Succeeded); Assert.Contains("exception_reason", issue.Errors.Keys);
        Assert.Equal("not_issued", context.InventoryPpeCardLines.Single().Status);
        Assert.Null(context.InventoryPpeCardLines.Single().RequirementKey);
    }

    [DbIntegrationFact]
    public async Task LegacyReturnedIssueCountsForBothOldApiAndNewDocuments()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context, normQuantity: 1); var card = AddLegacyDraft(context, fixture);
        var cardRow = context.InventoryPpeCardNormRows.Single(x => x.CardId == card.Id);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var request = new CreateInventoryPpeIssueDto(cardRow.Id, fixture.Item.Id, new FixedClock(Today).StartOfDayUtc(Today), 1, 1_000, "personal");
        var first = service.CreatePpeIssue(card.Id, request); Assert.True(first.Succeeded);
        Assert.True(service.ApplyPpeLineAction(card.Id, first.Value!.Id, new("returned", request.IssuedAt, Quantity: 1)).Succeeded);
        var repeated = service.CreatePpeIssue(card.Id, request);
        Assert.False(repeated.Succeeded); Assert.Contains("exception_reason", repeated.Errors.Keys);
        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester");
        Assert.True(saved.Succeeded);
        Assert.Equal(1m, Assert.Single(saved.Value!.Validation.Entitlements).AlreadyIssuedQuantity);
        Assert.Single(context.InventoryPpeCardLines); Assert.Empty(context.InventoryStockMoves);
    }

    [DbIntegrationFact]
    public async Task LegacyBatchCombinesAlternativeRequirementsBeforeWriting()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context, normQuantity: 1);
        fixture.Row.AlternativeGroup = "shared";
        var secondRow = new InventoryPpeNormRowEntity {
            Id = Guid.NewGuid(), NormSetId = fixture.Norm.Id, RowType = "item", SortOrder = 1, NormItemName = "Альтернатива",
            NormPoint = "п. 2", Quantity = 1, UnitSymbol = fixture.Row.UnitSymbol, PeriodMonths = 12,
            IssuePeriodText = fixture.Row.IssuePeriodText, RequirementKey = Guid.NewGuid(), AlternativeGroup = "shared"
        };
        secondRow.Mappings.Add(new InventoryPpeNormCatalogMappingEntity {
            Id = Guid.NewGuid(), NormRowId = secondRow.Id, ItemId = fixture.Item.Id, IsApproved = true, IsDefault = true,
            NormUnitsPerItem = 1, ApprovedBy = "ОТ", ApprovalEvidence = "synthetic approval", CreatedAt = DateTimeOffset.UtcNow
        });
        fixture.Norm.Rows.Add(secondRow); context.Add(secondRow); context.SaveChanges();
        var card = AddLegacyDraft(context, fixture);
        var firstCardRow = context.InventoryPpeCardNormRows.Single(x => x.CardId == card.Id);
        var secondCardRow = new InventoryPpeCardNormRowEntity {
            Id = Guid.NewGuid(), CardId = card.Id, SourceNormRowId = secondRow.Id, RowType = "item", SortOrder = 1,
            NormItemName = secondRow.NormItemName, NormPoint = secondRow.NormPoint, Quantity = 1,
            IssuePeriodText = secondRow.IssuePeriodText, MappedItemId = fixture.Item.Id
        };
        context.Add(secondCardRow); context.SaveChanges();
        var date = new FixedClock(Today).StartOfDayUtc(Today);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var issued = service.CreatePpeIssueBatch(card.Id, new(card.Version, [
            new(firstCardRow.Id, fixture.Item.Id, date, 1, 1_000, "personal"),
            new(secondCardRow.Id, fixture.Item.Id, date, 1, 1_000, "personal")
        ]));
        Assert.False(issued.Succeeded); Assert.Contains("exception_reason", issued.Errors.Keys);
        Assert.Empty(context.InventoryPpeCardLines);
    }

    [DbIntegrationFact]
    public async Task LegacyIssueUsesApprovedConversionAndCannotChangeItsNormOrDate()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context, normQuantity: 2);
        var mapping = fixture.Row.Mappings.Single(); mapping.NormUnitsPerItem = 2; mapping.DefaultUnitPriceMinor = 2_000;
        context.SaveChanges();
        var card = AddLegacyDraft(context, fixture); var cardRow = context.InventoryPpeCardNormRows.Single(x => x.CardId == card.Id);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var request = new UpsertInventoryPpeCardLineDto(fixture.Item.Id, null, 1, Status: "issued",
            IssuedAt: new FixedClock(Today).StartOfDayUtc(Today), CardNormRowId: cardRow.Id);
        Assert.False(service.AddPpeCardLine(card.Id, request with { IssueMethod = "invalid" }).Succeeded);
        var first = service.AddPpeCardLine(card.Id, request); Assert.True(first.Succeeded);
        Assert.Equal(2_000, first.Value!.UnitPriceMinor);
        Assert.Equal(2m, context.InventoryPpeCardLines.Single().NormUnitsPerItem);
        Assert.False(service.AddPpeCardLine(card.Id, request).Succeeded);
        var changedDate = service.UpdatePpeCardLine(card.Id, first.Value.Id, request with { IssuedAt = request.IssuedAt!.Value.AddDays(-1) });
        Assert.False(changedDate.Succeeded);
        var changedNorm = service.UpdatePpeCardLine(card.Id, first.Value.Id, request with { CardNormRowId = Guid.NewGuid() });
        Assert.False(changedNorm.Succeeded);
        Assert.True(service.UpdatePpeCardLineStatus(card.Id, first.Value.Id, new("lost")).Succeeded);
        Assert.False(service.UpdatePpeCardLine(card.Id, first.Value.Id, request with {
            Status = "lost", IssuedAt = request.IssuedAt!.Value.AddYears(-2)
        }).Succeeded);
        Assert.False(service.UpdatePpeCardLine(card.Id, first.Value.Id, request with {
            Status = "lost", CardNormRowId = Guid.NewGuid()
        }).Succeeded);
        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester");
        Assert.Equal(2m, Assert.Single(saved.Value!.Validation.Entitlements).AlreadyIssuedQuantity);
        Assert.Single(context.InventoryPpeCardLines);
    }

    [DbIntegrationFact]
    public async Task LegacyPlanningDatesDoNotConsumeAnIssuanceEntitlement()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context, normQuantity: 1); var card = AddLegacyDraft(context, fixture);
        var cardRow = context.InventoryPpeCardNormRows.Single(x => x.CardId == card.Id);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var request = new UpsertInventoryPpeCardLineDto(fixture.Item.Id, null, 1, 1_000, "not_issued", CardNormRowId: cardRow.Id);
        var draft = service.AddPpeCardLine(card.Id, request); Assert.True(draft.Succeeded);
        var dated = request with { IssuedAt = new FixedClock(Today).StartOfDayUtc(Today) };
        Assert.True(service.UpdatePpeCardLine(card.Id, draft.Value!.Id, dated).Succeeded);
        Assert.True(service.AddPpeCardLine(card.Id, dated with { Status = "issued" }).Succeeded);
        Assert.Single(context.InventoryPpeCardLines, x => x.Status == "issued");
    }

    [DbIntegrationFact]
    public async Task ConcurrentLegacyFactsCannotConsumeOneEntitlementTwice()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var setup = CreateContext(database.ConnectionString);
        var fixture = Seed(setup, normQuantity: 1); var card = AddLegacyDraft(setup, fixture);
        var cardRow = setup.InventoryPpeCardNormRows.Single(x => x.CardId == card.Id);
        var request = new UpsertInventoryPpeCardLineDto(fixture.Item.Id, null, 1, 1_000, "issued",
            IssuedAt: new FixedClock(Today).StartOfDayUtc(Today), CardNormRowId: cardRow.Id);
        InventoryCommandResult<InventoryPpeCardLineDto> Issue() {
            using var context = CreateContext(database.ConnectionString);
            return new EfInventoryWorkflowService(context, new FixedClock(Today)).AddPpeCardLine(card.Id, request);
        }
        var results = await Task.WhenAll(Task.Run(Issue), Task.Run(Issue));
        Assert.Single(results, x => x.Succeeded);
        Assert.Single(setup.InventoryPpeCardLines.AsNoTracking());
        Assert.Empty(setup.InventoryStockMoves);
    }
}

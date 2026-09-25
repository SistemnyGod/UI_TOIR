using System.Text;
using System.Text.Json;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

public sealed partial class PpeIssueDocumentDbTests
{
    [DbIntegrationFact]
    public async Task JournalPagesBeyond200FiltersSnapshotAndExportsEntireSelection()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester").Value!;
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        for (var i = 0; i < 230; i++) context.Set<PpeIssueDocumentEntity>().Add(new()
        {
            Id = Guid.NewGuid(), EmployeeId = fixture.Employee.Id, NormSetId = fixture.Norm.Id, Version = 1,
            Status = i % 2 == 0 ? "confirmed" : "draft", CreatedAt = DateTimeOffset.UtcNow.AddDays(-i - 1),
            ContentJson = JsonSerializer.Serialize(saved.Content with { DocumentDate = new DateOnly(2025, 1, 1).AddDays(i),
                Employee = saved.Content.Employee with { FullName = "=Сотрудник исторический", PersonnelNo = "HISTORY", Department = "Архивный цех" } }, options),
            ValidationJson = JsonSerializer.Serialize(saved.Validation, options), CreatedBy = "test"
        });
        context.SaveChanges();
        fixture.Employee.FullName = "Новое имя"; context.SaveChanges();
        var query = new PpeIssueJournalQuery(Query: "исторический", Department: "Архивный цех", From: new(2025, 1, 1), To: new(2025, 12, 31), Page: 3, PageSize: 100);
        var page = service.GetIssueJournal(query);
        Assert.Equal(230, page.Total); Assert.Equal(30, page.Items.Count); Assert.Equal(3, page.PageCount);
        Assert.Equal(115, page.Summary.Confirmed); Assert.Equal(115, page.Summary.Draft);
        var first = service.GetIssueJournal(query with { Page = 1 });
        Assert.Empty(first.Items.Select(x => x.Id).Intersect(page.Items.Select(x => x.Id)));
        Assert.Equal(115, service.GetIssueJournal(query with { Status = "draft" }).Total);
        Assert.Equal(0, service.GetIssueJournal(query with { EmployeeId = Guid.NewGuid() }).Total);
        Assert.Equal(0, service.GetIssueJournal(query with { EmployeeId = Guid.Empty }).Total);
        Assert.Equal(230, service.GetIssueJournal(query with { EmployeeId = fixture.Employee.Id }).Total);
        Assert.Equal(0, service.GetIssueJournal(query with { Query = "%" }).Total);
        var csv = Encoding.UTF8.GetString(service.ExportIssueJournal(query).Content);
        Assert.Equal(230, csv.Split('\n').Count(x => x.Contains("HISTORY")));
        Assert.Contains("'\u003dСотрудник", csv);
    }

    [DbIntegrationFact]
    public async Task JournalOverdueUsesRemainingQuantityAndExcludesWrittenOff()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var saved = service.SaveIssueDocument(null, Request(fixture, Today), "tester").Value!;
        Assert.True(service.ConfirmIssueDocument(saved.Id, new(saved.Version, "journal-overdue"), "tester").Succeeded);
        var line = context.InventoryPpeCardLines.Single();
        line.DueAt = DateTimeOffset.UtcNow.AddDays(-1); line.Quantity = 2; context.SaveChanges();
        Assert.Equal(1, service.GetIssueJournal(new(Status: "overdue")).Total);
        line.Status = "returned"; line.ReturnedQuantity = 1; context.SaveChanges();
        Assert.Equal(1, service.GetIssueJournal(new(Status: "overdue")).Total);
        line.ReturnedQuantity = 2; context.SaveChanges();
        Assert.Equal(0, service.GetIssueJournal(new(Status: "overdue")).Total);
        line.Status = "written_off"; line.ReturnedQuantity = 0; context.SaveChanges();
        Assert.Equal(0, service.GetIssueJournal(new(Status: "overdue")).Total);
    }
}

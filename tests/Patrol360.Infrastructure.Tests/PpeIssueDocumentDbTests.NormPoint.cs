using Patrol360.Infrastructure.Persistence;
using Xunit;
using System.IO.Compression;
using Patrol360.Infrastructure.Persistence.Inventory;

namespace Patrol360.Infrastructure.Tests;
public sealed partial class PpeIssueDocumentDbTests
{
    [DbIntegrationFact]
    public async Task EditedNormPointSurvivesReopenConfirmationAndDoesNotChangeCatalog()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        await using var context = CreateContext(database.ConnectionString);
        var fixture = Seed(context);
        var service = new EfInventoryWorkflowService(context, new FixedClock(Today));
        var request = Request(fixture, Today);
        const string point = "п. 4560 Приложения № 1";
        var original = service.SaveIssueDocument(null, request, "tester");
        var sourcePoint = original.Value!.Content.NormRows.Single(row => row.Id == request.Lines[0].NormRowId).NormPoint;
        request = request with { Lines = [request.Lines[0] with { NormPoint = point }] };
        var saved = service.SaveIssueDocument(null, request, "tester");
        Assert.True(saved.Succeeded);
        context.ChangeTracker.Clear();
        var reopened = service.GetIssueDocument(saved.Value!.Id).Value!;
        Assert.Equal(point, Assert.Single(reopened.Content.Lines).NormPoint);
        Assert.Equal(point, reopened.Content.NormRows.Single(row => row.Id == request.Lines[0].NormRowId).NormPoint);
        using var archive = new ZipArchive(new MemoryStream(PpeIssueDocumentDocxBuilder.Build(reopened, "norms")));
        using var reader = new StreamReader(archive.GetEntry("word/document.xml")!.Open());
        Assert.Contains(point, reader.ReadToEnd());
        var confirmed = service.ConfirmIssueDocument(saved.Value.Id, new(saved.Value.Version, "edited-norm-point"), "tester");
        Assert.True(confirmed.Succeeded);
        Assert.Equal(point, Assert.Single(context.InventoryPpeCardLines).NormPoint);
        var untouched = service.SaveIssueDocument(null, Request(fixture, Today), "tester");
        Assert.Equal(sourcePoint, untouched.Value!.Content.NormRows.Single(row => row.Id == request.Lines[0].NormRowId).NormPoint);
        var invalid = service.SaveIssueDocument(null, request with { Lines = [request.Lines[0] with { NormPoint = new string('x', 601) }] }, "tester");
        Assert.False(invalid.Succeeded);
    }
}

using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Inventory;

namespace Patrol360.Infrastructure.Tests;

public sealed class GotenbergFactAttribute : FactAttribute
{
    public GotenbergFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PPE_TEST_GOTENBERG_URL"))
            || string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PPE_TEST_PRINT_OUTPUT")))
        {
            Skip = "Set PPE_TEST_GOTENBERG_URL and PPE_TEST_PRINT_OUTPUT to run the real Gotenberg test.";
        }
    }
}

public sealed class PrintOutputFactAttribute : FactAttribute
{
    public PrintOutputFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PPE_TEST_PRINT_OUTPUT")))
        {
            Skip = "Set PPE_TEST_PRINT_OUTPUT to write synthetic DOCX fixtures.";
        }
    }
}

public sealed class PpeIssueDocumentPrintServiceTests
{
    [Fact]
    public async Task NormsDocxGroupsSnapshotNormsAndKeepsActualQuantityAndUnknownPriceVisible()
    {
        var document = Fixture(lines: 2);
        document = document with
        {
            Content = document.Content with
            {
                Lines = [
                    document.Content.Lines[0] with { Quantity = 3, UnitPriceMinor = 12_345, TotalMinor = 37_035 },
                    document.Content.Lines[1] with { Quantity = 2, UnitPriceMinor = null, TotalMinor = null }
                ]
            }
        };
        using var runtime = new PpeIssueDocumentPrintRuntime();
        var printer = new PpeIssueDocumentPrintService(new Stub(document), new NeverUsedHttpClientFactory(), runtime);

        var result = await printer.PrintAsync(document.Id, "norms", "docx", CancellationToken.None);

        Assert.True(result.Succeeded);
        var xml = Xml(result.Value!.Content);
        Assert.Contains("Группа защиты головы", xml, StringComparison.Ordinal);
        Assert.Contains("Каска защитная", xml, StringComparison.Ordinal);
        Assert.Contains("Каска СОМЗ ВИЗИОН", xml, StringComparison.Ordinal);
        Assert.Contains("дата выдачи 02.03.2026", xml, StringComparison.Ordinal);
        Assert.DoesNotContain("Невыбранная норма", xml, StringComparison.Ordinal);
        Assert.DoesNotContain("Невыбранная группа", xml, StringComparison.Ordinal);
        Assert.DoesNotContain("99 шт.", xml, StringComparison.Ordinal);
        Assert.Contains("3 шт.", xml, StringComparison.Ordinal);
        Assert.Contains("не указана", xml, StringComparison.Ordinal);
        Assert.Contains("Размер одежды: 52-54", xml, StringComparison.Ordinal);
        Assert.Contains("ПЛАНОВЫЙ ДОКУМЕНТ", HeaderXml(result.Value.Content), StringComparison.Ordinal);
        Assert.DoesNotContain("1645", xml, StringComparison.Ordinal);
        Assert.Single(XDocument.Parse(xml).Descendants(W("tbl")).Last().Descendants(W("tblHeader")));
    }

    [Fact]
    public async Task SignatureDocxKeepsDateThenOriginalLineOrderAndRepeatsHeadersForLongCyrillicList()
    {
        var document = Fixture(lines: 54);
        using var runtime = new PpeIssueDocumentPrintRuntime();
        var printer = new PpeIssueDocumentPrintService(new Stub(document), new NeverUsedHttpClientFactory(), runtime);

        var result = await printer.PrintAsync(document.Id, "signature", "docx", CancellationToken.None);

        Assert.True(result.Succeeded);
        var xml = XDocument.Parse(Xml(result.Value!.Content));
        var table = xml.Descendants(W("tbl")).Last();
        Assert.Equal(57, table.Descendants(W("tr")).Count());
        Assert.Equal(10, table.Descendants(W("tr")).ElementAt(3).Elements(W("tc")).Count());
        Assert.True(table.Descendants(W("tblHeader")).Count() >= 3);
        var text = string.Concat(table.Descendants(W("t")).Select(x => x.Value));
        Assert.Contains("Длинное кириллическое наименование СИЗ для проверки переноса строк", text, StringComparison.Ordinal);
        Assert.True(text.IndexOf("Строка 1", StringComparison.Ordinal) < text.IndexOf("Каска СОМЗ ВИЗИОН", StringComparison.Ordinal));
    }

    [Fact]
    public async Task NormsDocxUsesComputedValidationTotalForFiftyFourSelectedItems()
    {
        var document = Fixture(lines: 54);
        using var runtime = new PpeIssueDocumentPrintRuntime();
        var printer = new PpeIssueDocumentPrintService(new Stub(document), new NeverUsedHttpClientFactory(), runtime);

        var result = await printer.PrintAsync(document.Id, "norms", "docx", CancellationToken.None);

        Assert.True(result.Succeeded);
        var xml = Xml(result.Value!.Content).Replace('\u00a0', ' ');
        Assert.Contains("Итого: 5 400,00 руб.", xml, StringComparison.Ordinal);
        Assert.DoesNotContain("Итого: не рассчитано", xml, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PdfUsesTheSameDocxSourceAndReturnsConverterBytes()
    {
        var document = Fixture(lines: 1);
        using var runtime = new PpeIssueDocumentPrintRuntime();
        var printer = new PpeIssueDocumentPrintService(new Stub(document with { Content = document.Content with { Employee = document.Content.Employee with { PersonnelNo = "T/42\r\nunsafe" } } }), new PdfHttpClientFactory(new ResponseHandler("%PDF-1.7\nfixture")), runtime);

        var result = await printer.PrintAsync(document.Id, "norms", "pdf", CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal("application/pdf", result.Value!.ContentType);
        Assert.StartsWith("%PDF", Encoding.ASCII.GetString(result.Value.Content), StringComparison.Ordinal);
        Assert.DoesNotContain("/", result.Value.DownloadName, StringComparison.Ordinal);
        Assert.DoesNotContain("\r", result.Value.DownloadName, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PdfRejectsMalformedConverterResponse()
    {
        var document = Fixture(lines: 1);
        using var runtime = new PpeIssueDocumentPrintRuntime();
        var printer = new PpeIssueDocumentPrintService(new Stub(document), new PdfHttpClientFactory(new ResponseHandler("not a PDF")), runtime);

        var result = await printer.PrintAsync(document.Id, "norms", "pdf", CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Contains("pdf.retryable", result.Errors.Keys);
    }

    [Fact]
    public async Task PdfRejectsOversizedConverterResponseBeforeReadingIt()
    {
        var document = Fixture(lines: 1);
        using var runtime = new PpeIssueDocumentPrintRuntime();
        var printer = new PpeIssueDocumentPrintService(new Stub(document), new PdfHttpClientFactory(new OversizedPdfHandler()), runtime);

        var result = await printer.PrintAsync(document.Id, "norms", "pdf", CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Contains("pdf.retryable", result.Errors.Keys);
    }

    [Fact]
    public async Task PdfConversionGateIsSharedAcrossScopedPrintServices()
    {
        var document = Fixture(lines: 1);
        using var runtime = new PpeIssueDocumentPrintRuntime();
        var blockers = Enumerable.Range(0, 4).Select(_ => new BlockingPdfHandler()).ToList();
        var active = blockers.Select(handler => new PpeIssueDocumentPrintService(new Stub(document), new PdfHttpClientFactory(handler), runtime)).ToList();
        var activeTasks = active.Select(printer => printer.PrintAsync(document.Id, "norms", "pdf", CancellationToken.None)).ToList();
        await Task.WhenAll(blockers.Select(handler => handler.Started.Task.WaitAsync(TimeSpan.FromSeconds(5))));

        var queuedResult = await new PpeIssueDocumentPrintService(new Stub(document), new PdfHttpClientFactory(new ResponseHandler("%PDF-1.7\nfixture")), runtime)
            .PrintAsync(document.Id, "signature", "pdf", CancellationToken.None);
        foreach (var handler in blockers) handler.Release.TrySetResult();

        Assert.All(await Task.WhenAll(activeTasks), result => Assert.True(result.Succeeded));
        Assert.False(queuedResult.Succeeded);
        Assert.Contains("pdf.retryable", queuedResult.Errors.Keys);
    }

    [Fact]
    public async Task CancelledDocumentCannotBePrinted()
    {
        var document = Fixture(lines: 1) with { Status = "cancelled" };
        using var runtime = new PpeIssueDocumentPrintRuntime();
        var printer = new PpeIssueDocumentPrintService(new Stub(document), new NeverUsedHttpClientFactory(), runtime);

        var result = await printer.PrintAsync(document.Id, "norms", "docx", CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Contains("status", result.Errors.Keys);
    }

    [GotenbergFact]
    public async Task RealGotenbergGeneratesLongSyntheticDocxAndPdfWhenExplicitlyEnabled()
    {
        var baseUrl = Environment.GetEnvironmentVariable("PPE_TEST_GOTENBERG_URL")
            ?? throw new InvalidOperationException("PPE_TEST_GOTENBERG_URL is required.");
        var outputDirectory = Environment.GetEnvironmentVariable("PPE_TEST_PRINT_OUTPUT")
            ?? throw new InvalidOperationException("PPE_TEST_PRINT_OUTPUT is required.");

        var document = Fixture(lines: 54);
        using var runtime = new PpeIssueDocumentPrintRuntime();
        var printer = new PpeIssueDocumentPrintService(new Stub(document), new RealGotenbergHttpClientFactory(baseUrl), runtime);

        var normsDocx = await printer.PrintAsync(document.Id, "norms", "docx", CancellationToken.None);
        var signatureDocx = await printer.PrintAsync(document.Id, "signature", "docx", CancellationToken.None);
        var normsPdf = await printer.PrintAsync(document.Id, "norms", "pdf", CancellationToken.None);
        var signaturePdf = await printer.PrintAsync(document.Id, "signature", "pdf", CancellationToken.None);

        Assert.True(normsDocx.Succeeded);
        Assert.True(signatureDocx.Succeeded);
        Assert.True(normsPdf.Succeeded);
        Assert.True(signaturePdf.Succeeded);
        Directory.CreateDirectory(outputDirectory);
        WriteOutput(outputDirectory, "ppe-issue-norms.docx", normsDocx.Value!.Content);
        WriteOutput(outputDirectory, "ppe-issue-signature.docx", signatureDocx.Value!.Content);
        WriteOutput(outputDirectory, "ppe-issue-norms.pdf", normsPdf.Value!.Content);
        WriteOutput(outputDirectory, "ppe-issue-signature.pdf", signaturePdf.Value!.Content);
    }

    [PrintOutputFact]
    public async Task SyntheticLongDocxFixturesAreWrittenWhenOutputIsConfigured()
    {
        var outputDirectory = Environment.GetEnvironmentVariable("PPE_TEST_PRINT_OUTPUT")
            ?? throw new InvalidOperationException("PPE_TEST_PRINT_OUTPUT is required.");

        var document = Fixture(lines: 54);
        using var runtime = new PpeIssueDocumentPrintRuntime();
        var printer = new PpeIssueDocumentPrintService(new Stub(document), new NeverUsedHttpClientFactory(), runtime);
        var norms = await printer.PrintAsync(document.Id, "norms", "docx", CancellationToken.None);
        var signature = await printer.PrintAsync(document.Id, "signature", "docx", CancellationToken.None);

        Assert.True(norms.Succeeded);
        Assert.True(signature.Succeeded);
        Directory.CreateDirectory(outputDirectory);
        WriteOutput(outputDirectory, "ppe-issue-norms.docx", norms.Value!.Content);
        WriteOutput(outputDirectory, "ppe-issue-signature.docx", signature.Value!.Content);
    }

    private static PpeIssueDocumentDto Fixture(int lines)
    {
        var employee = new PpeDocumentEmployeeDto(Guid.NewGuid(), "Тестовый сотрудник", "TEST-42", "Тестовый участок", "Тестовая должность", new InventoryPpeEmployeeDetailsDto("муж.", "182", "52-54", "43", "58", "M", "10"));
        var group = new PpeDocumentNormDto(Guid.NewGuid(), null, "group", 10, "Группа защиты головы", "", 0, "", "", "", null, null, Guid.NewGuid(), "");
        var norm = new PpeDocumentNormDto(Guid.NewGuid(), group.Id, "item", 20, "Каска защитная", "п. 4.1", 1, "шт.", "1 шт. на 2 года", "2 года", 24, 24, Guid.NewGuid(), "");
        var unselectedGroup = new PpeDocumentNormDto(Guid.NewGuid(), null, "group", 30, "Невыбранная группа", "", 0, "", "", "", null, null, Guid.NewGuid(), "");
        var unselectedNorm = new PpeDocumentNormDto(Guid.NewGuid(), unselectedGroup.Id, "item", 40, "Невыбранная норма", "п. 9.9", 99, "шт.", "99 шт.", "", null, null, Guid.NewGuid(), "");
        var records = Enumerable.Range(0, lines).Select(index => new PpeDocumentLineDto(
            Guid.NewGuid(), norm.Id, Guid.NewGuid(), index == 0 ? new DateOnly(2026, 3, 2) : new DateOnly(2026, 3, 1), 1, 10_000, "52-54", "", true,
            index == 0 ? "Каска СОМЗ ВИЗИОН" : $"Длинное кириллическое наименование СИЗ для проверки переноса строк Строка {index}", "шт.", "СОМЗ / VISION / арт. 777", 1, 10_000)).ToList();
        return new PpeIssueDocumentDto(Guid.NewGuid(), 7, "draft", DateTimeOffset.UtcNow, null,
            new PpeDocumentContentDto(employee, Guid.NewGuid(), 3, "Тестовая редакция", "Тестовые нормы", new DateOnly(2026, 3, 1), "Тестовый ответственный", "Тестовое основание", [group, norm, unselectedGroup, unselectedNorm], records),
            new PpeDocumentValidationDto([], [], [], checked(lines * 10_000L)));
    }

    private static string Xml(byte[] docx) => ReadPart(docx, "word/document.xml");
    private static string HeaderXml(byte[] docx) => ReadPart(docx, "word/header1.xml");
    private static string ReadPart(byte[] docx, string path)
    {
        using var archive = new ZipArchive(new MemoryStream(docx), ZipArchiveMode.Read);
        using var reader = new StreamReader(archive.GetEntry(path)!.Open(), Encoding.UTF8);
        return reader.ReadToEnd();
    }
    private static XName W(string local) => XName.Get(local, "http://schemas.openxmlformats.org/wordprocessingml/2006/main");
    private static void WriteOutput(string directory, string name, byte[] content) => File.WriteAllBytes(Path.Combine(directory, name), content);

    private sealed class Stub(PpeIssueDocumentDto document) : IPpeIssueDocumentService
    {
        public InventoryCommandResult<PpeIssueDocumentDto> GetIssueDocument(Guid id) => id == document.Id
            ? new(document, new Dictionary<string, string[]>())
            : new(null, new Dictionary<string, string[]> { ["id"] = ["Not found"] });
        public IReadOnlyList<PpeIssueDocumentSummaryDto> GetIssueDocuments(Guid? employeeId) => [];
        public IReadOnlyList<InventoryPpeNormSetDto> GetApplicablePpeNorms(Guid employeeId, DateOnly date) => [];
        public InventoryCommandResult<PpeIssueDocumentDto> SaveIssueDocument(Guid? id, SavePpeIssueDocumentDto request, string actor) => throw new NotSupportedException();
        public InventoryCommandResult<PpeIssueDocumentDto> ValidateIssueDocument(Guid id) => throw new NotSupportedException();
        public InventoryCommandResult<PpeIssueDocumentDto> ConfirmIssueDocument(Guid id, ConfirmPpeIssueDocumentDto request, string actor) => throw new NotSupportedException();
        public InventoryCommandResult<PpeIssueDocumentDto> CancelIssueDocument(Guid id, CancelPpeIssueDocumentDto request, string actor) => throw new NotSupportedException();
        public InventoryCommandResult<InventoryPpeNormSetDto> ApprovePpeNormScope(Guid id, PpeNormApprovalDto request, string actor) => throw new NotSupportedException();
        public InventoryCommandResult<InventoryPpeNormSetDto> SetPpeNormRowRules(Guid rowId, PpeNormRowRulesDto request, string actor) => throw new NotSupportedException();
        public InventoryCommandResult<InventoryPpeNormMappingDto> ApprovePpeMapping(Guid rowId, PpeMappingApprovalDto request, string actor) => throw new NotSupportedException();
        public InventoryCommandResult<PpeLegacyDraftMigrationDto> MigratePpeLegacyDraft(Guid cardId, string actor) => throw new NotSupportedException();
    }

    private sealed class NeverUsedHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => throw new InvalidOperationException("DOCX must not contact Gotenberg.");
    }

    private sealed class PdfHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false) { BaseAddress = new Uri("http://gotenberg:3000/") };
    }

    private sealed class RealGotenbergHttpClientFactory(string baseUrl) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new() { BaseAddress = new Uri(baseUrl, UriKind.Absolute) };
    }

    private sealed class ResponseHandler(string response) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("/forms/libreoffice/convert", request.RequestUri!.AbsolutePath);
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(Encoding.ASCII.GetBytes(response))
            });
        }
    }

    private sealed class BlockingPdfHandler : HttpMessageHandler
    {
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Started.TrySetResult();
            await Release.Task.WaitAsync(cancellationToken);
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.7\nfixture"))
            };
        }
    }

    private sealed class OversizedPdfHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var content = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.7\nfixture"));
            content.Headers.ContentLength = 33L * 1024 * 1024;
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = content });
        }
    }
}

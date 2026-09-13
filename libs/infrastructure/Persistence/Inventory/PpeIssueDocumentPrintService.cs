
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence.Inventory;

public sealed class PpeIssueDocumentPrintService : IPpeIssueDocumentPrintService
{

    private readonly IPpeIssueDocumentService documentService;
    private readonly IHttpClientFactory httpClientFactory;
    private readonly PpeIssueDocumentPrintRuntime runtime;

    public PpeIssueDocumentPrintService(IPpeIssueDocumentService documentService, IHttpClientFactory httpClientFactory, PpeIssueDocumentPrintRuntime runtime)
    {
        this.documentService = documentService;
        this.httpClientFactory = httpClientFactory;
        this.runtime = runtime;
    }

    public async Task<InventoryCommandResult<InventoryGeneratedFileDto>> PrintAsync(Guid id, string type, string format, CancellationToken cancellationToken)
    {
        type = Normalize(type);
        format = Normalize(format);
        if (type is not ("norms" or "signature")) return Failure("type", "Поддерживаются варианты печати: norms или signature.");
        if (format is not ("docx" or "pdf")) return Failure("format", "Поддерживаются форматы: docx или pdf.");

        var loaded = documentService.GetIssueDocument(id);
        if (!loaded.Succeeded || loaded.Value is null) return new InventoryCommandResult<InventoryGeneratedFileDto>(null, loaded.Errors);
        var document = loaded.Value;
        if (string.Equals(document.Status, "cancelled", StringComparison.OrdinalIgnoreCase))
            return Failure("status", "Отмененный документ выдачи нельзя печатать.");
        var key = $"ppe-issue-print:{document.Id:N}:{document.Version}:{PpeIssueDocumentDocxBuilder.TemplateVersion}:{type}:{format}";
        if (runtime.TryGetValue(key, out InventoryGeneratedFileDto? cached) && cached is not null) return Success(Clone(cached));

        var docx = PpeIssueDocumentDocxBuilder.Build(document, type);
        var baseName = $"ppe-issue-{type}-{SafeFileToken(document.Content.Employee.PersonnelNo)}-{document.Id:N}";
        if (format == "docx")
        {
            var file = new InventoryGeneratedFileDto(baseName + ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx);
            Put(key, file);
            return Success(Clone(file));
        }

        var result = await new PpeDocxPdfConverter(httpClientFactory, runtime).ConvertAsync(
            new InventoryGeneratedFileDto(baseName + ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx), cancellationToken);
        if (result.Succeeded && result.Value is not null) Put(key, result.Value);
        return result;
    }

    private void Put(string key, InventoryGeneratedFileDto file) => runtime.Set(key, Clone(file));
    private static string Normalize(string value) => value?.Trim().ToLowerInvariant() ?? string.Empty;
    private static string SafeFileToken(string value)
    {
        var token = new string((value ?? string.Empty).Trim().Select(character =>
            char.IsLetterOrDigit(character) || character is '-' or '_' ? character : '-').ToArray()).Trim('-');
        return string.IsNullOrWhiteSpace(token) ? "employee" : token;
    }
    private static InventoryGeneratedFileDto Clone(InventoryGeneratedFileDto file) => file with { Content = file.Content.ToArray() };
    private static InventoryCommandResult<InventoryGeneratedFileDto> Success(InventoryGeneratedFileDto value) => new(value, new Dictionary<string, string[]>());
    private static InventoryCommandResult<InventoryGeneratedFileDto> Failure(string key, string message) => new(null, new Dictionary<string, string[]> { [key] = [message] });
}

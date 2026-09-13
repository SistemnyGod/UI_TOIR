using System.Net.Http.Headers;
using Patrol360.Application;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence.Inventory;

public sealed class PpeDocxPdfConverter(IHttpClientFactory httpClientFactory, PpeIssueDocumentPrintRuntime runtime) : IPpeDocxPdfConverter
{
    private const int MaxPdfBytes = 32 * 1024 * 1024;
    public async Task<InventoryCommandResult<InventoryGeneratedFileDto>> ConvertAsync(InventoryGeneratedFileDto docx, CancellationToken cancellationToken)
    {
        var queueEntered = await runtime.TryEnterConversionAsync(cancellationToken).ConfigureAwait(false);
        if (!queueEntered) return Failure("pdf.retryable", "Очередь конвертации PDF занята. Повторите попытку.");

        try
        {
            using var conversionCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            conversionCts.CancelAfter(TimeSpan.FromSeconds(60));
            var conversionToken = conversionCts.Token;
            using var request = new HttpRequestMessage(HttpMethod.Post, "forms/libreoffice/convert");
            using var form = new MultipartFormDataContent();
            var content = new ByteArrayContent(docx.Content);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            form.Add(content, "files", "document.docx");
            request.Content = form;
            using var client = httpClientFactory.CreateClient(PpeIssueDocumentPrintingServiceCollectionExtensions.GotenbergClientName);
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, conversionToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode) return Failure("pdf.retryable", $"Конвертация PDF временно недоступна (HTTP {(int)response.StatusCode}). Повторите попытку.");
            if (response.Content.Headers.ContentLength is > MaxPdfBytes)
                return Failure("pdf.retryable", "Конвертер вернул PDF больше 32 MiB. Повторите попытку с меньшим документом.");
            var pdf = await ReadPdfBoundedAsync(response.Content, conversionToken).ConfigureAwait(false);
            if (pdf is null) return Failure("pdf.retryable", "Конвертер вернул PDF больше 32 MiB. Повторите попытку с меньшим документом.");
            if (pdf.Length < 5 || !pdf.AsSpan().StartsWith("%PDF-"u8)) return Failure("pdf.retryable", "Конвертер вернул некорректный PDF. Повторите попытку.");
            var file = new InventoryGeneratedFileDto(Path.ChangeExtension(docx.DownloadName, ".pdf"), "application/pdf", pdf);

            return Success(file);
        }
        catch (HttpRequestException)
        {
            return Failure("pdf.retryable", "Конвертер PDF недоступен. DOCX можно скачать сразу; PDF повторите позже.");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            return Failure("pdf.retryable", "Превышено время ожидания конвертации PDF. Повторите попытку.");
        }
        finally
        {
            if (queueEntered) runtime.ExitConversion();
        }
    }


    private static async Task<byte[]?> ReadPdfBoundedAsync(HttpContent content, CancellationToken cancellationToken)
    {
        await using var input = await content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        await using var output = new MemoryStream();
        var buffer = new byte[81_920];
        var total = 0;
        while (true)
        {
            var read = await input.ReadAsync(buffer.AsMemory(), cancellationToken).ConfigureAwait(false);
            if (read == 0) break;
            if (read > MaxPdfBytes - total) return null;
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
            total += read;
        }
        return output.ToArray();
    }
    private static InventoryCommandResult<InventoryGeneratedFileDto> Success(InventoryGeneratedFileDto value) => new(value, new Dictionary<string, string[]>());
    private static InventoryCommandResult<InventoryGeneratedFileDto> Failure(string key, string message) => new(null, new Dictionary<string, string[]> { [key] = [message] });
}
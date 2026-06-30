using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryExportService
{

    public InventoryCommandResult<InventoryGeneratedFileDto> PrintCustodyDocument(Guid documentId, string format)
    {
        var document = dbContext.InventoryCustodyDocuments
            .AsNoTracking()
            .Include(row => row.Employee)
            .Include(row => row.Records)
                .ThenInclude(record => record.Item)
                    .ThenInclude(item => item.Unit)
            .Include(row => row.Records)
                .ThenInclude(record => record.Warehouse)
            .FirstOrDefault(row => row.Id == documentId && row.ArchivedAt == null);

        if (document is null)
        {
            return Failure<InventoryGeneratedFileDto>("documentId", "Custody document not found");
        }

        var normalizedFormat = Normalize(format);
        if (normalizedFormat.Length == 0)
        {
            normalizedFormat = "pdf";
        }

        var paragraphs = new List<string>
        {
            $"Акт под подпись {document.Number}",
            $"Сотрудник: {document.Employee.FullName}",
            $"Табельный номер: {document.Employee.PersonnelNo}",
            $"Подразделение: {document.Employee.Department}",
            $"Статус: {ToRussianCustodyStatus(document.Status)}",
            $"Дата: {document.CreatedAt.LocalDateTime:dd.MM.yyyy HH:mm}",
            string.Empty,
            "Строки акта:"
        };
        paragraphs.AddRange(document.Records
            .Where(row => row.ArchivedAt == null)
            .OrderBy(row => row.IssuedAt)
            .Select(row => $"{row.Item.Name}; склад: {row.Warehouse.Name}; количество: {row.Quantity:0.###} {row.Item.Unit?.Symbol}; статус: {ToRussianCustodyStatus(row.Status)}; комментарий: {row.Comment}"));

        return BuildPrintFile($"custody-{document.Number}", "Акт под подпись", paragraphs, normalizedFormat, "custody_document", document.Id);
    }

    public InventoryCommandResult<InventoryGeneratedFileDto> PrintPpeCard(Guid cardId, string type, string format)
    {
        var card = dbContext.InventoryPpeCards
            .AsNoTracking()
            .Include(row => row.Employee)
            .Include(row => row.Lines)
                .ThenInclude(line => line.Item)
                    .ThenInclude(item => item.Unit)
            .Include(row => row.Lines)
                .ThenInclude(line => line.Warehouse)
            .FirstOrDefault(row => row.Id == cardId && row.ArchivedAt == null);

        if (card is null)
        {
            return Failure<InventoryGeneratedFileDto>("cardId", "PPE card not found");
        }

        var normalizedFormat = Normalize(format);
        if (normalizedFormat.Length == 0)
        {
            normalizedFormat = "pdf";
        }

        var normalizedType = Normalize(type);
        var isSheet = normalizedType == "sheet";
        var title = isSheet ? "Лист подписи по получению СИЗ" : "Личная карточка учета выдачи СИЗ";
        var orderedLines = card.Lines
            .Where(line => line.Status != "archived")
            .OrderBy(line => isSheet ? line.IssuedAt ?? DateTimeOffset.MaxValue : DateTimeOffset.MinValue)
            .ThenBy(line => line.Item.Name)
            .ToList();
        var lines = orderedLines
            .Select(line => new PpePrintLine(
                string.IsNullOrWhiteSpace(line.PrintItemName)
                    ? (string.IsNullOrWhiteSpace(line.Item.NormItemName) ? line.Item.Name : line.Item.NormItemName)
                    : line.PrintItemName,
                string.IsNullOrWhiteSpace(line.BrandModelArticle)
                    ? string.Join(" / ", new[] { line.Item.BrandName, line.Item.ModelName, line.Item.Article, line.Item.ProtectionClass }.Where(part => !string.IsNullOrWhiteSpace(part)))
                    : line.BrandModelArticle,
                line.Quantity,
                line.Item.Unit?.Symbol ?? "шт.",
                line.Status,
                FormatDate(line.IssuedAt),
                FormatDate(line.DueAt),
                line.Item.DefaultLifeMonths,
                (line.IsSectionTitle || IsSectionTitle(line.PrintItemName)) ? string.Empty : string.IsNullOrWhiteSpace(line.NormPoint) ? "п. 1645 Приложения № 1" : line.NormPoint,
                (line.IsSectionTitle || IsSectionTitle(line.PrintItemName)) ? string.Empty : line.IssuePeriodText,
                (line.IsSectionTitle || IsSectionTitle(line.PrintItemName)) ? string.Empty : (line.QuantityText ?? string.Empty),
                PpeUnitPriceMinor(line),
                (PpeUnitPriceMinor(line) ?? 0) * line.Quantity,
                line.IsSectionTitle || IsSectionTitle(line.PrintItemName)))
            .ToList();
        var printLines = isSheet
            ? lines.Where(line => !line.IsSectionTitle && PpeIssueStatusCatalog.IsSignatureStatus(line.Status)).ToList()
            : lines;
        var printValidation = PpePrintLineValidator.Validate(printLines, isSheet);
        if (printValidation is not null)
        {
            return Failure<InventoryGeneratedFileDto>("ppePrint", printValidation);
        }

        var employeeDetails = new PpeEmployeePrintDetails(
            card.Gender,
            card.Height,
            card.ClothingSize,
            card.ShoeSize,
            card.HeadSize,
            card.RespiratorSize,
            card.HandProtectionSize);

        var paragraphs = new List<string>
        {
            title,
            $"Сотрудник: {card.Employee.FullName}",
            $"Должность: {card.Position}",
            $"Статус карточки: {ToPpeStatusLabel(card.Status)}",
            $"Дата создания: {card.CreatedAt.LocalDateTime:dd.MM.yyyy HH:mm}",
            string.Empty,
            "Строки СИЗ:"
        };
        paragraphs.AddRange(lines.Select(line => $"{line.ItemName}; количество: {PpePrintQuantityText(line)}; статус: {ToPpeStatusLabel(line.Status)}; выдано: {line.IssuedAt}; до: {line.DueAt}"));
        var fileBaseName = isSheet
            ? $"ppe-signature-sheet-{card.Employee.PersonnelNo}-{card.Id:N}"
            : $"ppe-personal-card-{card.Employee.PersonnelNo}-{card.Id:N}";

        if (normalizedFormat == "docx")
        {
            var content = isSheet
                ? PpeTemplateDocumentBuilder.BuildSignatureSheet(card.Employee.FullName, card.Employee.PersonnelNo, card.Position, card.CreatedAt, printLines)
                : PpeTemplateDocumentBuilder.BuildPersonalCard(card.Id, card.Employee.FullName, card.Employee.PersonnelNo, card.Employee.Department, card.Position, card.CreatedAt, employeeDetails, printLines);

            return BuildGeneratedFile(fileBaseName, normalizedFormat, content, "ppe_card", card.Id);
        }

        return BuildPrintFile(fileBaseName, title, paragraphs, normalizedFormat, "ppe_card", card.Id);
    }

    private InventoryCommandResult<InventoryGeneratedFileDto> BuildPrintFile(
        string name,
        string title,
        IReadOnlyList<string> paragraphs,
        string format,
        string entityType,
        Guid entityId)
    {
        var content = format switch
        {
            "pdf" => SimplePdfBuilder.Build(title, paragraphs),
            "docx" => WordDocumentBuilder.Build(title, paragraphs),
            _ => []
        };

        if (content.Length == 0)
        {
            return Failure<InventoryGeneratedFileDto>("format", "Unsupported print format");
        }

        var now = DateTimeOffset.UtcNow;
        var fileName = $"{SanitizeFileName(name)}-{now:yyyyMMddHHmmss}.{format}";
        AddExportJob(entityType, format, fileName, now);
        dbContext.InventorySystemLogs.Add(new InventorySystemLogEntity
        {
            Id = Guid.NewGuid(),
            EntityType = entityType,
            EntityId = entityId,
            Action = format == "docx" ? "docx_exported" : format == "pdf" ? "pdf_exported" : "print",
            Details = fileName,
            Actor = "system",
            CreatedAt = now
        });
        dbContext.SaveChanges();

        return Success(new InventoryGeneratedFileDto(fileName, ContentType(format), content));
    }
}

using System.IO.Compression;
using System.Security;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfInventoryExportService(Patrol360DbContext dbContext) : IInventoryExportService
{
    public InventoryCommandResult<InventoryGeneratedFileDto> ExportReport(string reportId, string format)
    {
        var normalizedReportId = Normalize(reportId);
        var normalizedFormat = Normalize(format);
        if (normalizedFormat.Length == 0)
        {
            normalizedFormat = "xlsx";
        }

        var rows = BuildReportRows(normalizedReportId);
        if (rows is null)
        {
            return Failure<InventoryGeneratedFileDto>("reportId", "Report not found");
        }

        var now = DateTimeOffset.UtcNow;
        var fileName = $"inventory-{normalizedReportId}-{now:yyyyMMddHHmmss}.{normalizedFormat}";
        var content = normalizedFormat switch
        {
            "xlsx" => SpreadsheetDocumentBuilder.Build("Inventory", rows.Headers, rows.Rows),
            "docx" => WordDocumentBuilder.Build(rows.Title, ToParagraphs(rows.Headers, rows.Rows)),
            "pdf" => SimplePdfBuilder.Build(rows.Title, ToParagraphs(rows.Headers, rows.Rows)),
            _ => []
        };

        if (content.Length == 0)
        {
            return Failure<InventoryGeneratedFileDto>("format", "Unsupported export format");
        }

        AddExportJob(normalizedReportId, normalizedFormat, fileName, now);
        dbContext.SaveChanges();

        return Success(new InventoryGeneratedFileDto(fileName, ContentType(normalizedFormat), content));
    }

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
            $"РђРєС‚ РїРѕРґ Р·Р°РїРёСЃСЊ {document.Number}",
            $"РЎРѕС‚СЂСѓРґРЅРёРє: {document.Employee.FullName}",
            $"РўР°Р±РµР»СЊРЅС‹Р№ РЅРѕРјРµСЂ: {document.Employee.PersonnelNo}",
            $"РџРѕРґСЂР°Р·РґРµР»РµРЅРёРµ: {document.Employee.Department}",
            $"РЎС‚Р°С‚СѓСЃ: {ToRussianCustodyStatus(document.Status)}",
            $"Р”Р°С‚Р°: {document.CreatedAt.LocalDateTime:dd.MM.yyyy HH:mm}",
            string.Empty,
            "РЎС‚СЂРѕРєРё Р°РєС‚Р°:"
        };
        paragraphs.AddRange(document.Records
            .Where(row => row.ArchivedAt == null)
            .OrderBy(row => row.IssuedAt)
            .Select(row => $"{row.Item.Name}; СЃРєР»Р°Рґ: {row.Warehouse.Name}; РєРѕР»РёС‡РµСЃС‚РІРѕ: {row.Quantity:0.###} {row.Item.Unit?.Symbol}; СЃС‚Р°С‚СѓСЃ: {ToRussianCustodyStatus(row.Status)}; РєРѕРјРјРµРЅС‚Р°СЂРёР№: {row.Comment}"));

        return BuildPrintFile($"custody-{document.Number}", "РђРєС‚ РїРѕРґ Р·Р°РїРёСЃСЊ", paragraphs, normalizedFormat, "custody_document", document.Id);
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
        var title = isSheet ? "Лист росписи по получению СИЗ" : "Личная карточка учета выдачи СИЗ";
        var lines = card.Lines
            .Where(line => line.Status != "archived")
            .OrderBy(line => line.Item.Name)
            .Select(line => new PpePrintLine(
                line.Item.Name,
                string.Join(" / ", new[] { line.Item.BrandName, line.Item.ModelName, line.Item.Article, line.Item.ProtectionClass }.Where(part => !string.IsNullOrWhiteSpace(part))),
                line.Quantity,
                line.Item.Unit?.Symbol ?? "шт.",
                line.Status,
                FormatDate(line.IssuedAt),
                FormatDate(line.DueAt),
                line.Item.DefaultLifeMonths,
                line.Item.NormItemName,
                line.Item.DefaultUnitPriceMinor,
                (line.Item.DefaultUnitPriceMinor ?? 0) * line.Quantity))
            .ToList();
        var paragraphs = new List<string>
        {
            title,
            $"Сотрудник: {card.Employee.FullName}",
            $"Должность: {card.Position}",
            $"Статус карточки: {ToRussianPpeStatus(card.Status)}",
            $"Дата создания: {card.CreatedAt.LocalDateTime:dd.MM.yyyy HH:mm}",
            string.Empty,
            "Строки СИЗ:"
        };
        paragraphs.AddRange(lines.Select(line => $"{line.ItemName}; количество: {line.Quantity:0.###} {line.Unit}; статус: {ToRussianPpeStatus(line.Status)}; выдано: {line.IssuedAt}; до: {line.DueAt}"));

        if (normalizedFormat == "docx")
        {
            var content = isSheet
                ? WordDocumentBuilder.BuildPpeSignatureSheet(card.Employee.FullName, card.Employee.PersonnelNo, card.Position, card.CreatedAt, lines)
                : WordDocumentBuilder.BuildPpePersonalCard(card.Id, card.Employee.FullName, card.Employee.PersonnelNo, card.Employee.Department, card.Position, card.CreatedAt, lines);

            return BuildGeneratedFile($"ppe-{card.Employee.PersonnelNo}-{card.Id:N}", normalizedFormat, content, "ppe_card", card.Id);
        }

        return BuildPrintFile($"ppe-{card.Employee.PersonnelNo}-{card.Id:N}", title, paragraphs, normalizedFormat, "ppe_card", card.Id);
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
            Action = "print",
            Details = fileName,
            Actor = "system",
            CreatedAt = now
        });
        dbContext.SaveChanges();

        return Success(new InventoryGeneratedFileDto(fileName, ContentType(format), content));
    }

    private InventoryCommandResult<InventoryGeneratedFileDto> BuildGeneratedFile(
        string name,
        string format,
        byte[] content,
        string entityType,
        Guid entityId)
    {
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
            Action = "print",
            Details = fileName,
            Actor = "system",
            CreatedAt = now
        });
        dbContext.SaveChanges();

        return Success(new InventoryGeneratedFileDto(fileName, ContentType(format), content));
    }

    private ReportRows? BuildReportRows(string reportId)
    {
        if (reportId == "stock")
        {
            var rows = dbContext.InventoryStockMoves
                .AsNoTracking()
                .Include(row => row.Item).ThenInclude(row => row.Unit)
                .Include(row => row.Warehouse)
                .GroupBy(row => new { row.ItemId, Item = row.Item.Name, Unit = row.Item.Unit != null ? row.Item.Unit.Symbol : "", row.WarehouseId, Warehouse = row.Warehouse.Name })
                .Select(row => new[] { row.Key.Item, row.Key.Warehouse, row.Sum(move => move.QuantityDelta).ToString("0.###"), row.Key.Unit })
                .ToList();
            return new("РћСЃС‚Р°С‚РєРё", ["РџРѕР·РёС†РёСЏ", "РЎРєР»Р°Рґ", "РћСЃС‚Р°С‚РѕРє", "Р•Рґ."], rows);
        }

        if (reportId == "moves")
        {
            var rows = dbContext.InventoryStockMoves
                .AsNoTracking()
                .Include(row => row.Item)
                .Include(row => row.Warehouse)
                .Include(row => row.Employee)
                .OrderByDescending(row => row.MovedAt)
                .Take(5000)
                .Select(row => new[]
                {
                    row.MovedAt.UtcDateTime.ToString("dd.MM.yyyy HH:mm"),
                    row.MoveType,
                    row.Item.Name,
                    row.Warehouse.Name,
                    row.QuantityDelta.ToString("0.###"),
                    row.Employee != null ? row.Employee.FullName : ""
                })
                .ToList();
            return new("Р”РІРёР¶РµРЅРёСЏ", ["Р”Р°С‚Р°", "РўРёРї", "РџРѕР·РёС†РёСЏ", "РЎРєР»Р°Рґ", "РљРѕР»РёС‡РµСЃС‚РІРѕ", "РЎРѕС‚СЂСѓРґРЅРёРє"], rows);
        }

        if (reportId == "ppe")
        {
            var rows = dbContext.InventoryPpeCardLines
                .AsNoTracking()
                .Include(row => row.Card).ThenInclude(row => row.Employee)
                .Include(row => row.Item).ThenInclude(row => row.Unit)
                .Include(row => row.Warehouse)
                .Where(row => row.Status != "archived")
                .OrderBy(row => row.Card.Employee.FullName)
                .ThenBy(row => row.Item.Name)
                .Select(row => new[]
                {
                    row.Card.Id.ToString(),
                    row.Card.Employee.FullName,
                    row.Card.Position,
                    row.Item.Name,
                    row.Quantity.ToString("0.###"),
                    row.Item.Unit != null ? row.Item.Unit.Symbol : "",
                    FormatMoney(row.Item.DefaultUnitPriceMinor),
                    FormatMoney((row.Item.DefaultUnitPriceMinor ?? 0) * row.Quantity),
                    row.Status,
                    FormatDate(row.IssuedAt),
                    FormatDate(row.DueAt)
                })
                .ToList();
            return new("СИЗ", ["Карточка", "Сотрудник", "Должность", "Позиция", "Кол-во", "Ед.", "Цена", "Сумма", "Статус", "Выдано", "Срок"], rows);
        }

        if (reportId == "custody")
        {
            var records = dbContext.InventoryCustodyRecords
                .AsNoTracking()
                .Include(row => row.Document)
                .Include(row => row.Employee)
                .Include(row => row.Item).ThenInclude(row => row.Unit)
                .Include(row => row.Warehouse)
                .OrderByDescending(row => row.IssuedAt)
                .Take(5000)
                .ToList();

            var rows = records
                .Select(row => new[]
                {
                    row.Document.Number,
                    row.Employee.FullName,
                    row.Item.Name,
                    row.Warehouse.Name,
                    row.Quantity.ToString("0.###"),
                    row.Item.Unit != null ? row.Item.Unit.Symbol : "",
                    row.Status,
                    row.IssuedAt.UtcDateTime.ToString("dd.MM.yyyy")
                })
                .ToList();
            return new("РџРѕРґ Р·Р°РїРёСЃСЊ", ["РђРєС‚", "РЎРѕС‚СЂСѓРґРЅРёРє", "РџРѕР·РёС†РёСЏ", "РЎРєР»Р°Рґ", "РљРѕР»-РІРѕ", "Р•Рґ.", "РЎС‚Р°С‚СѓСЃ", "Р”Р°С‚Р°"], rows);
        }

        if (reportId == "history")
        {
            var rows = dbContext.InventorySystemLogs
                .AsNoTracking()
                .OrderByDescending(row => row.CreatedAt)
                .Take(5000)
                .Select(row => new[]
                {
                    row.CreatedAt.UtcDateTime.ToString("dd.MM.yyyy HH:mm"),
                    row.EntityType,
                    row.Action,
                    row.Details,
                    row.Actor
                })
                .ToList();
            return new("РСЃС‚РѕСЂРёСЏ РѕРїРµСЂР°С†РёР№", ["Р”Р°С‚Р°", "РЎСѓС‰РЅРѕСЃС‚СЊ", "Р”РµР№СЃС‚РІРёРµ", "Р”РµС‚Р°Р»Рё", "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ"], rows);
        }

        if (reportId == "employees")
        {
            var rows = dbContext.Employees
                .AsNoTracking()
                .OrderBy(row => row.FullName)
                .Select(row => new[] { row.FullName, row.PersonnelNo, row.Position, row.Department, row.Status })
                .ToList();
            return new("РЎРѕС‚СЂСѓРґРЅРёРєРё СѓС‡РµС‚Р°", ["Р¤РРћ", "РўР°Р±РµР»СЊРЅС‹Р№", "Р”РѕР»Р¶РЅРѕСЃС‚СЊ", "РџРѕРґСЂР°Р·РґРµР»РµРЅРёРµ", "РЎС‚Р°С‚СѓСЃ"], rows);
        }

        if (reportId == "system_log")
        {
            var rows = dbContext.InventorySystemLogs
                .AsNoTracking()
                .OrderByDescending(row => row.CreatedAt)
                .Take(5000)
                .Select(row => new[] { row.CreatedAt.UtcDateTime.ToString("dd.MM.yyyy HH:mm"), row.EntityType, row.Action, row.Details, row.Actor })
                .ToList();
            return new("РЎРёСЃС‚РµРјРЅС‹Р№ Р¶СѓСЂРЅР°Р»", ["Р”Р°С‚Р°", "РЎСѓС‰РЅРѕСЃС‚СЊ", "Р”РµР№СЃС‚РІРёРµ", "Р”РµС‚Р°Р»Рё", "РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ"], rows);
        }

        return null;
    }

    private void AddExportJob(string reportId, string format, string downloadName, DateTimeOffset now)
    {
        var export = new InventoryExportJobEntity
        {
            Id = Guid.NewGuid(),
            ReportId = reportId,
            Format = format,
            Status = "completed",
            DownloadName = downloadName,
            PayloadJson = "{\"status\":\"completed\",\"mode\":\"sync\"}",
            CreatedAt = now
        };
        dbContext.InventoryExportJobs.Add(export);
        dbContext.InventorySystemLogs.Add(new InventorySystemLogEntity
        {
            Id = Guid.NewGuid(),
            EntityType = "export_job",
            EntityId = export.Id,
            Action = "created",
            Details = downloadName,
            Actor = "system",
            CreatedAt = now
        });
    }

    private static IReadOnlyList<string> ToParagraphs(IReadOnlyList<string> headers, IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var paragraphs = new List<string> { string.Join(" | ", headers) };
        paragraphs.AddRange(rows.Select(row => string.Join(" | ", row)));
        return paragraphs;
    }

    private static string ContentType(string format) => format switch
    {
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf" => "application/pdf",
        _ => "application/octet-stream"
    };

    private static string FormatDate(DateTimeOffset? value) => value?.UtcDateTime.ToString("dd.MM.yyyy") ?? "";

    private static string FormatMoney(long? minor) =>
        minor is null ? "" : FormatMoney((decimal)minor.Value);

    private static string FormatMoney(decimal minor) =>
        (minor / 100m).ToString("0.##");

    private static string Normalize(string value) => value.Trim().ToLowerInvariant();


    private static string ToRussianCustodyStatus(string status) => Normalize(status) switch
    {
        "open" => "РћС‚РєСЂС‹С‚",
        "closed" => "Р—Р°РєСЂС‹С‚",
        "archived" => "РђСЂС…РёРІ",
        "in_use" => "РќР° СЂСѓРєР°С…",
        "returned" => "Р’РѕР·РІСЂР°С‰РµРЅРѕ",
        "written_off" => "РЎРїРёСЃР°РЅРѕ",
        "lost" => "РЈС‚РµСЂСЏРЅРѕ",
        _ => status
    };

    private static string ToRussianPpeStatus(string status) => Normalize(status) switch
    {
        "active" => "Активна",
        "archived" => "Архив",
        "issued" => "Выдано",
        "not_issued" => "Не выдано",
        "returned" => "Возвращено",
        "written_off" => "Списано",
        "lost" => "Утеряно",
        "reissued" => "Переоформлено",
        _ => status
    };

    private static string SanitizeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            builder.Append(invalid.Contains(ch) ? '-' : ch);
        }

        return builder.ToString();
    }

    private static InventoryCommandResult<T> Success<T>(T value) => new(value, EmptyErrors);

    private static InventoryCommandResult<T> Failure<T>(string key, string message) =>
        new(default, new Dictionary<string, string[]> { [key] = [message] });

    private static readonly IReadOnlyDictionary<string, string[]> EmptyErrors =
        new Dictionary<string, string[]>();

    private sealed record ReportRows(string Title, IReadOnlyList<string> Headers, IReadOnlyList<IReadOnlyList<string>> Rows);
}

file sealed record PpePrintLine(
    string ItemName,
    string Model,
    decimal Quantity,
    string Unit,
    string Status,
    string IssuedAt,
    string DueAt,
    int? LifeMonths,
    string NormPoint,
    long? UnitPriceMinor,
    decimal AmountMinor);

file static class SpreadsheetDocumentBuilder
{
    public static byte[] Build(string sheetName, IReadOnlyList<string> headers, IReadOnlyList<IReadOnlyList<string>> rows)
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            Add(archive, "[Content_Types].xml", """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                </Types>
                """);
            Add(archive, "_rels/.rels", """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                </Relationships>
                """);
            Add(archive, "xl/workbook.xml", $"""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                  <sheets><sheet name="{Xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
                </workbook>
                """);
            Add(archive, "xl/_rels/workbook.xml.rels", """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
                </Relationships>
                """);
            Add(archive, "xl/worksheets/sheet1.xml", SheetXml(headers, rows));
        }

        return stream.ToArray();
    }

    private static string SheetXml(IReadOnlyList<string> headers, IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var builder = new StringBuilder();
        builder.Append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""");
        AppendRow(builder, 1, headers);
        for (var index = 0; index < rows.Count; index++)
        {
            AppendRow(builder, index + 2, rows[index]);
        }

        builder.Append("</sheetData></worksheet>");
        return builder.ToString();
    }

    private static void AppendRow(StringBuilder builder, int rowNumber, IReadOnlyList<string> values)
    {
        builder.Append(CultureInvariant($"<row r=\"{rowNumber}\">"));
        for (var index = 0; index < values.Count; index++)
        {
            builder.Append(CultureInvariant($"<c r=\"{Column(index)}{rowNumber}\" t=\"inlineStr\"><is><t>{Xml(values[index])}</t></is></c>"));
        }

        builder.Append("</row>");
    }

    private static string Column(int index)
    {
        var value = index + 1;
        var column = string.Empty;
        while (value > 0)
        {
            value--;
            column = (char)('A' + value % 26) + column;
            value /= 26;
        }

        return column;
    }

    private static string Xml(string value) => SecurityElement.Escape(value) ?? string.Empty;

    private static string CultureInvariant(FormattableString value) => FormattableString.Invariant(value);

    private static void Add(ZipArchive archive, string path, string content)
    {
        var entry = archive.CreateEntry(path, CompressionLevel.Fastest);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
        writer.Write(content.Trim());
    }
}

file static class WordDocumentBuilder
{
    public static byte[] Build(string title, IReadOnlyList<string> paragraphs)
    {
        var builder = StartDocument();
        AppendParagraph(builder, title, bold: true, center: true);
        foreach (var paragraph in paragraphs)
        {
            AppendParagraph(builder, paragraph, bold: false);
        }

        AppendSection(builder, landscape: false);
        return BuildPackage(builder.ToString());
    }

    public static byte[] BuildPpePersonalCard(
        Guid cardId,
        string employeeName,
        string personnelNo,
        string department,
        string position,
        DateTimeOffset createdAt,
        IReadOnlyList<PpePrintLine> lines)
    {
        var builder = StartDocument();
        AppendParagraph(builder, $"ЛИЧНАЯ КАРТОЧКА № СИЗ-{cardId.ToString("N")[..8]}", bold: true, center: true);
        AppendParagraph(builder, "УЧЕТА ВЫДАЧИ СИЗ", bold: true, center: true);
        AppendParagraph(builder, $"Дата оформления: {createdAt.LocalDateTime:dd.MM.yyyy}", bold: false, center: true);
        AppendParagraph(builder, string.Empty, bold: false);
        var (lastName, restName) = SplitEmployeeName(employeeName);
        AppendTable(builder, [
            ["Фамилия", lastName, "Пол", ""],
            ["Имя", restName, "Рост", ""],
            ["Табельный номер", personnelNo, "Размер одежды", ""],
            ["Структурное подразделение", department, "Размер обуви", ""],
            ["Профессия (должность)", position, "Размер головного убора", ""],
            ["Дата поступления на работу", "", "СИЗОД", ""],
            ["Дата изменения профессии (должности) или перевода в другое структурное подразделение", "", "СИЗ рук", ""]
        ]);
        AppendParagraph(builder, string.Empty, bold: false);
        AppendParagraph(builder,
            "Выдача предусмотрена Приказом Минтруда России от 27.12.2017 N 882н «Об утверждении Типовых норм бесплатной выдачи специальной одежды, специальной обуви и других средств индивидуальной защиты работникам промышленности строительных материалов, стекольной и фарфоро-фаянсовой промышленности, занятым на работах с вредными и (или) опасными условиями труда, а также на работах, выполняемых в особых температурных условиях или связанных с загрязнением» (зарегистрировано в Минюсте России 01.03.2018 N 50193), Межотраслевыми правилами обеспечения работников специальной одеждой, специальной обувью и другими средствами индивидуальной защиты (утв. Приказом Минздравсоцразвития России от 01.06.2009 N 290н).",
            bold: false);
        AppendParagraph(builder, "(наименование типовых (типовых отраслевых) норм)", bold: false, center: true);
        AppendParagraph(builder, string.Empty, bold: false);
        AppendTable(builder, BuildPersonalCardRows(lines), headerRows: 1);
        AppendParagraph(builder, string.Empty, bold: false);
        AppendParagraph(builder, $"Итого к выдаче: {lines.Count} поз.; количество {TotalQuantity(lines):0.###}; сумма {FormatMoneyMinor(TotalAmountMinor(lines))}", bold: true);
        AppendParagraph(builder, "Ответственное лицо за ведение карточек учета СИЗ ____________________   ________________", bold: false);
        AppendSection(builder, landscape: false);
        return BuildPackage(builder.ToString());
    }

    public static byte[] BuildPpeSignatureSheet(
        string employeeName,
        string personnelNo,
        string position,
        DateTimeOffset createdAt,
        IReadOnlyList<PpePrintLine> lines)
    {
        var builder = StartDocument();
        AppendParagraph(builder, "ЛИСТ РОСПИСИ ПО ПОЛУЧЕНИЮ СИЗ", bold: true, center: true);
        AppendParagraph(builder, $"Сотрудник: {employeeName}    Табельный номер: {personnelNo}    Должность: {position}", bold: false, center: true);
        AppendParagraph(builder, $"Дата оформления: {createdAt.LocalDateTime:dd.MM.yyyy}", bold: false, center: true);
        AppendParagraph(builder, string.Empty, bold: false);
        AppendTable(builder, BuildSignatureSheetRows(lines), headerRows: 3);
        AppendParagraph(builder, string.Empty, bold: false);
        AppendParagraph(builder, $"Итого к выдаче: {lines.Count} поз.; количество {TotalQuantity(lines):0.###}; сумма {FormatMoneyMinor(TotalAmountMinor(lines))}", bold: true);
        AppendParagraph(builder, "СИЗ выдал ____________________ / ____________________     СИЗ получил ____________________ / ____________________", bold: false);
        AppendSection(builder, landscape: true);
        return BuildPackage(builder.ToString());
    }

    private static List<IReadOnlyList<string>> BuildPersonalCardRows(IReadOnlyList<PpePrintLine> lines)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "Наименование СИЗ", "Пункт норм", "Единица измерения, периодичность выдачи", "Количество на период" }
        };

        rows.AddRange(lines.Select(line => new[]
        {
            line.ItemName,
            string.IsNullOrWhiteSpace(line.NormPoint) ? "по нормам должности" : line.NormPoint,
            PeriodText(line),
            $"{line.Quantity:0.###} {line.Unit}"
        }));

        return rows;
    }

    private static List<IReadOnlyList<string>> BuildSignatureSheetRows(IReadOnlyList<PpePrintLine> lines)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "Наименование СИЗ", "Модель, марка, артикул, класс защиты СИЗ, дерматологических СИЗ", "Выдано", "", "", "", "Возвращено", "", "", "" },
            new[] { "", "", "дата", "количество", "Лично/дозатор", "Подпись получившего СИЗ", "дата", "Количество", "Подпись сдавшего СИЗ", "Акт списания (дата, номер)" },
            new[] { "1", "2", "3", "4", "5", "6", "7", "8", "9", "10" }
        };

        rows.AddRange(lines.Select(line => new[]
        {
            line.ItemName,
            string.IsNullOrWhiteSpace(line.Model) ? "-" : line.Model,
            string.IsNullOrWhiteSpace(line.IssuedAt) ? "-" : line.IssuedAt,
            line.Quantity.ToString("0.###"),
            IsConsumable(line) ? "Дозатор" : "-",
            "",
            "",
            "",
            "",
            ""
        }));

        return rows;
    }

    private static string PeriodText(PpePrintLine line)
    {
        var unit = string.IsNullOrWhiteSpace(line.Unit) ? "шт." : line.Unit;
        return line.LifeMonths is > 0 ? $"{unit}, на {line.LifeMonths} мес." : $"{unit}, по сроку носки";
    }

    private static string StatusText(string status) => status.Trim().ToLowerInvariant() switch
    {
        "issued" => "Выдано",
        "not_issued" => "Не выдано",
        "returned" => "Возвращено",
        "written_off" => "Списано",
        "lost" => "Утеряно",
        "reissued" => "Переоформлено",
        _ => status
    };

    private static bool IsConsumable(PpePrintLine line) =>
        line.LifeMonths is null or <= 0 && string.IsNullOrWhiteSpace(line.DueAt);

    private static decimal TotalQuantity(IReadOnlyList<PpePrintLine> lines) =>
        lines.Sum(line => line.Quantity);

    private static decimal TotalAmountMinor(IReadOnlyList<PpePrintLine> lines) =>
        lines.Sum(line => line.AmountMinor);

    private static string FormatMoneyMinor(decimal amountMinor) =>
        $"{amountMinor / 100m:0.##} руб.";

    private static (string LastName, string RestName) SplitEmployeeName(string employeeName)
    {
        var parts = employeeName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length switch
        {
            0 => ("", ""),
            1 => (parts[0], ""),
            _ => (parts[0], string.Join(' ', parts.Skip(1)))
        };
    }

    private static StringBuilder StartDocument()
    {
        var builder = new StringBuilder();
        builder.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>");
        return builder;
    }

    private static byte[] BuildPackage(string documentXml)
    {
        using var stream = new MemoryStream();
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            Add(archive, "[Content_Types].xml", """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                </Types>
                """);
            Add(archive, "_rels/.rels", """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
                </Relationships>
                """);
            Add(archive, "word/document.xml", documentXml);
        }

        return stream.ToArray();
    }

    private static void AppendTable(StringBuilder builder, IReadOnlyList<IReadOnlyList<string>> rows, int headerRows = 0)
    {
        builder.Append("<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/><w:tblBorders><w:top w:val=\"single\" w:sz=\"4\"/><w:left w:val=\"single\" w:sz=\"4\"/><w:bottom w:val=\"single\" w:sz=\"4\"/><w:right w:val=\"single\" w:sz=\"4\"/><w:insideH w:val=\"single\" w:sz=\"4\"/><w:insideV w:val=\"single\" w:sz=\"4\"/></w:tblBorders></w:tblPr>");
        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            builder.Append("<w:tr>");
            foreach (var cell in rows[rowIndex])
            {
                builder.Append("<w:tc><w:tcPr><w:tcW w:w=\"2400\" w:type=\"dxa\"/></w:tcPr><w:p><w:r>");
                if (rowIndex < headerRows)
                {
                    builder.Append("<w:rPr><w:b/></w:rPr>");
                }

                builder.Append($"<w:t xml:space=\"preserve\">{Xml(cell)}</w:t></w:r></w:p></w:tc>");
            }

            builder.Append("</w:tr>");
        }

        builder.Append("</w:tbl>");
    }

    private static void AppendSection(StringBuilder builder, bool landscape)
    {
        var pageSize = landscape
            ? "<w:pgSz w:w=\"16838\" w:h=\"11906\" w:orient=\"landscape\"/>"
            : "<w:pgSz w:w=\"11906\" w:h=\"16838\"/>";
        builder.Append($"<w:sectPr>{pageSize}<w:pgMar w:top=\"720\" w:right=\"720\" w:bottom=\"720\" w:left=\"720\"/></w:sectPr></w:body></w:document>");
    }

    private static void AppendParagraph(StringBuilder builder, string text, bool bold, bool center = false)
    {
        builder.Append("<w:p>");
        if (center)
        {
            builder.Append("<w:pPr><w:jc w:val=\"center\"/></w:pPr>");
        }

        builder.Append("<w:r>");
        if (bold)
        {
            builder.Append("<w:rPr><w:b/></w:rPr>");
        }

        builder.Append($"<w:t xml:space=\"preserve\">{Xml(text)}</w:t></w:r></w:p>");
    }

    private static string Xml(string value) => SecurityElement.Escape(value) ?? string.Empty;

    private static void Add(ZipArchive archive, string path, string content)
    {
        var entry = archive.CreateEntry(path, CompressionLevel.Fastest);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
        writer.Write(content.Trim());
    }
}
file static class SimplePdfBuilder
{
    public static byte[] Build(string title, IReadOnlyList<string> paragraphs)
    {
        var lines = new List<string> { title };
        lines.AddRange(paragraphs);
        var contentBuilder = new StringBuilder();
        contentBuilder.Append("BT /F1 11 Tf 50 790 Td 14 TL ");
        foreach (var line in lines.Take(52))
        {
            contentBuilder.Append($"({PdfText(line)}) Tj T* ");
        }

        contentBuilder.Append("ET");
        var content = Encoding.UTF8.GetBytes(contentBuilder.ToString());
        var objects = new List<byte[]>
        {
            Encoding.ASCII.GetBytes("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"),
            Encoding.ASCII.GetBytes("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"),
            Encoding.ASCII.GetBytes("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"),
            Encoding.ASCII.GetBytes("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n"),
            Encoding.ASCII.GetBytes($"5 0 obj << /Length {content.Length} >> stream\n{Encoding.UTF8.GetString(content)}\nendstream endobj\n")
        };

        using var stream = new MemoryStream();
        using var writer = new StreamWriter(stream, Encoding.ASCII, 1024, leaveOpen: true);
        writer.Write("%PDF-1.4\n");
        writer.Flush();
        var offsets = new List<long> { 0 };
        foreach (var obj in objects)
        {
            offsets.Add(stream.Position);
            stream.Write(obj);
        }

        var xref = stream.Position;
        writer.Write($"xref\n0 {objects.Count + 1}\n0000000000 65535 f \n");
        foreach (var offset in offsets.Skip(1))
        {
            writer.Write($"{offset:0000000000} 00000 n \n");
        }

        writer.Write($"trailer << /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF");
        writer.Flush();
        return stream.ToArray();
    }

    private static string PdfText(string value)
    {
        var ascii = new string(value.Select(ch => ch is >= ' ' and <= '~' ? ch : '?').ToArray());
        return ascii.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
    }
}

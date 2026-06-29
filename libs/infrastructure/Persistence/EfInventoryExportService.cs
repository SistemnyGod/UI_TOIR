using System.IO.Compression;
using System.Security;
using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryExportService(Patrol360DbContext dbContext) : IInventoryExportService
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
            Action = format == "docx" ? "docx_exported" : format == "pdf" ? "pdf_exported" : "print",
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
            return new("Остатки", ["Позиция", "Склад", "Остаток", "Ед."], rows);
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
            return new("Движения", ["Дата", "Тип", "Позиция", "Склад", "Количество", "Сотрудник"], rows);
        }

        if (reportId == "ppe")
        {
            var lines = dbContext.InventoryPpeCardLines
                .AsNoTracking()
                .Include(row => row.Card).ThenInclude(row => row.Employee)
                .Include(row => row.Item).ThenInclude(row => row.Unit)
                .Include(row => row.Warehouse)
                .Where(row => row.Status != "archived")
                .OrderBy(row => row.Card.Employee.FullName)
                .ThenBy(row => row.Item.Name)
                .ToList();
            var rows = lines
                .Select(row => new[]
                {
                    row.Card.Id.ToString(),
                    row.Card.Employee.FullName,
                    row.Card.Position,
                    row.Item.Name,
                    row.Quantity.ToString("0.###"),
                    row.Item.Unit != null ? row.Item.Unit.Symbol : "",
                    FormatMoney(PpeUnitPriceMinor(row)),
                    FormatMoney((PpeUnitPriceMinor(row) ?? 0) * row.Quantity),
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
            return new("Под подпись", ["Акт", "Сотрудник", "Позиция", "Склад", "Кол-во", "Ед.", "Статус", "Дата"], rows);
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
            return new("История операций", ["Дата", "Сущность", "Действие", "Детали", "Пользователь"], rows);
        }

        if (reportId == "employees")
        {
            var rows = dbContext.Employees
                .AsNoTracking()
                .OrderBy(row => row.FullName)
                .Select(row => new[] { row.FullName, row.PersonnelNo, row.Position, row.Department, row.Status })
                .ToList();
            return new("Сотрудники учета", ["ФИО", "Табельный", "Должность", "Подразделение", "Статус"], rows);
        }

        if (reportId == "system_log")
        {
            var rows = dbContext.InventorySystemLogs
                .AsNoTracking()
                .OrderByDescending(row => row.CreatedAt)
                .Take(5000)
                .Select(row => new[] { row.CreatedAt.UtcDateTime.ToString("dd.MM.yyyy HH:mm"), row.EntityType, row.Action, row.Details, row.Actor })
                .ToList();
            return new("Системный журнал", ["Дата", "Сущность", "Действие", "Детали", "Пользователь"], rows);
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
        "open" => "Открыт",
        "closed" => "Закрыт",
        "archived" => "Архив",
        "in_use" => "На руках",
        "returned" => "Возвращено",
        "written_off" => "Списано",
        "lost" => "Утеряно",
        _ => status
    };

    private static long? PpeUnitPriceMinor(InventoryPpeCardLineEntity line) =>
        line.UnitPriceMinor ?? line.Item.DefaultUnitPriceMinor;

    private static string ToPpeStatusLabel(string status) => PpeIssueStatusCatalog.Label(status);

    private static bool IsSectionTitle(string? printItemName) =>
        !string.IsNullOrWhiteSpace(printItemName) &&
        printItemName.Trim().EndsWith(':');

    private static string ToRussianPpeStatus(string status) => Normalize(status) switch
    {
        "active" => "Активна",
        "archived" => "Архив",
        "issued" => "Выдано",
        "issue_later" => "Выдать позже",
        "not_issued" => "Не выдано",
        "no_stock" => "Нет на складе",
        "returned" => "Возвращено",
        "written_off" => "Списано",
        "lost" => "Утеряно",
        "reissued" => "Переоформлено",
        "replacement" => "Заменено аналогом",
        _ => status
    };

    private static bool IsOpenPpeLineForSignature(string status) => Normalize(status) is "issued" or "replacement" or "reissued";

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

internal sealed record PpePrintLine(
    string ItemName,
    string Model,
    decimal Quantity,
    string Unit,
    string Status,
    string IssuedAt,
    string DueAt,
    int? LifeMonths,
    string NormPoint,
    string IssuePeriodText,
    long? UnitPriceMinor,
    decimal AmountMinor,
    bool IsSectionTitle);

internal sealed record PpeEmployeePrintDetails(
    string Gender,
    string Height,
    string ClothingSize,
    string ShoeSize,
    string HeadSize,
    string RespiratorSize,
    string HandProtectionSize);

internal static class PpeEmployeePrintDetailsValidator
{
    public static string? Validate(PpeEmployeePrintDetails details)
    {
        foreach (var (label, value) in RequiredFields(details))
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return $"Перед печатью карточки СИЗ заполните поле '{label}'.";
            }
        }

        return null;
    }

    private static IEnumerable<(string Label, string Value)> RequiredFields(PpeEmployeePrintDetails details)
    {
        yield return ("Пол", details.Gender);
        yield return ("Рост", details.Height);
        yield return ("Размер одежды", details.ClothingSize);
        yield return ("Размер обуви", details.ShoeSize);
        yield return ("Размер головного убора", details.HeadSize);
        yield return ("СИЗОД", details.RespiratorSize);
        yield return ("СИЗ рук", details.HandProtectionSize);
    }
}

internal static class PpePrintLineValidator
{
    private static readonly HashSet<string> GenericPpePrintNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "Каски",
        "Одежда",
        "Обувь",
        "Брюки",
        "Спецодежда",
        "СИЗ",
        "Средства индивидуальной защиты"
    };

    public static string? Validate(IReadOnlyList<PpePrintLine> lines, bool isSignatureSheet)
    {
        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line.ItemName))
            {
                return "PPE print line must contain normative item name.";
            }

            if (GenericPpePrintNames.Contains(line.ItemName.Trim()))
            {
                return $"Строка '{line.ItemName}' похожа на категорию. Укажите полное нормативное наименование СИЗ перед печатью.";
            }

            if (ContainsCategoryDashCatalog(line.ItemName))
            {
                return $"Строка '{line.ItemName}' смешивает категорию и складскую номенклатуру. Первая колонка должна содержать норму СИЗ.";
            }

            if (line.IsSectionTitle)
            {
                if (isSignatureSheet)
                {
                    return $"Разделитель '{line.ItemName}' не может попасть в лист подписи.";
                }

                continue;
            }
            if (!string.IsNullOrWhiteSpace(line.Model)
                && Normalize(line.Model) == Normalize(line.ItemName))
            {
                return $"Строка '{line.ItemName}' смешивает модель/марку с нормативным наименованием.";
            }

            if (line.Quantity <= 0)
            {
                return $"Строка '{line.ItemName}' должна содержать количество больше нуля.";
            }

            if (string.IsNullOrWhiteSpace(line.Unit))
            {
                return $"Строка '{line.ItemName}' должна содержать единицу измерения.";
            }

            if (!isSignatureSheet)
            {
                if (string.IsNullOrWhiteSpace(line.NormPoint))
                {
                    return $"Строка '{line.ItemName}' должна содержать пункт норм.";
                }

                if (string.IsNullOrWhiteSpace(line.IssuePeriodText))
                {
                    return $"Строка '{line.ItemName}' должна содержать единицу измерения и периодичность выдачи.";
                }
            }

            if (isSignatureSheet && !IsSignaturePpeLineStatus(line.Status))
            {
                return $"Строка '{line.ItemName}' не является фактически выданной и не может попасть в лист подписи.";
            }

            if (isSignatureSheet && string.IsNullOrWhiteSpace(line.IssuedAt))
            {
                return $"Строка листа подписи '{line.ItemName}' должна содержать дату выдачи.";
            }
        }

        return null;
    }

    private static string Normalize(string value) => value.Trim().ToLowerInvariant();

    private static bool IsSignaturePpeLineStatus(string value) =>
        PpeIssueStatusCatalog.IsSignatureStatus(value);

    private static bool ContainsCategoryDashCatalog(string value)
    {
        var parts = value.Split(" - ", 2, StringSplitOptions.TrimEntries);
        return parts.Length == 2 && GenericPpePrintNames.Contains(parts[0]);
    }
}
internal static class SpreadsheetDocumentBuilder
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

internal static class WordDocumentBuilder
{
    private const string WordFont = "Times New Roman";
    private const int BodyFontSize = 20;
    private const int SmallFontSize = 16;
    private const int TitleFontSize = 32;

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
        PpeEmployeePrintDetails employeeDetails,
        IReadOnlyList<PpePrintLine> lines)
    {
        var builder = StartDocument();
        AppendParagraph(builder, $"ЛИЧНАЯ КАРТОЧКА № СИЗ-{cardId.ToString("N")[..8]}", bold: true, center: true, fontSize: TitleFontSize);
        AppendParagraph(builder, "УЧЕТА ВЫДАЧИ СИЗ", bold: true, center: true);
        AppendParagraph(builder, string.Empty, bold: false);
        var (lastName, restName) = SplitEmployeeName(employeeName);
        AppendTable(builder, [
            [
                $"Фамилия {lastName}\nИмя {restName}\nТабельный номер {personnelNo}\nСтруктурное подразделение {department}\nПрофессия (должность) {position}\nДата поступления на работу ____________________\nДата изменения профессии (должности) или перевода в другое структурное подразделение ____________________",
                BuildEmployeeDetailsText(employeeDetails)
            ]
        ]);
        AppendParagraph(builder, string.Empty, bold: false);
        AppendParagraph(builder,
            "Выдача предусмотрена типовыми нормами бесплатной выдачи специальной одежды, специальной обуви и других средств индивидуальной защиты.",
            bold: false,
            fontSize: SmallFontSize);
        AppendParagraph(builder, "(наименование типовых (типовых отраслевых) норм)", bold: false, center: true, fontSize: SmallFontSize);
        AppendParagraph(builder, string.Empty, bold: false);
        AppendTable(builder, BuildPersonalCardRows(lines), headerRows: 1);
        AppendParagraph(builder, string.Empty, bold: false);
        AppendParagraph(builder, "Ответственное лицо за ведение карточек учета выдачи СИЗ ____________________   ________________", bold: false);
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
        AppendTable(builder, BuildSignatureSheetRows(lines), headerRows: 3);
        AppendSection(builder, landscape: true);
        return BuildPackage(builder.ToString());
    }

    private static List<IReadOnlyList<string>> BuildPersonalCardRows(IReadOnlyList<PpePrintLine> lines)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "Наименование СИЗ", "Пункт норм", "Единица измерения, периодичность выдачи", "Количество на период" }
        };

        rows.AddRange(lines.Select(line => line.IsSectionTitle
            ? new[] { line.ItemName, string.Empty, string.Empty, string.Empty }
            : new[]
            {
                line.ItemName,
                string.IsNullOrWhiteSpace(line.NormPoint) ? "п. 1645 Приложения № 1" : line.NormPoint,
                PeriodText(line),
                $"{line.Quantity:0.###} {line.Unit}"
            }));

        return rows;
    }

    private static List<IReadOnlyList<string>> BuildSignatureSheetRows(IReadOnlyList<PpePrintLine> lines)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "Наименование СИЗ", "Модель, марка, артикул, класс защиты СИЗ", "Выдано", "", "", "", "Возвращено", "", "", "" },
            new[] { "", "", "дата", "количество", "Лично/дозатор", "Подпись получившего СИЗ", "дата", "количество", "Подпись сдавшего СИЗ", "Акт списания (дата, номер)" },
            new[] { "1", "2", "3", "4", "5", "6", "7", "8", "9", "10" }
        };

        rows.AddRange(lines.Select(line => new[]
        {
            line.ItemName,
            string.IsNullOrWhiteSpace(line.Model) ? "-" : line.Model,
            string.IsNullOrWhiteSpace(line.IssuedAt) ? "-" : line.IssuedAt,
            $"{line.Quantity:0.###} {line.Unit}",
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
        if (!string.IsNullOrWhiteSpace(line.IssuePeriodText))
        {
            return line.IssuePeriodText;
        }

        var unit = string.IsNullOrWhiteSpace(line.Unit) ? "шт." : line.Unit;
        if (!string.IsNullOrWhiteSpace(line.DueAt))
        {
            return $"{unit}, до {line.DueAt}";
        }

        return line.LifeMonths is > 0 ? $"{unit}, {FormatIssuePeriodText(line.LifeMonths)}" : $"{unit}, по сроку носки";
    }

    private static string FormatIssuePeriodText(int? lifeMonths) => lifeMonths switch
    {
        6 => "0,5 года",
        12 => "1 год",
        18 => "1,5 года",
        24 => "2 года",
        30 => "2,5 года",
        36 => "3 года",
        > 0 => $"на {lifeMonths.Value} мес.",
        _ => "по сроку носки"
    };

    private static bool IsConsumable(PpePrintLine line) =>
        line.LifeMonths is null or <= 0 && string.IsNullOrWhiteSpace(line.DueAt);

    private static string BuildEmployeeDetailsText(PpeEmployeePrintDetails details) =>
        $"Пол {PrintDetailValue(details.Gender)}\nРост {PrintDetailValue(details.Height)}\nРазмер одежды {PrintDetailValue(details.ClothingSize)}\nРазмер обуви {PrintDetailValue(details.ShoeSize)}\nРазмер головного убора {PrintDetailValue(details.HeadSize)}\nСИЗОД {PrintDetailValue(details.RespiratorSize)}\nСИЗ рук {PrintDetailValue(details.HandProtectionSize)}";

    private static string PrintDetailValue(string value) => string.IsNullOrWhiteSpace(value) ? "____" : value.Trim();

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
                builder.Append("<w:tc><w:tcPr><w:tcW w:w=\"2400\" w:type=\"dxa\"/><w:tcMar><w:top w:w=\"40\" w:type=\"dxa\"/><w:left w:w=\"60\" w:type=\"dxa\"/><w:bottom w:w=\"40\" w:type=\"dxa\"/><w:right w:w=\"60\" w:type=\"dxa\"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr><w:r>");
                AppendRunProperties(builder, rowIndex < headerRows, BodyFontSize);
                AppendTextWithBreaks(builder, cell);
                builder.Append("</w:r></w:p></w:tc>");
            }

            builder.Append("</w:tr>");
        }

        builder.Append("</w:tbl>");
    }

    private static void AppendTextWithBreaks(StringBuilder builder, string value)
    {
        var parts = value.Replace("\r\n", "\n").Split('\n');
        for (var index = 0; index < parts.Length; index++)
        {
            if (index > 0)
            {
                builder.Append("<w:br/>");
            }

            builder.Append($"<w:t xml:space=\"preserve\">{Xml(parts[index])}</w:t>");
        }
    }

    private static void AppendSection(StringBuilder builder, bool landscape)
    {
        var pageSize = landscape
            ? "<w:pgSz w:w=\"16838\" w:h=\"11906\" w:orient=\"landscape\"/>"
            : "<w:pgSz w:w=\"11906\" w:h=\"16838\"/>";
        builder.Append($"<w:sectPr>{pageSize}<w:pgMar w:top=\"720\" w:right=\"720\" w:bottom=\"720\" w:left=\"720\"/></w:sectPr></w:body></w:document>");
    }

    private static void AppendParagraph(StringBuilder builder, string text, bool bold, bool center = false, int fontSize = BodyFontSize)
    {
        builder.Append("<w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/>");
        if (center)
        {
            builder.Append("<w:jc w:val=\"center\"/>");
        }

        builder.Append("</w:pPr>");
        builder.Append("<w:r>");
        AppendRunProperties(builder, bold, fontSize);
        builder.Append($"<w:t xml:space=\"preserve\">{Xml(text)}</w:t></w:r></w:p>");
    }

    private static void AppendRunProperties(StringBuilder builder, bool bold, int fontSize)
    {
        builder.Append($"<w:rPr><w:rFonts w:ascii=\"{WordFont}\" w:hAnsi=\"{WordFont}\" w:cs=\"{WordFont}\"/><w:sz w:val=\"{fontSize}\"/><w:szCs w:val=\"{fontSize}\"/>");
        if (bold)
        {
            builder.Append("<w:b/>");
        }

        builder.Append("</w:rPr>");
    }

    private static string Xml(string value) => SecurityElement.Escape(value) ?? string.Empty;

    private static void Add(ZipArchive archive, string path, string content)
    {
        var entry = archive.CreateEntry(path, CompressionLevel.Fastest);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
        writer.Write(content.Trim());
    }
}

internal static class PpeTemplateDocumentBuilder
{
    private const string PersonalCardTemplate = "PpePersonalCard.docx";
    private const string SignatureSheetTemplate = "PpeSignatureSheet.docx";

    public static byte[] BuildPersonalCard(
        Guid cardId,
        string employeeName,
        string personnelNo,
        string department,
        string position,
        DateTimeOffset createdAt,
        PpeEmployeePrintDetails employeeDetails,
        IReadOnlyList<PpePrintLine> lines)
    {
        var template = TemplatePath(PersonalCardTemplate);
        if (!File.Exists(template))
        {
            return WordDocumentBuilder.BuildPpePersonalCard(cardId, employeeName, personnelNo, department, position, createdAt, employeeDetails, lines);
        }

        using var stream = OpenTemplateStream(template);
        using (var document = WordprocessingDocument.Open(stream, true))
        {
            var mainPart = document.MainDocumentPart ?? throw new InvalidOperationException("DOCX template does not contain a main document part.");
            var wordDocument = mainPart.Document ?? throw new InvalidOperationException("DOCX template does not contain a document.");
            var body = wordDocument.Body ?? throw new InvalidOperationException("DOCX template does not contain a document body.");
            var tables = body.Descendants<Table>().ToList();
            if (tables.Count < 2)
            {
                return WordDocumentBuilder.BuildPpePersonalCard(cardId, employeeName, personnelNo, department, position, createdAt, employeeDetails, lines);
            }

            SetFirstParagraphContaining(body, "ЛИЧНАЯ КАРТОЧКА", $"ЛИЧНАЯ КАРТОЧКА № СИЗ-{cardId.ToString("N")[..8]}");
            SetFirstParagraphContaining(body, "УЧЕТА ВЫДАЧИ СИЗ", "УЧЕТА ВЫДАЧИ СИЗ");
            FillPersonalInfoTable(tables[0], employeeName, personnelNo, department, position, createdAt, employeeDetails);
            FillPersonalLinesTable(tables[1], lines);
            wordDocument.Save();
        }

        return stream.ToArray();
    }

    public static byte[] BuildSignatureSheet(
        string employeeName,
        string personnelNo,
        string position,
        DateTimeOffset createdAt,
        IReadOnlyList<PpePrintLine> lines)
    {
        var template = TemplatePath(SignatureSheetTemplate);
        if (!File.Exists(template))
        {
            return WordDocumentBuilder.BuildPpeSignatureSheet(employeeName, personnelNo, position, createdAt, lines);
        }

        using var stream = OpenTemplateStream(template);
        using (var document = WordprocessingDocument.Open(stream, true))
        {
            var mainPart = document.MainDocumentPart ?? throw new InvalidOperationException("DOCX template does not contain a main document part.");
            var wordDocument = mainPart.Document ?? throw new InvalidOperationException("DOCX template does not contain a document.");
            var body = wordDocument.Body ?? throw new InvalidOperationException("DOCX template does not contain a document body.");
            var table = body.Descendants<Table>().FirstOrDefault();
            if (table is null)
            {
                return WordDocumentBuilder.BuildPpeSignatureSheet(employeeName, personnelNo, position, createdAt, lines);
            }

            FillSignatureLinesTable(table, lines);
            wordDocument.Save();
        }

        return stream.ToArray();
    }

    private static void FillPersonalInfoTable(
        Table table,
        string employeeName,
        string personnelNo,
        string department,
        string position,
        DateTimeOffset createdAt,
        PpeEmployeePrintDetails employeeDetails)
    {
        var cells = table.Descendants<TableCell>().Take(2).ToList();
        if (cells.Count < 2)
        {
            return;
        }

        var (lastName, restName) = SplitEmployeeName(employeeName);
        SetCellText(cells[0],
            $"Фамилия {lastName}\nИмя {restName}\nТабельный номер {personnelNo}\nСтруктурное подразделение {department}\nПрофессия (должность) {position}\nДата поступления на работу _________________\nДата изменения профессии (должности) или перевода в другое структурное подразделение _________________");
        SetCellText(cells[1], BuildEmployeeDetailsText(employeeDetails));
    }

    private static string BuildEmployeeDetailsText(PpeEmployeePrintDetails details) =>
        $"Пол {PrintDetailValue(details.Gender)}\nРост {PrintDetailValue(details.Height)}\nРазмер одежды {PrintDetailValue(details.ClothingSize)}\nРазмер обуви {PrintDetailValue(details.ShoeSize)}\nРазмер головного убора {PrintDetailValue(details.HeadSize)}\nСИЗОД {PrintDetailValue(details.RespiratorSize)}\nСИЗ рук {PrintDetailValue(details.HandProtectionSize)}";

    private static string PrintDetailValue(string value) => string.IsNullOrWhiteSpace(value) ? "____" : value.Trim();

    private static MemoryStream OpenTemplateStream(string templatePath)
    {
        var bytes = File.ReadAllBytes(templatePath);
        var stream = new MemoryStream();
        stream.Write(bytes, 0, bytes.Length);
        stream.Position = 0;
        return stream;
    }

    private static void FillPersonalLinesTable(Table table, IReadOnlyList<PpePrintLine> lines)
    {
        var rows = table.Elements<TableRow>().ToList();
        if (rows.Count == 0)
        {
            return;
        }

        var templateRow = (TableRow)(rows.Count > 1 ? rows[1] : rows[0]).CloneNode(true);
        foreach (var row in rows.Skip(1).ToList())
        {
            row.Remove();
        }

        foreach (var line in lines)
        {
            var row = (TableRow)templateRow.CloneNode(true);
            SetRowCells(row, [
                line.ItemName,
                string.IsNullOrWhiteSpace(line.NormPoint) ? "п. 1645 Приложения № 1" : line.NormPoint,
                PeriodText(line),
                $"{line.Quantity:0.###} {line.Unit}"
            ]);
            table.Append(row);
        }

        if (lines.Count == 0)
        {
            var row = (TableRow)templateRow.CloneNode(true);
            SetRowCells(row, ["Позиции СИЗ не добавлены", "", "", ""]);
            table.Append(row);
        }
    }

    private static void FillSignatureLinesTable(Table table, IReadOnlyList<PpePrintLine> lines)
    {
        var rows = table.Elements<TableRow>().ToList();
        if (rows.Count < 3)
        {
            return;
        }

        var templateRow = (TableRow)(rows.Count > 3 ? rows[3] : rows[2]).CloneNode(true);
        foreach (var row in rows.Skip(3).ToList())
        {
            row.Remove();
        }

        foreach (var line in lines)
        {
            var row = (TableRow)templateRow.CloneNode(true);
            SetRowCells(row, [
                line.ItemName,
                string.IsNullOrWhiteSpace(line.Model) ? "-" : line.Model,
                string.IsNullOrWhiteSpace(line.IssuedAt) ? "-" : line.IssuedAt,
                $"{line.Quantity:0.###} {line.Unit}",
                IsConsumable(line) ? "Дозатор" : "-",
                "",
                "",
                "",
                "",
                ""
            ]);
            table.Append(row);
        }

        if (lines.Count == 0)
        {
            var row = (TableRow)templateRow.CloneNode(true);
            SetRowCells(row, ["Позиции СИЗ не добавлены", "", "", "", "", "", "", "", "", ""]);
            table.Append(row);
        }
    }

    private static void SetRowCells(TableRow row, IReadOnlyList<string> values)
    {
        var cells = row.Elements<TableCell>().ToList();
        while (cells.Count < values.Count)
        {
            var cell = new TableCell(new Paragraph());
            row.Append(cell);
            cells.Add(cell);
        }

        for (var index = 0; index < values.Count; index++)
        {
            SetCellText(cells[index], values[index]);
        }
    }

    private static void SetCellText(TableCell cell, string value)
    {
        var templateParagraph = cell.Elements<Paragraph>().FirstOrDefault();
        var paragraphProperties = templateParagraph?.ParagraphProperties?.CloneNode(true) as ParagraphProperties;
        var runProperties = templateParagraph?
            .Descendants<RunProperties>()
            .FirstOrDefault()?
            .CloneNode(true) as RunProperties;

        cell.RemoveAllChildren<Paragraph>();
        foreach (var line in value.Replace("\r\n", "\n").Split('\n'))
        {
            var run = new Run(new Text(line) { Space = SpaceProcessingModeValues.Preserve });
            if (runProperties is not null)
            {
                run.PrependChild((RunProperties)runProperties.CloneNode(true));
            }

            var paragraph = new Paragraph();
            if (paragraphProperties is not null)
            {
                paragraph.PrependChild((ParagraphProperties)paragraphProperties.CloneNode(true));
            }

            paragraph.Append(run);
            cell.Append(paragraph);
        }
    }

    private static void SetFirstParagraphContaining(Body body, string marker, string value)
    {
        var paragraph = body.Descendants<Paragraph>()
            .FirstOrDefault(row => row.InnerText.Contains(marker, StringComparison.OrdinalIgnoreCase));
        if (paragraph is null)
        {
            return;
        }

        SetParagraphText(paragraph, value, bold: true, center: true);
    }

    private static void InsertParagraphBefore(OpenXmlElement element, string value, bool bold, bool center = false)
    {
        element.InsertBeforeSelf(CreateParagraph(value, bold, center));
    }

    private static void InsertParagraphAfter(OpenXmlElement element, string value, bool bold, bool center = false)
    {
        element.InsertAfterSelf(CreateParagraph(value, bold, center));
    }

    private static void SetParagraphText(Paragraph paragraph, string value, bool bold, bool center)
    {
        paragraph.RemoveAllChildren<Run>();
        if (center)
        {
            paragraph.ParagraphProperties ??= new ParagraphProperties();
            paragraph.ParagraphProperties.Justification = new Justification { Val = JustificationValues.Center };
        }

        paragraph.Append(CreateRun(value, bold));
    }

    private static Paragraph CreateParagraph(string value, bool bold, bool center)
    {
        var paragraph = new Paragraph();
        if (center)
        {
            paragraph.ParagraphProperties = new ParagraphProperties(new Justification { Val = JustificationValues.Center });
        }

        paragraph.Append(CreateRun(value, bold));
        return paragraph;
    }

    private static Run CreateRun(string value, bool bold)
    {
        var run = new Run();
        if (bold)
        {
            run.RunProperties = new RunProperties(new Bold());
        }

        var parts = value.Replace("\r\n", "\n").Split('\n');
        for (var index = 0; index < parts.Length; index++)
        {
            if (index > 0)
            {
                run.Append(new Break());
            }

            run.Append(new Text(parts[index]) { Space = SpaceProcessingModeValues.Preserve });
        }

        return run;
    }

    private static string PeriodText(PpePrintLine line)
    {
        if (!string.IsNullOrWhiteSpace(line.IssuePeriodText))
        {
            return line.IssuePeriodText;
        }

        var unit = string.IsNullOrWhiteSpace(line.Unit) ? "шт." : line.Unit;
        if (!string.IsNullOrWhiteSpace(line.DueAt))
        {
            return $"{unit}, до {line.DueAt}";
        }

        return line.LifeMonths is > 0 ? $"{unit}, {FormatIssuePeriodText(line.LifeMonths)}" : $"{unit}, по сроку носки";
    }

    private static string FormatIssuePeriodText(int? lifeMonths) => lifeMonths switch
    {
        6 => "0,5 года",
        12 => "1 год",
        18 => "1,5 года",
        24 => "2 года",
        30 => "2,5 года",
        36 => "3 года",
        > 0 => $"на {lifeMonths.Value} мес.",
        _ => "по сроку носки"
    };

    private static bool IsConsumable(PpePrintLine line) =>
        line.LifeMonths is null or <= 0 && string.IsNullOrWhiteSpace(line.DueAt);

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

    private static string TemplatePath(string fileName) =>
        Path.Combine(AppContext.BaseDirectory, "Persistence", "Templates", "Inventory", fileName);
}
internal static class SimplePdfBuilder
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

using System.Globalization;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence.Inventory;

internal static class PpeIssueDocumentDocxBuilder
{
    internal const string TemplateVersion = "ppe-issue-v1";
    private const string Font = "Liberation Serif";

    public static byte[] Build(PpeIssueDocumentDto document, string type)
    {
        using var stream = new MemoryStream();
        using (var package = WordprocessingDocument.Create(stream, WordprocessingDocumentType.Document, true))
        {
            var main = package.AddMainDocumentPart();
            main.Document = new Document(new Body());
            var body = main.Document.Body!;
            var headerReference = AddHeader(main, document, type);
            AddEmployeeHeader(body, document, type == "signature");
            if (type == "signature") AddSignature(body, document);
            else AddNorms(body, document);
            body.Append(PageSetup(type == "signature", headerReference));
            main.Document.Save();
        }

        return stream.ToArray();
    }

    private static HeaderReference AddHeader(MainDocumentPart main, PpeIssueDocumentDto document, string type)
    {
        var header = main.AddNewPart<HeaderPart>();
        var status = IsDraft(document) ? "ПЛАНОВЫЙ ДОКУМЕНТ - НЕ ПОДТВЕРЖДАЕТ ПОЛУЧЕНИЕ" : "ПОДТВЕРЖДЕННЫЙ ДОКУМЕНТ";
        header.Header = new Header(ParagraphText(
            $"{status} | {document.Content.Employee.PersonnelNo} | {document.Content.DocumentDate:dd.MM.yyyy}",
            16, false, JustificationValues.Right));
        header.Header.Save();
        return new HeaderReference { Type = HeaderFooterValues.Default, Id = main.GetIdOfPart(header) };
    }

    private static void AddEmployeeHeader(Body body, PpeIssueDocumentDto document, bool landscape)
    {
        var content = document.Content;
        body.Append(ParagraphText("ВЫБРАННЫЕ СИЗ ДЛЯ ВЫДАЧИ", 28, true, JustificationValues.Center));
        body.Append(ParagraphText(IsDraft(document) ? "Планируемая выдача. Получение сотрудником не подтверждено." : "Подтвержденная выдача СИЗ", 20, true, JustificationValues.Center));

        var employee = content.Employee;
        var details = employee.Details;
        var table = NewTable(landscape ? [7700, 7700] : [4600, 4600]);
        AddRow(table, [
            $"Сотрудник: {employee.FullName}\nТабельный номер: {employee.PersonnelNo}\nПодразделение: {employee.Department}\nДолжность: {employee.Position}",
            $"Пол: {Blank(details.Gender)}\nРост: {Blank(details.Height)}\nРазмер одежды: {Blank(details.ClothingSize)}\nОбувь: {Blank(details.ShoeSize)}\nГоловной убор: {Blank(details.HeadSize)}\nСИЗОД: {Blank(details.RespiratorSize)}\nСИЗ рук: {Blank(details.HandProtectionSize)}"
        ], false, 18);
        body.Append(table);
        body.Append(ParagraphText($"Основание: {Blank(content.Basis)}", 18));
        body.Append(ParagraphText($"Ответственное лицо: {Blank(content.ResponsibleName)}", 18));
        body.Append(ParagraphText($"Нормы: {content.NormSourceName} / {content.NormVersionName}", 16));
    }

    private static void AddNorms(Body body, PpeIssueDocumentDto document)
    {
        body.Append(ParagraphText("Нормы и выбранная номенклатура", 22, true));
        var table = NewTable([500, 2100, 1100, 1450, 1100, 900, 1100, 1050]);
        AddRow(table, ["№", "Наименование по нормам", "Пункт", "Периодичность", "Кол-во по норме", "Выбрано", "Цена", "Сумма"], true, 15, repeatHeader: true);
        var linesByNorm = document.Content.Lines
            .Select((line, index) => (line, index))
            .GroupBy(x => x.line.NormRowId)
            .ToDictionary(x => x.Key, x => x.ToList());
        var includedNormIds = SelectedNormsAndParentGroups(document.Content.NormRows, linesByNorm.Keys);
        var number = 1;
        foreach (var norm in document.Content.NormRows.Where(x => includedNormIds.Contains(x.Id)).OrderBy(x => x.SortOrder).ThenBy(x => x.Id))
        {
            if (string.Equals(norm.RowType, "group", StringComparison.OrdinalIgnoreCase))
            {
                AddRow(table, [norm.NormItemName, "", "", "", "", "", "", ""], true, 15, mergeAll: true);
                continue;
            }

            AddRow(table, [number++.ToString(CultureInfo.InvariantCulture), norm.NormItemName, norm.NormPoint, norm.IssuePeriodText,
                Quantity(norm.Quantity, norm.UnitSymbol), "", "", ""], false, 15);
            if (!linesByNorm.TryGetValue(norm.Id, out var selected)) continue;
            foreach (var item in selected)
            {
                AddCatalogLine(table, item.line, 15);
            }
        }

        body.Append(table);
        var hasUnknown = document.Content.Lines.Any(x => !x.UnitPriceMinor.HasValue || !x.TotalMinor.HasValue);
        var total = document.Validation.TotalMinor;
        var totalText = total.HasValue ? $"Итого: {Money(total.Value)}" : "Итого: не рассчитано";
        body.Append(ParagraphText(totalText + (hasUnknown ? ". Не все цены указаны." : string.Empty), 18, true));
    }

    private static void AddCatalogLine(Table table, PpeDocumentLineDto line, int fontSize)
    {
        AddSpannedRow(table, [
            ("", 1),
            (CatalogLineDescription(line), 4),
            (Quantity(line.Quantity, line.UnitSymbol), 1),
            (Price(line.UnitPriceMinor), 1),
            (Price(line.TotalMinor), 1)
        ], false, fontSize);
    }

    private static void AddSignature(Body body, PpeIssueDocumentDto document)
    {
        body.Append(ParagraphText("ЛИСТ ПОДПИСИ ПОЛУЧЕНИЯ СИЗ", 22, true, JustificationValues.Center));
        body.Append(ParagraphText(IsDraft(document) ? "Планируемая выдача. Поля подписи оставлены пустыми." : "", 16, true, JustificationValues.Center));
        var table = NewTable([2600, 2400, 1050, 800, 1050, 2200, 1050, 800, 2000, 1450]);
        AddSpannedRow(table, [
            ("Наименование СИЗ", 1),
            ("Модель, марка, артикул, класс защиты", 1),
            ("Выдано", 4),
            ("Возвращено", 4)
        ], true, 16, repeatHeader: true);
        AddRow(table, ["", "", "дата", "кол-во", "лично / дозатор", "подпись получившего", "дата", "кол-во", "подпись сдавшего", "акт списания"], true, 16, repeatHeader: true);
        AddRow(table, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], true, 16, repeatHeader: true);
        foreach (var line in document.Content.Lines.Select((line, index) => (line, index)).OrderBy(x => x.line.IssueDate).ThenBy(x => x.index).Select(x => x.line))
        {
            AddRow(table, [line.ItemName, line.BrandModelArticle, line.IssueDate.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture),
                Quantity(line.Quantity, line.UnitSymbol), "Лично", "", "", "", "", ""], false, 16);
        }
        body.Append(table);
    }

    private static Table NewTable(int[] widths)
    {
        var table = new Table(new TableProperties(
            new TableWidth { Width = "0", Type = TableWidthUnitValues.Auto },
            new TableLayout { Type = TableLayoutValues.Fixed },
            new TableBorders(
                new TopBorder { Val = BorderValues.Single, Size = 6 }, new BottomBorder { Val = BorderValues.Single, Size = 6 },
                new LeftBorder { Val = BorderValues.Single, Size = 6 }, new RightBorder { Val = BorderValues.Single, Size = 6 },
                new InsideHorizontalBorder { Val = BorderValues.Single, Size = 4 }, new InsideVerticalBorder { Val = BorderValues.Single, Size = 4 })));
        table.Append(new TableGrid(widths.Select(x => new GridColumn { Width = x.ToString(CultureInfo.InvariantCulture) })));
        return table;
    }

    private static void AddRow(Table table, IReadOnlyList<string> values, bool header, int fontSize, bool mergeAll = false, bool repeatHeader = false)
    {
        var row = new TableRow();
        var rowProperties = new TableRowProperties(new CantSplit());
        if (repeatHeader) rowProperties.Append(new TableHeader());
        row.Append(rowProperties);
        for (var index = 0; index < values.Count; index++)
        {
            if (mergeAll && index > 0) continue;
            var properties = new TableCellProperties(new TableCellVerticalAlignment { Val = TableVerticalAlignmentValues.Center });
            if (mergeAll) properties.Append(new GridSpan { Val = values.Count });
            if (header) properties.Append(new Shading { Val = ShadingPatternValues.Clear, Fill = "D9E2F3" });
            properties.Append(new TableCellMargin(
                new TopMargin { Width = "60", Type = TableWidthUnitValues.Dxa }, new BottomMargin { Width = "60", Type = TableWidthUnitValues.Dxa },
                new StartMargin { Width = "70", Type = TableWidthUnitValues.Dxa }, new EndMargin { Width = "70", Type = TableWidthUnitValues.Dxa }));
            row.Append(new TableCell(properties, ParagraphText(values[index], fontSize, header, header ? JustificationValues.Center : null)));
        }
        table.Append(row);
    }

    private static void AddSpannedRow(Table table, IReadOnlyList<(string Value, int Span)> values, bool header, int fontSize, bool repeatHeader = false)
    {
        var row = new TableRow();
        var rowProperties = new TableRowProperties(new CantSplit());
        if (repeatHeader) rowProperties.Append(new TableHeader());
        row.Append(rowProperties);
        foreach (var (value, span) in values)
        {
            var properties = new TableCellProperties(new TableCellVerticalAlignment { Val = TableVerticalAlignmentValues.Center });
            if (span > 1) properties.Append(new GridSpan { Val = span });
            if (header) properties.Append(new Shading { Val = ShadingPatternValues.Clear, Fill = "D9E2F3" });
            properties.Append(new TableCellMargin(
                new TopMargin { Width = "60", Type = TableWidthUnitValues.Dxa }, new BottomMargin { Width = "60", Type = TableWidthUnitValues.Dxa },
                new StartMargin { Width = "70", Type = TableWidthUnitValues.Dxa }, new EndMargin { Width = "70", Type = TableWidthUnitValues.Dxa }));
            row.Append(new TableCell(properties, ParagraphText(value, fontSize, header, header ? JustificationValues.Center : null)));
        }
        table.Append(row);
    }

    private static Paragraph ParagraphText(string value, int size, bool bold = false, JustificationValues? alignment = null)
    {
        var properties = new ParagraphProperties(new SpacingBetweenLines { After = "60", Before = "0", Line = "220", LineRule = LineSpacingRuleValues.Auto });
        if (alignment.HasValue) properties.Append(new Justification { Val = alignment.Value });
        var paragraph = new Paragraph(properties);
        var segments = value.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        for (var index = 0; index < segments.Length; index++)
        {
            if (index > 0) paragraph.Append(new Run(new Break()));
            var runProperties = new RunProperties(new RunFonts { Ascii = Font, HighAnsi = Font, ComplexScript = Font }, new FontSize { Val = size.ToString(CultureInfo.InvariantCulture) }, new FontSizeComplexScript { Val = size.ToString(CultureInfo.InvariantCulture) });
            if (bold) runProperties.Append(new Bold());
            paragraph.Append(new Run(runProperties, new Text(segments[index]) { Space = SpaceProcessingModeValues.Preserve }));
        }
        return paragraph;
    }

    private static SectionProperties PageSetup(bool landscape, HeaderReference headerReference) => new(
        headerReference,
        new PageSize { Width = landscape ? (UInt32Value)16838U : 11906U, Height = landscape ? (UInt32Value)11906U : 16838U, Orient = landscape ? PageOrientationValues.Landscape : PageOrientationValues.Portrait },
        new PageMargin { Top = 720, Right = 720, Bottom = 720, Left = 720, Header = 360, Footer = 360, Gutter = 0 });

    private static bool IsDraft(PpeIssueDocumentDto document) => !string.Equals(document.Status, "confirmed", StringComparison.OrdinalIgnoreCase);
    private static string Blank(string value) => string.IsNullOrWhiteSpace(value) ? "не указано" : value.Trim();
    private static HashSet<Guid> SelectedNormsAndParentGroups(IReadOnlyList<PpeDocumentNormDto> normRows, IEnumerable<Guid> selectedNormIds)
    {
        var byId = normRows.ToDictionary(x => x.Id);
        var result = new HashSet<Guid>();
        foreach (var selectedId in selectedNormIds)
        {
            var currentId = selectedId;
            while (byId.TryGetValue(currentId, out var row) && result.Add(currentId) && row.ParentRowId.HasValue)
            {
                currentId = row.ParentRowId.Value;
            }
        }
        return result;
    }

    private static string CatalogLineDescription(PpeDocumentLineDto line)
    {
        var parts = new List<string> { "  " + line.ItemName, $"дата выдачи {line.IssueDate:dd.MM.yyyy}" };
        if (!string.IsNullOrWhiteSpace(line.BrandModelArticle)) parts.Add(line.BrandModelArticle.Trim());
        if (!string.IsNullOrWhiteSpace(line.SizeText)) parts.Add("размер " + line.SizeText.Trim());
        return string.Join("; ", parts);
    }
    private static string Quantity(decimal value, string unit) => $"{value:0.###} {Blank(unit)}";
    private static string Price(long? value) => value is null ? "не указана" : Money(value.Value);
    private static string Money(long value) => (value / 100m).ToString("N2", CultureInfo.GetCultureInfo("ru-RU")) + " руб.";
}

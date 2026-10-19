using System.Globalization;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence.Inventory;

internal static partial class PpeIssueDocumentDocxBuilder
{
    internal const string TemplateVersion = "ppe-issue-v3-standards-combined";
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
            if (type != "signature")
            {
                AddPersonalCardHeader(body, document);
                AddNorms(body, document);
            }
            if (type == "both")
            {
                body.Append(SectionBreak(false, headerReference));
                AddSignature(body, document);
            }
            else if (type == "signature") AddSignature(body, document);
            body.Append(PageSetup(type is "signature" or "both", headerReference));
            main.Document.Save();
        }

        return stream.ToArray();
    }

    private static HeaderReference AddHeader(MainDocumentPart main, PpeIssueDocumentDto document, string type)
    {
        var header = main.AddNewPart<HeaderPart>();
        var status = IsDraft(document) ? "ПЛАНОВЫЙ ДОКУМЕНТ - НЕ ПОДТВЕРЖДАЕТ ПОЛУЧЕНИЕ" : "ПОДТВЕРЖДЕННЫЙ ДОКУМЕНТ";
        header.Header = new Header(ParagraphText(
            status,
            16, false, JustificationValues.Right));
        header.Header.Save();
        return new HeaderReference { Type = HeaderFooterValues.Default, Id = main.GetIdOfPart(header) };
    }

    private static void AddNorms(Body body, PpeIssueDocumentDto document)
    {
        var table = NewTable([4900, 1500, 1700, 1600]);
        AddRow(table, ["Наименование СИЗ", "Пункт норм", "Единица измерения, периодичность выдачи", "Количество на период"], true, 20, repeatHeader: true);
        var ids = SelectedNormsAndParentGroups(document.Content.NormRows, document.Content.Lines.Select(x => x.NormRowId));
        foreach (var norm in document.Content.NormRows.Where(x => ids.Contains(x.Id)).OrderBy(x => x.SortOrder).ThenBy(x => x.Id))
        {
            if (norm.RowType == "group") AddRow(table, [norm.NormItemName, "", "", ""], true, 20, mergeAll: true);
            else AddRow(table, [norm.NormItemName, norm.NormPoint, norm.IssuePeriodText,
                string.IsNullOrWhiteSpace(norm.QuantityText) ? Quantity(norm.Quantity, norm.UnitSymbol) : norm.QuantityText], false, 20);
        }
        body.Append(table);
        body.Append(ParagraphText("", 20));
        body.Append(ParagraphText($"Ответственное лицо за ведение карточек учёта выдачи СИЗ: {document.Content.ResponsibleName}", 20));
        body.Append(ParagraphText("____________________                         ____________________\n          (подпись)                                                   (Ф.И.О.)", 18));
    }

    private static void AddSignature(Body body, PpeIssueDocumentDto document)
    {
        body.Append(ParagraphText("ВЫДАЧА, ВОЗВРАТ И ПОДПИСИ\nСРЕДСТВ ИНДИВИДУАЛЬНОЙ ЗАЩИТЫ", 22, true, JustificationValues.Center));

        var table = NewTable([2600, 2400, 1050, 800, 1050, 2200, 1050, 800, 2000, 1450]);
        AddSpannedRow(table, [
            ("Наименование СИЗ", 1),
            ("Модель, марка, артикул, класс защиты", 1),
            ("Выдано", 4),
            ("Возвращено", 3),
            ("Акт списания (дата, номер)", 1)
        ], true, 16, repeatHeader: true);
        AddRow(table, ["", "", "дата", "кол-во", "лично / дозатор", "подпись получившего", "дата", "кол-во", "подпись сдавшего", "акт списания"], true, 16, repeatHeader: true);
        AddRow(table, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], true, 16, repeatHeader: true);
        foreach (var line in document.Content.Lines.Select((line, index) => (line, index)).OrderBy(x => x.line.IssueDate).ThenBy(x => x.index).Select(x => x.line))
        {
            AddRow(table, [line.ItemName, CatalogProductDetails(line), line.IssueDate.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture),
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
        headerReference.CloneNode(true),
        new PageSize { Width = landscape ? (UInt32Value)16838U : 11906U, Height = landscape ? (UInt32Value)11906U : 16838U, Orient = landscape ? PageOrientationValues.Landscape : PageOrientationValues.Portrait },
        new PageMargin { Top = 720, Right = 720, Bottom = 720, Left = 720, Header = 360, Footer = 360, Gutter = 0 });

    private static Paragraph SectionBreak(bool landscape, HeaderReference headerReference)
    {
        var section = PageSetup(landscape, headerReference);
        section.Append(new SectionType { Val = SectionMarkValues.NextPage });
        return new Paragraph(new ParagraphProperties(section));
    }

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
    private static string CatalogProductDetails(PpeDocumentLineDto line) => string.Join("; ",
        new[] { line.BrandModelArticle, line.Standards is { Count: > 0 } ? string.Join(", ", line.Standards.Select(StandardText)) : "" }
            .Where(value => !string.IsNullOrWhiteSpace(value)));
    private static string StandardText(InventoryItemStandardDto standard) => string.IsNullOrWhiteSpace(standard.Name)
        ? standard.Designation : $"{standard.Designation} — {standard.Name}";
    private static string Quantity(decimal value, string unit) => $"{value:0.###} {Blank(unit)}";
    private static string Price(long? value) => value is null ? "не указана" : Money(value.Value);
    private static string Money(long value) => (value / 100m).ToString("N2", CultureInfo.GetCultureInfo("ru-RU")) + " руб.";
}

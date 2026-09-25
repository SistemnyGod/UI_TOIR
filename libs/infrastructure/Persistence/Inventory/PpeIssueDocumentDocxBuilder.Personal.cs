using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Wordprocessing;
using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence.Inventory;

internal static partial class PpeIssueDocumentDocxBuilder
{
    private static void AddPersonalCardHeader(Body body, PpeIssueDocumentDto document)
    {
        var employee = document.Content.Employee;
        var details = employee.Details;
        body.Append(ParagraphText("ЛИЧНАЯ КАРТОЧКА № ___\nУЧЁТА ВЫДАЧИ СИЗ", 28, true, JustificationValues.Center));
        var parts = employee.FullName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var left = new (string Label, string Value)[] {
            ("Фамилия", parts.ElementAtOrDefault(0) ?? ""), ("Имя", parts.ElementAtOrDefault(1) ?? ""),
            ("Отчество", string.Join(" ", parts.Skip(2))), ("Табельный номер", employee.PersonnelNo),
            ("Структурное подразделение", employee.Department), ("Профессия (должность)", employee.Position),
            ("Дата поступления на работу", employee.HiredAt?.ToString("dd.MM.yyyy") ?? ""),
            ("Дата изменения профессии / перевода", "") };
        var right = new (string Label, string Value)[] {
            ("Пол", details.Gender), ("Рост", details.Height), ("Размер одежды", details.ClothingSize),
            ("Размер обуви", details.ShoeSize), ("Головного убора", details.HeadSize),
            ("СИЗОД", details.RespiratorSize), ("СИЗ рук", details.HandProtectionSize) };
        var table = new Table(new TableProperties(new TableWidth { Width = "9700", Type = TableWidthUnitValues.Dxa }, new TableLayout { Type = TableLayoutValues.Fixed }),
            new TableGrid(new GridColumn { Width = "6100" }, new GridColumn { Width = "3600" }));
        var row = new TableRow();
        row.Append(new TableCell(Metadata(left, [2650, 3250]), new Paragraph()));
        row.Append(new TableCell(Metadata(right, [1800, 1700]), new Paragraph()));
        table.Append(row);
        body.Append(table);
        body.Append(ParagraphText(document.Content.Basis, 20));
        body.Append(ParagraphText($"{document.Content.NormSourceName} · {document.Content.NormVersionName}", 18));
    }

    private static Table Metadata((string Label, string Value)[] values, int[] widths)
    {
        var table = new Table(new TableProperties(new TableWidth { Width = widths.Sum().ToString(), Type = TableWidthUnitValues.Dxa }, new TableLayout { Type = TableLayoutValues.Fixed }),
            new TableGrid(widths.Select(width => new GridColumn { Width = width.ToString() })));
        foreach (var (label, value) in values)
        {
            var row = new TableRow(new TableRowProperties(new CantSplit()));
            row.Append(new TableCell(new TableCellProperties(new TableCellWidth { Width = widths[0].ToString(), Type = TableWidthUnitValues.Dxa }), ParagraphText(label, 20, true)));
            row.Append(new TableCell(new TableCellProperties(new TableCellWidth { Width = widths[1].ToString(), Type = TableWidthUnitValues.Dxa },
                new TableCellBorders(new BottomBorder { Val = BorderValues.Single, Size = 4 })), ParagraphText(string.IsNullOrWhiteSpace(value) ? " " : value, 20)));
            table.Append(row);
        }
        return table;
    }
}

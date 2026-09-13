using Patrol360.Contracts;

namespace Patrol360.Infrastructure.Persistence;

internal sealed record PpeHistoricalIssue(Guid RequirementKey, DateOnly Date, decimal Quantity);

internal static class PpeDocumentRules
{
    public static long? LineTotal(decimal quantity, long? price)
    {
        if (price is null || quantity <= 0 || price <= 0) return null;
        try { return checked((long)decimal.Round(quantity * price.Value, 0, MidpointRounding.AwayFromZero)); }
        catch (OverflowException) { return null; }
    }

    public static PpeDocumentValidationDto Validate(
        PpeDocumentContentDto content, IReadOnlyList<PpeHistoricalIssue> history,
        bool unknownHistory, DateOnly today, bool confirming)
    {
        var errors = new List<PpeDocumentProblemDto>();
        var warnings = new List<PpeDocumentProblemDto>();
        var entitlements = new List<PpeDocumentEntitlementDto>();
        if (string.IsNullOrWhiteSpace(content.ResponsibleName)) errors.Add(new(null, "responsible", "Укажите ответственное лицо"));
        if (string.IsNullOrWhiteSpace(content.Basis)) errors.Add(new(null, "basis", "Укажите основание выдачи"));
        if (content.Lines.Count == 0) errors.Add(new(null, "lines", "Выберите хотя бы одну позицию"));
        var norms = content.NormRows.ToDictionary(x => x.Id);
        var processed = new List<PpeHistoricalIssue>();
        foreach (var line in content.Lines.OrderBy(x => x.IssueDate))
        {
            if (!norms.TryGetValue(line.NormRowId, out var norm) || norm.RowType != "item")
            {
                errors.Add(new(line.Id, "norm", "Строка нормы не найдена"));
                continue;
            }
            var validQuantity = line.Quantity > 0 && line.Quantity <= 999999999m && decimal.Round(line.Quantity, 3) == line.Quantity;
            if (!validQuantity)
                errors.Add(new(line.Id, "quantity", "Количество должно быть положительным, не более 999999999 и с точностью до 0,001"));
            if (LineTotal(line.Quantity, line.UnitPriceMinor) is null)
                errors.Add(new(line.Id, "price", "Укажите положительную цену; сумма не должна превышать допустимый размер"));
            if (line.IssueDate == default) errors.Add(new(line.Id, "date", "Укажите дату выдачи"));
            if (line.IssueDate > today)
            {
                var problem = new PpeDocumentProblemDto(line.Id, "future_date", "Будущая дата: можно подготовить документы, но нельзя подтвердить получение заранее");
                if (confirming) errors.Add(problem); else warnings.Add(problem);
            }
            if (string.IsNullOrWhiteSpace(norm.NormPoint)) errors.Add(new(line.Id, "norm_basis", "В норме отсутствует пункт основания"));
            var validFactor = line.NormUnitsPerItem > 0 && line.NormUnitsPerItem <= 1000000m;
            if (string.IsNullOrWhiteSpace(norm.UnitSymbol) || !validFactor)
                errors.Add(new(line.Id, "unit", "Единица нормы или пересчёт не подтверждены"));
            if (!validQuantity || !validFactor) continue;

            var related = norm.AlternativeGroup.Length == 0
                ? new HashSet<Guid> { norm.RequirementKey }
                : content.NormRows.Where(x => x.AlternativeGroup == norm.AlternativeGroup).Select(x => x.RequirementKey).ToHashSet();
            DateOnly? from = null;
            if (norm.PeriodMonths is > 0 and <= 1200 && line.IssueDate.Year > 100)
            {
                try { from = line.IssueDate.AddMonths(-norm.PeriodMonths.Value); }
                catch (ArgumentOutOfRangeException) { /* Invalid date is exposed as manual control below. */ }
            }
            var manual = unknownHistory || from is null || norm.Quantity <= 0;
            if (manual)
            {
                warnings.Add(new(line.Id, "manual_control", unknownHistory
                    ? "Часть прошлых выдач не сопоставлена с нормами; обеспеченность неизвестна"
                    : "Для этой нормы требуется ручной контроль периода или количества"));
                if (!line.ManualControlConfirmed || string.IsNullOrWhiteSpace(line.ExceptionReason))
                    errors.Add(new(line.Id, "manual_confirmation", "Подтвердите ручной контроль и укажите причину"));
                entitlements.Add(new(line.Id, null, null, from, line.IssueDate, "manual_control_required"));
            }
            else
            {
                var issued = history.Where(x => related.Contains(x.RequirementKey) && x.Date > from && x.Date <= line.IssueDate).Sum(x => x.Quantity);
                var selected = processed.Where(x => related.Contains(x.RequirementKey) && x.Date > from && x.Date <= line.IssueDate).Sum(x => x.Quantity);
                var available = Math.Max(0, norm.Quantity - issued - selected);
                if (line.Quantity * line.NormUnitsPerItem > available)
                {
                    warnings.Add(new(line.Id, "over_norm", $"Превышение нормы или досрочная выдача: доступно {available:0.###} {norm.UnitSymbol}"));
                    if (string.IsNullOrWhiteSpace(line.ExceptionReason)) errors.Add(new(line.Id, "exception_reason", "Укажите причину превышения нормы или досрочной выдачи"));
                }
                entitlements.Add(new(line.Id, issued, available, from, line.IssueDate, "resolved"));
            }
            processed.Add(new(norm.RequirementKey, line.IssueDate, line.Quantity * line.NormUnitsPerItem));
        }
        long? total = null;
        try
        {
            if (content.Lines.Count > 0 && content.Lines.All(x => LineTotal(x.Quantity, x.UnitPriceMinor).HasValue))
                total = content.Lines.Sum(x => LineTotal(x.Quantity, x.UnitPriceMinor)!.Value);
        }
        catch (OverflowException) { errors.Add(new(null, "total", "Сумма документа слишком велика")); }
        return new(errors, warnings, entitlements, total);
    }
}

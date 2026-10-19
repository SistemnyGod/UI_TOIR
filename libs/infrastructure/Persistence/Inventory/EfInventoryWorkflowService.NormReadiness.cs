using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService
{
    private IQueryable<InventoryPpeNormSetEntity> NormsWithReadinessData() =>
        dbContext.InventoryPpeNormSets
            .Include(x => x.Rows).ThenInclude(x => x.Mappings).ThenInclude(x => x.Item).ThenInclude(x => x.Unit)
            .Include(x => x.Rows).ThenInclude(x => x.Mappings).ThenInclude(x => x.Item).ThenInclude(x => x.Category)
            .AsSplitQuery();

    private InventoryPpeNormSetDto MapReviewedNormSet(InventoryPpeNormSetEntity norm) =>
        MapNormSet(norm) with { Readiness = CheckNormReadiness(norm) };

    internal PpeNormReadinessDto CheckNormReadiness(InventoryPpeNormSetEntity norm)
    {
        var blockers = new List<PpeNormReadinessBlockerDto>();
        if (!norm.ScopeConfirmed || string.IsNullOrWhiteSpace(norm.DepartmentName) || ReadPositionAliases(norm.PositionAliasesJson).Count == 0)
            blockers.Add(new("scope", null, "Подтвердите подразделение и отдельные применимые должности."));
        if (!norm.EffectiveFrom.HasValue || norm.EffectiveTo < norm.EffectiveFrom)
            blockers.Add(new("dates", null, "Укажите начало действия и проверьте порядок дат нормы."));
        if (norm.ArchivedAt.HasValue || norm.Status == "archived")
            blockers.Add(new("archived", null, "Архивная редакция недоступна для новой выдачи."));
        var rows = norm.Rows.Where(x => x.RowType == "item").ToList();
        if (rows.Count == 0) blockers.Add(new("rows", null, "В норме нет товарных требований."));
        foreach (var row in rows)
        {
            if (string.IsNullOrWhiteSpace(row.NormItemName) || string.IsNullOrWhiteSpace(row.UnitSymbol) || row.Quantity <= 0 || row.Quantity > 999999999.999m
                || string.IsNullOrWhiteSpace(row.NormPoint)
                || row.PeriodMonths is <= 0 or > 1200 || row.LifeMonths is <= 0 or > 1200)
                blockers.Add(new("rules", row.Id, $"Строка {row.SortOrder + 1} «{row.NormItemName}»: проверьте наименование требования, количество, единицу, пункт нормы и сроки."));
        }
        // Alternatives are explicit, never inferred from names or categories.
        var requirements = rows.GroupBy(x => string.IsNullOrWhiteSpace(x.AlternativeGroup) ? $"row:{x.Id}" : $"alternative:{x.AlternativeGroup.Trim()}").ToList();
        var approved = 0;
        foreach (var requirement in requirements)
        {
            if (requirement.Any(row => row.Mappings.Any(mapping => mapping.ArchivedAt is null
                && mapping.IsApproved && mapping.NormUnitsPerItem > 0
                && !string.IsNullOrWhiteSpace(mapping.ApprovalEvidence)
                && mapping.Item is { IsActive: true } item && IsPpeCatalogItem(item)
                && !string.IsNullOrWhiteSpace(item.Unit?.Symbol)))) approved++;
            else foreach (var row in requirement)
                blockers.Add(new("mapping", row.Id, $"«{row.NormItemName}»: нет действующего утверждённого товара с единицей и основанием проверки."));
            var first = requirement.First();
            if (requirement.Any(row => row.Quantity != first.Quantity || row.PeriodMonths != first.PeriodMonths
                || NormalizePpeUnit(row.UnitSymbol) != NormalizePpeUnit(first.UnitSymbol)))
                blockers.Add(new("alternatives", first.Id, "У альтернатив должны совпадать количество, единица и период."));
        }
        return new(blockers.Count == 0, requirements.Count, approved, blockers);
    }
}

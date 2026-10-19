using System.Data;
using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService
{
    private sealed record LegacyPpeSelection(Guid CardNormRowId, Guid ItemId, DateTimeOffset IssuedAt,
        decimal Quantity, long? Price, string Size, string Method = "personal");

    // The old HTTP contracts cannot carry exception reasons or manual-control approval.
    // They may issue only a fully validated normal entitlement; exceptions use documents.
    private InventoryCommandResult<PpeDocumentContentDto> ValidateLegacyPpeIssuance(
        Guid cardId, IReadOnlyList<LegacyPpeSelection> selections, Guid? excludeLineId = null)
    {
        var card = dbContext.InventoryPpeCards.Include(x => x.Employee).Include(x => x.NormRows)
            .FirstOrDefault(x => x.Id == cardId && x.ArchivedAt == null);
        if (card?.NormSetId is null || NormalizeInventoryEmployeeStatus(card.Employee.Status) != "active")
            return Failure<PpeDocumentContentDto>("norm", "Выберите действующего сотрудника и привяжите карточку к применимой норме");
        var norm = LoadDocumentNorm(card.NormSetId.Value);
        if (norm is null || norm.Status != "active" || norm.ArchivedAt != null || norm.RequiresReview
            || !PpeScopeMatches(norm, card.Employee) || !CheckNormReadiness(norm).IsReady)
            return Failure<PpeDocumentContentDto>("norm", "Норма не готова к выдаче или не применима к сотруднику");
        var lines = new List<PpeDocumentLineDto>();
        foreach (var selection in selections)
        {
            var cardRow = card.NormRows.FirstOrDefault(x => x.Id == selection.CardNormRowId);
            var row = norm.Rows.FirstOrDefault(x => x.Id == cardRow?.SourceNormRowId && x.RowType == "item");
            var mapping = row?.Mappings.FirstOrDefault(x => x.ItemId == selection.ItemId && x.IsApproved && x.ArchivedAt == null);
            if (row is null || mapping is null || mapping.NormUnitsPerItem <= 0 || string.IsNullOrWhiteSpace(mapping.ApprovalEvidence))
                return Failure<PpeDocumentContentDto>("mapping", "Выберите утверждённый товар из строки применимой нормы");
            var item = mapping.Item;
            if (!item.IsActive || !IsPpeCatalogItem(item))
                return Failure<PpeDocumentContentDto>("itemId", "Номенклатура СИЗ недоступна");
            if (selection.Method is not ("personal" or "dispenser"))
                return Failure<PpeDocumentContentDto>("issueMethod", "Недопустимый способ выдачи СИЗ");
            if (selection.Size.Length > 120)
                return Failure<PpeDocumentContentDto>("size", "Размер СИЗ: не более 120 символов");
            var date = PpeClock.GetDate(selection.IssuedAt);
            var price = selection.Price ?? mapping.DefaultUnitPriceMinor ?? item.DefaultUnitPriceMinor;
            lines.Add(new(Guid.NewGuid(), row.Id, item.Id, date, selection.Quantity, price, selection.Size, "", false,
                item.Name, item.Unit?.Symbol ?? "", mapping.BrandModelArticle, mapping.NormUnitsPerItem,
                PpeDocumentRules.LineTotal(selection.Quantity, price), row.LifeMonths));
        }
        var content = new PpeDocumentContentDto(new(card.Employee.Id, card.Employee.FullName, card.Employee.PersonnelNo,
                card.Employee.Department, card.Employee.Position, new()), norm.Id, norm.Version, norm.VersionName,
            norm.SourceName, lines.FirstOrDefault()?.IssueDate ?? PpeClock.Today, card.ResponsibleName, card.Basis,
            norm.Rows.Select(x => new PpeDocumentNormDto(x.Id, x.ParentRowId, x.RowType, x.SortOrder, x.NormItemName,
                x.NormPoint, x.Quantity, x.UnitSymbol, x.QuantityText, x.IssuePeriodText, x.PeriodMonths,
                x.LifeMonths, x.RequirementKey, x.AlternativeGroup)).ToList(), lines);
        var validation = ValidateDocumentContent(content, true, excludeLineId);
        // Legacy cards do not require the document's cover-page fields.
        var errors = validation.Errors.Where(x => x.Code is not ("responsible" or "basis"))
            .GroupBy(x => x.Code).ToDictionary(x => x.Key, x => x.Select(y => y.Message).Distinct().ToArray());
        return new(errors.Count == 0 ? content : null, errors);
    }

    private static void StampLegacyPpeFact(InventoryPpeCardLineEntity fact, PpeDocumentContentDto content, int index = 0)
    {
        var selected = content.Lines[index];
        fact.RequirementKey = content.NormRows.First(x => x.Id == selected.NormRowId).RequirementKey;
        fact.IssueDate = selected.IssueDate;
        fact.NormUnitsPerItem = selected.NormUnitsPerItem;
    }

    private InventoryCommandResult<T> ExecuteLegacyPpeWrite<T>(Func<InventoryCommandResult<T>> operation)
    {
        if (dbContext.Database.CurrentTransaction is not null) return operation();
        using var transaction = dbContext.Database.BeginTransaction(IsolationLevel.Serializable);
        try
        {
            var result = operation();
            if (result.Succeeded) transaction.Commit();
            return result;
        }
        catch (Exception exception) when (IsDocumentWriteConflict(exception))
        {
            transaction.Rollback();
            dbContext.ChangeTracker.Clear();
            return Failure<T>("conflict", "Параллельная операция изменила данные СИЗ. Обновите карточку и повторите действие");
        }
    }
}

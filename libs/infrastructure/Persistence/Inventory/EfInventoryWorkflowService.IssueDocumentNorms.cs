using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService
{
    public InventoryCommandResult<InventoryPpeNormSetDto> ApprovePpeNormScope(Guid id, PpeNormApprovalDto request, string actor)
    {
        var norm = LoadDocumentNorm(id);
        if (norm is null) return Failure<InventoryPpeNormSetDto>("id", "Норма не найдена");
        if (norm.Version != request.ExpectedVersion) return Failure<InventoryPpeNormSetDto>("conflict", "Норма изменена другим пользователем");
        if (string.IsNullOrWhiteSpace(request.DepartmentName) || request.DepartmentName.Length > 500
            || request.PositionAliases is null || request.PositionAliases.Count == 0 || request.PositionAliases.Count > 100
            || request.PositionAliases.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 500))
            return Failure<InventoryPpeNormSetDto>("scope", "Укажите подразделение и отдельные применимые должности");
        norm.DepartmentName = request.DepartmentName.Trim();
        norm.PositionAliasesJson = JsonSerializer.Serialize(request.PositionAliases.Select(x => x.Trim()).Distinct().ToArray());
        norm.ScopeConfirmed = true;
        return SaveNormApproval(norm, "scope_confirmed", actor);
    }

    public InventoryCommandResult<InventoryPpeNormSetDto> SetPpeNormRowRules(Guid rowId, PpeNormRowRulesDto request, string actor)
    {
        var row = dbContext.InventoryPpeNormRows.Include(x => x.NormSet).FirstOrDefault(x => x.Id == rowId && x.RowType == "item");
        if (row is null) return Failure<InventoryPpeNormSetDto>("rowId", "Строка нормы не найдена");
        var norm = LoadDocumentNorm(row.NormSetId)!;
        if (norm.Version != request.ExpectedVersion) return Failure<InventoryPpeNormSetDto>("conflict", "Норма изменена другим пользователем");
        if (string.IsNullOrWhiteSpace(request.UnitSymbol) || request.UnitSymbol.Length > 40
            || request.PeriodMonths is <= 0 or > 1200 || request.LifeMonths is <= 0 or > 1200
            || request.AlternativeGroup is null || request.AlternativeGroup.Length > 120)
            return Failure<InventoryPpeNormSetDto>("rules", "Проверьте единицу и сроки: допускается от 1 до 1200 месяцев либо пустое значение");
        var key = row.RequirementKey == Guid.Empty ? row.Id : row.RequirementKey;
        if (request.PreviousRequirementRowId.HasValue)
        {
            var previous = dbContext.InventoryPpeNormRows.Include(x => x.NormSet).FirstOrDefault(x => x.Id == request.PreviousRequirementRowId && x.RowType == "item");
            if (previous is null || previous.NormSetId == norm.Id
                || NormalizeNormLookupText(previous.NormSet.DepartmentName) != NormalizeNormLookupText(norm.DepartmentName)
                || !(JsonSerializer.Deserialize<string[]>(previous.NormSet.PositionAliasesJson) ?? [])
                    .Any(oldPosition => (JsonSerializer.Deserialize<string[]>(norm.PositionAliasesJson) ?? [])
                        .Any(newPosition => PositionNamesMatch(oldPosition, newPosition)))
                || NormalizeNormLookupText(previous.NormItemName) != NormalizeNormLookupText(row.NormItemName)
                || NormalizePpeUnit(previous.UnitSymbol) != NormalizePpeUnit(request.UnitSymbol))
                return Failure<InventoryPpeNormSetDto>("previousRequirementRowId", "Связь допускается с другой редакцией той же должности и подразделения, с тем же требованием и единицей");
            key = previous.RequirementKey == Guid.Empty ? previous.Id : previous.RequirementKey;
        }
        if (norm.Rows.Any(x => x.Id != row.Id && x.RequirementKey == key))
            return Failure<InventoryPpeNormSetDto>("requirement", "Одно историческое требование нельзя учитывать дважды в одном наборе норм");
        var alternative = request.AlternativeGroup.Trim();
        if (alternative.Length > 0 && norm.Rows.Any(x => x.Id != row.Id && x.AlternativeGroup == alternative
            && (x.Quantity != row.Quantity || x.PeriodMonths != request.PeriodMonths || NormalizePpeUnit(x.UnitSymbol) != NormalizePpeUnit(request.UnitSymbol))))
            return Failure<InventoryPpeNormSetDto>("alternativeGroup", "У альтернатив должны совпадать количество, единица и период нормы");
        if (NormalizePpeUnit(row.UnitSymbol) != NormalizePpeUnit(request.UnitSymbol))
            foreach (var mapping in row.Mappings) mapping.IsApproved = false;
        row.UnitSymbol = request.UnitSymbol.Trim();
        row.PeriodMonths = request.PeriodMonths;
        row.LifeMonths = request.LifeMonths;
        row.RequirementKey = key;
        row.AlternativeGroup = alternative;
        return SaveNormApproval(norm, "row_rules_confirmed", actor);
    }

    public InventoryCommandResult<InventoryPpeNormMappingDto> ApprovePpeMapping(Guid rowId, PpeMappingApprovalDto request, string actor)
    {
        var row = dbContext.InventoryPpeNormRows.Include(x => x.NormSet).Include(x => x.Mappings).FirstOrDefault(x => x.Id == rowId && x.RowType == "item");
        if (row is null) return Failure<InventoryPpeNormMappingDto>("rowId", "Строка нормы не найдена");
        if (row.NormSet.Version != request.ExpectedNormVersion) return Failure<InventoryPpeNormMappingDto>("conflict", "Норма изменена другим пользователем");
        var item = dbContext.InventoryItems.Include(x => x.Unit).Include(x => x.Category).FirstOrDefault(x => x.Id == request.ItemId && x.IsActive);
        if (item is null || !IsPpeCatalogItem(item)) return Failure<InventoryPpeNormMappingDto>("itemId", "Выберите действующую номенклатуру СИЗ");
        if (row.UnitSymbol.Length == 0 || string.IsNullOrWhiteSpace(item.Unit?.Symbol)
            || request.NormUnitsPerItem <= 0 || request.NormUnitsPerItem > 1000000 || decimal.Round(request.NormUnitsPerItem, 6) != request.NormUnitsPerItem
            || string.IsNullOrWhiteSpace(request.Evidence) || request.Evidence.Length > 2000
            || request.BrandModelArticle is null || request.BrandModelArticle.Length > 600 || request.DefaultUnitPriceMinor is <= 0)
            return Failure<InventoryPpeNormMappingDto>("approval", "Укажите основание проверки защитных свойств и положительный коэффициент пересчёта единиц");
        var mapping = row.Mappings.FirstOrDefault(x => x.ItemId == item.Id);
        if (mapping is null)
        {
            mapping = new InventoryPpeNormCatalogMappingEntity { Id = Guid.NewGuid(), NormRowId = row.Id, ItemId = item.Id, CreatedAt = DateTimeOffset.UtcNow };
            dbContext.InventoryPpeNormCatalogMappings.Add(mapping);
        }
        mapping.IsApproved = true;
        mapping.ArchivedAt = null;
        mapping.ApprovedBy = actor;
        mapping.ApprovalEvidence = request.Evidence.Trim();
        mapping.NormUnitsPerItem = request.NormUnitsPerItem;
        mapping.BrandModelArticle = request.BrandModelArticle.Trim();
        mapping.DefaultUnitPriceMinor = request.DefaultUnitPriceMinor;
        mapping.UpdatedAt = DateTimeOffset.UtcNow;
        row.NormSet.Version++;
        row.NormSet.UpdatedAt = mapping.UpdatedAt;
        AddNormAudit(row.NormSet.Id, "mapping_approved", actor, $"row={rowId}; item={item.Id}; evidence={mapping.ApprovalEvidence}");
        try { dbContext.SaveChanges(); }
        catch (DbUpdateConcurrencyException)
        {
            dbContext.ChangeTracker.Clear();
            return Failure<InventoryPpeNormMappingDto>("conflict", "Норма изменена другим пользователем");
        }
        return Success(MapNormMapping(dbContext.InventoryPpeNormCatalogMappings.Include(x => x.Item).Single(x => x.Id == mapping.Id)));
    }

    private InventoryCommandResult<InventoryPpeNormSetDto> SaveNormApproval(InventoryPpeNormSetEntity norm, string action, string actor)
    {
        norm.Version++;
        norm.UpdatedAt = DateTimeOffset.UtcNow;
        AddNormAudit(norm.Id, action, actor, $"version={norm.Version}");
        try { dbContext.SaveChanges(); return Success(MapNormSet(norm)); }
        catch (DbUpdateConcurrencyException)
        {
            dbContext.ChangeTracker.Clear();
            return Failure<InventoryPpeNormSetDto>("conflict", "Норма изменена другим пользователем");
        }
    }

    private void AddNormAudit(Guid id, string action, string actor, string details) =>
        dbContext.InventorySystemLogs.Add(new InventorySystemLogEntity { Id = Guid.NewGuid(), EntityType = "ppe_norm_set",
            EntityId = id, Action = action, Actor = actor, Details = details, CreatedAt = DateTimeOffset.UtcNow });

    public InventoryCommandResult<PpeLegacyDraftMigrationDto> MigratePpeLegacyDraft(Guid cardId, string actor)
    {
        var existing = dbContext.Set<PpeIssueDocumentEntity>().AsNoTracking().FirstOrDefault(x => x.LegacyCardId == cardId);
        if (existing is not null) return Success(new PpeLegacyDraftMigrationDto(existing.Id, ["Черновик уже перенесён"]));
        var card = dbContext.InventoryPpeCards.AsNoTracking().Include(x => x.Employee).Include(x => x.NormRows)
            .FirstOrDefault(x => x.Id == cardId && x.Status == "draft" && x.ArchivedAt == null);
        if (card is null) return Failure<PpeLegacyDraftMigrationDto>("cardId", "Серверный черновик не найден");
        var date = PpeClock.GetDate(card.CreatedAt);
        var applicable = GetApplicablePpeNorms(card.EmployeeId, date);
        var normId = applicable.FirstOrDefault(x => x.Id == card.NormSetId)?.Id
            ?? (applicable.Count == 1 ? applicable[0].Id : (Guid?)null);
        if (normId is null) return Success(new PpeLegacyDraftMigrationDto(null, ["Сначала подтвердите применимую норму; исходный черновик сохранён без изменений"]));
        var norm = LoadDocumentNorm(normId.Value)!;
        var lines = new List<PpeIssueDocumentLineInput>();
        var warnings = new List<string>();
        foreach (var row in card.NormRows.Where(x => x.RowType == "item" && (x.DraftQuantity.HasValue || x.DraftIssuedAt.HasValue)))
        {
            var source = norm.Rows.FirstOrDefault(x => x.Id == row.SourceNormRowId);
            if (source is null || row.MappedItemId is null || !source.Mappings.Any(x => x.ItemId == row.MappedItemId && x.IsApproved && x.ArchivedAt == null))
            {
                warnings.Add($"Не перенесена строка «{row.NormItemName}»: требуется подтверждённое соответствие");
                continue;
            }
            lines.Add(new(Guid.NewGuid(), source.Id, row.MappedItemId.Value,
                row.DraftIssuedAt.HasValue ? PpeClock.GetDate(row.DraftIssuedAt.Value) : date,
                row.DraftQuantity ?? 1, row.DraftUnitPriceMinor, row.DraftSizeText, row.DraftComment));
        }
        warnings.Add("Старые факты выдачи и исходный черновик не изменены; проверьте состав перед подтверждением");
        using var transaction = dbContext.Database.BeginTransaction();
        try
        {
            var saved = SaveIssueDocument(null, new(card.EmployeeId, norm.Id, date, card.ResponsibleName, card.Basis,
                new(card.Gender, card.Height, card.ClothingSize, card.ShoeSize, card.HeadSize, card.RespiratorSize, card.HandProtectionSize), lines), actor);
            if (!saved.Succeeded) return Success(new PpeLegacyDraftMigrationDto(null, warnings.Concat(saved.Errors.Values.SelectMany(x => x)).ToList()));
            var document = dbContext.Set<PpeIssueDocumentEntity>().Single(x => x.Id == saved.Value!.Id);
            document.LegacyCardId = cardId;
            AddNormAudit(norm.Id, "legacy_draft_migrated", actor, JsonSerializer.Serialize(new { cardId, documentId = document.Id, warnings }));
            dbContext.SaveChanges();
            transaction.Commit();
            return Success(new PpeLegacyDraftMigrationDto(document.Id, warnings));
        }
        catch (Exception exception) when (IsDocumentWriteConflict(exception))
        {
            transaction.Rollback();
            dbContext.ChangeTracker.Clear();
            var migrated = dbContext.Set<PpeIssueDocumentEntity>().AsNoTracking().FirstOrDefault(x => x.LegacyCardId == cardId);
            return migrated is not null
                ? Success(new PpeLegacyDraftMigrationDto(migrated.Id, ["Черновик уже перенесён параллельной операцией"]))
                : Failure<PpeLegacyDraftMigrationDto>("conflict", "Параллельная операция изменила данные. Повторите миграцию");
        }
    }
}

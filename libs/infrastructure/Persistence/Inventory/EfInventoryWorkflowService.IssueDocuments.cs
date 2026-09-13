using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService : IPpeIssueDocumentService
{
    private static readonly JsonSerializerOptions DocumentJson = new(JsonSerializerDefaults.Web);
    private IPatrolTimeZone PpeClock => ppeTimeZone ?? new PatrolTimeZone(TimeZoneInfo.FindSystemTimeZoneById("Asia/Yekaterinburg"));

    private static PpeDocumentContentDto ReadDocument(PpeIssueDocumentEntity document) =>
        JsonSerializer.Deserialize<PpeDocumentContentDto>(document.ContentJson, DocumentJson)
        ?? throw new InvalidDataException("PPE document snapshot is missing");

    public IReadOnlyList<PpeIssueDocumentSummaryDto> GetIssueDocuments(Guid? employeeId) =>
        dbContext.Set<PpeIssueDocumentEntity>().AsNoTracking()
            .Where(x => !employeeId.HasValue || x.EmployeeId == employeeId.Value)
            .OrderByDescending(x => x.CreatedAt).Take(200).ToList()
            .Select(x =>
            {
                var content = ReadDocument(x);
                var validation = JsonSerializer.Deserialize<PpeDocumentValidationDto>(x.ValidationJson, DocumentJson)!;
                return new PpeIssueDocumentSummaryDto(x.Id, x.Version, x.Status, x.EmployeeId,
                    content.Employee.FullName, content.DocumentDate, content.Lines.Count, validation.TotalMinor);
            }).ToList();

    public InventoryCommandResult<PpeIssueDocumentDto> GetIssueDocument(Guid id)
    {
        var document = dbContext.Set<PpeIssueDocumentEntity>().AsNoTracking().FirstOrDefault(x => x.Id == id);
        return document is null ? Failure<PpeIssueDocumentDto>("id", "Документ выдачи не найден") : Success(MapDocument(document));
    }

    private static PpeIssueDocumentDto MapDocument(PpeIssueDocumentEntity document) => new(
        document.Id, document.Version, document.Status, document.CreatedAt, document.ConfirmedAt, ReadDocument(document),
        JsonSerializer.Deserialize<PpeDocumentValidationDto>(document.ValidationJson, DocumentJson)!);

    public IReadOnlyList<InventoryPpeNormSetDto> GetApplicablePpeNorms(Guid employeeId, DateOnly date)
    {
        var employee = dbContext.Employees.AsNoTracking().FirstOrDefault(x => x.Id == employeeId);
        if (employee is null) return [];
        return dbContext.InventoryPpeNormSets.AsNoTracking().Include(x => x.Rows)
            .Where(x => x.Status == "active" && !x.RequiresReview && x.ScopeConfirmed && x.ArchivedAt == null
                && (!x.EffectiveFrom.HasValue || x.EffectiveFrom <= date)
                && (!x.EffectiveTo.HasValue || x.EffectiveTo >= date))
            .ToList().Where(x => PpeScopeMatches(x, employee)).Select(MapNormSet).ToList();
    }

    private static bool PpeScopeMatches(InventoryPpeNormSetEntity norm, EmployeeEntity employee) =>
        norm.ScopeConfirmed && NormalizeNormLookupText(norm.DepartmentName) == NormalizeNormLookupText(employee.Department)
        && (JsonSerializer.Deserialize<string[]>(norm.PositionAliasesJson) ?? [])
            .Any(alias => PositionNamesMatch(employee.Position, alias));

    public InventoryCommandResult<PpeIssueDocumentDto> SaveIssueDocument(Guid? id, SavePpeIssueDocumentDto request, string actor)
    {
        var document = id.HasValue ? dbContext.Set<PpeIssueDocumentEntity>().FirstOrDefault(x => x.Id == id.Value) : null;
        if (id.HasValue && document is null) return Failure<PpeIssueDocumentDto>("id", "Документ не найден");
        if (document is not null && (document.Status != "draft" || document.Version != request.ExpectedVersion))
            return Failure<PpeIssueDocumentDto>("conflict", "Документ уже подтверждён, отменён или изменён другим пользователем");
        if (document is not null && document.EmployeeId != request.EmployeeId)
            return Failure<PpeIssueDocumentDto>("employeeId", "Для другого сотрудника создайте отдельный документ");
        if (request.ResponsibleName is null || request.Basis is null)
            return Failure<PpeIssueDocumentDto>("document", "Реквизиты документа не могут быть null");
        if (request.EmployeeDetails is { } details && new (string? Value, int Limit)[]
            {
                (details.Gender, 40), (details.Height, 40), (details.ClothingSize, 80),
                (details.ShoeSize, 80), (details.HeadSize, 80), (details.RespiratorSize, 120), (details.HandProtectionSize, 120)
            }.Any(x => x.Value is null || x.Value.Length > x.Limit))
            return Failure<PpeIssueDocumentDto>("employeeDetails", "Проверьте длину реквизитов и размеров сотрудника");
        if (request.Lines is null || request.Lines.Count > 500 || request.Lines.Any(x => x is null || x.Id == Guid.Empty || x.SizeText is null || x.ExceptionReason is null)
            || request.Lines.Select(x => x.Id).Distinct().Count() != request.Lines.Count)
            return Failure<PpeIssueDocumentDto>("lines", "Допустимо до 500 строк с уникальными идентификаторами");
        if (request.DocumentDate == default) return Failure<PpeIssueDocumentDto>("documentDate", "Укажите дату документа");
        var employee = dbContext.Employees.FirstOrDefault(x => x.Id == request.EmployeeId);
        var norm = LoadDocumentNorm(request.NormSetId);
        if (employee is null || NormalizeInventoryEmployeeStatus(employee.Status) != "active")
            return Failure<PpeIssueDocumentDto>("employeeId", "Выберите действующего сотрудника");
        if (norm is null || norm.Status != "active" || norm.ArchivedAt != null || norm.RequiresReview || !PpeScopeMatches(norm, employee))
            return Failure<PpeIssueDocumentDto>("normSetId", "Норма не опубликована или её применимость к сотруднику не подтверждена");
        if (!NormDateContains(norm, request.DocumentDate)) return Failure<PpeIssueDocumentDto>("documentDate", "Редакция нормы не действует на дату документа");
        if (document is not null)
        {
            var previous = ReadDocument(document);
            if ((previous.NormSetId != norm.Id || previous.NormSetVersion != norm.Version) && !request.AcceptNormChange)
                return Failure<PpeIssueDocumentDto>("normChanged", "Подтвердите изменение нормы и пересмотр выбранных строк");
        }
        var itemIds = request.Lines.Select(x => x.ItemId).Distinct().ToList();
        var items = dbContext.InventoryItems.AsNoTracking().Include(x => x.Unit).Include(x => x.Category)
            .Where(x => itemIds.Contains(x.Id)).ToDictionary(x => x.Id);
        var sourceRows = norm.Rows.ToDictionary(x => x.Id);
        var selected = new List<PpeDocumentLineDto>();
        foreach (var input in request.Lines)
        {
            if (!sourceRows.TryGetValue(input.NormRowId, out var row) || row.RowType != "item")
                return Failure<PpeIssueDocumentDto>("lines", "Выбранная строка не принадлежит норме");
            var mapping = row.Mappings.FirstOrDefault(x => x.ItemId == input.ItemId && x.ArchivedAt == null && x.IsApproved);
            if (mapping is null || mapping.NormUnitsPerItem <= 0 || string.IsNullOrWhiteSpace(mapping.ApprovalEvidence))
                return Failure<PpeIssueDocumentDto>("mapping", "Соответствие товара норме и единицы должны быть подтверждены ответственным за ОТ");
            if (!items.TryGetValue(input.ItemId, out var item) || !item.IsActive || !IsPpeCatalogItem(item))
                return Failure<PpeIssueDocumentDto>("itemId", "Выбранная номенклатура СИЗ недоступна");
            if (!NormDateContains(norm, input.IssueDate)) return Failure<PpeIssueDocumentDto>("issueDate", "Дата строки вне срока действия нормы");
            if (input.SizeText.Length > 120 || input.ExceptionReason.Length > 2000)
                return Failure<PpeIssueDocumentDto>("lines", "Размер или причина превышают допустимую длину");
            var price = input.UnitPriceMinor ?? mapping.DefaultUnitPriceMinor ?? item.DefaultUnitPriceMinor;
            selected.Add(new(input.Id, row.Id, item.Id, input.IssueDate, input.Quantity, price, input.SizeText.Trim(),
                input.ExceptionReason.Trim(), input.ManualControlConfirmed, item.Name, item.Unit?.Symbol ?? "",
                string.IsNullOrWhiteSpace(mapping.BrandModelArticle)
                    ? string.Join(" / ", new[] { item.BrandName, item.ModelName, item.Article, item.ProtectionClass }.Where(x => !string.IsNullOrWhiteSpace(x)))
                    : mapping.BrandModelArticle,
                mapping.NormUnitsPerItem, PpeDocumentRules.LineTotal(input.Quantity, price)));
        }
        if (request.ResponsibleName.Length > 240 || request.Basis.Length > 4000)
            return Failure<PpeIssueDocumentDto>("basis", "Слишком длинное основание или имя ответственного");
        var content = new PpeDocumentContentDto(new(employee.Id, employee.FullName, employee.PersonnelNo, employee.Department,
                employee.Position, request.EmployeeDetails ?? new()), norm.Id, norm.Version, norm.VersionName, norm.SourceName,
            request.DocumentDate, request.ResponsibleName.Trim(), request.Basis.Trim(),
            norm.Rows.OrderBy(x => x.SortOrder).Select(x => new PpeDocumentNormDto(x.Id, x.ParentRowId, x.RowType, x.SortOrder,
                x.NormItemName, x.NormPoint, x.Quantity, x.UnitSymbol, x.QuantityText, x.IssuePeriodText,
                x.PeriodMonths, x.LifeMonths, x.RequirementKey, x.AlternativeGroup)).ToList(), selected);
        document ??= new PpeIssueDocumentEntity { Id = Guid.NewGuid(), EmployeeId = employee.Id, CreatedAt = DateTimeOffset.UtcNow, CreatedBy = actor };
        document.NormSetId = norm.Id;
        document.Version++;
        document.ContentJson = JsonSerializer.Serialize(content, DocumentJson);
        document.ValidationJson = JsonSerializer.Serialize(ValidateDocumentContent(content, false), DocumentJson);
        if (!id.HasValue) dbContext.Set<PpeIssueDocumentEntity>().Add(document);
        AddDocumentAudit(document, id.HasValue ? "draft_updated" : "draft_created", actor);
        return SaveDocumentChanges(document);
    }

    private InventoryPpeNormSetEntity? LoadDocumentNorm(Guid id) => dbContext.InventoryPpeNormSets
        .Include(x => x.Rows).ThenInclude(x => x.Mappings).FirstOrDefault(x => x.Id == id);

    private static bool NormDateContains(InventoryPpeNormSetEntity norm, DateOnly date) =>
        date != default && (!norm.EffectiveFrom.HasValue || norm.EffectiveFrom <= date)
        && (!norm.EffectiveTo.HasValue || norm.EffectiveTo >= date);

    private PpeDocumentValidationDto ValidateDocumentContent(PpeDocumentContentDto content, bool confirming)
    {
        var facts = dbContext.InventoryPpeCardLines.AsNoTracking().Include(x => x.CardNormRow).ThenInclude(x => x!.SourceNormRow)
            .Include(x => x.Item).ThenInclude(x => x.Unit)
            .Where(x => x.Card.EmployeeId == content.Employee.Id && (x.IssuedAt != null || x.IssueDate != null))
            .ToList();
        var history = new List<PpeHistoricalIssue>();
        var unknown = false;
        var knownRequirements = content.NormRows.Select(x => x.RequirementKey).ToHashSet();
        foreach (var fact in facts)
        {
            if (fact.IssueDocumentId.HasValue && fact.RequirementKey.HasValue && fact.IssueDate.HasValue)
            {
                if (knownRequirements.Contains(fact.RequirementKey.Value))
                    history.Add(new(fact.RequirementKey.Value, fact.IssueDate.Value, fact.Quantity * fact.NormUnitsPerItem));
                continue;
            }
            var source = fact.CardNormRow?.SourceNormRow;
            if (source is null || source.RequirementKey == Guid.Empty || source.UnitSymbol.Length == 0
                || NormalizePpeUnit(source.UnitSymbol) != NormalizePpeUnit(fact.Item.Unit?.Symbol ?? ""))
            {
                unknown = true;
                continue;
            }
            if (knownRequirements.Contains(source.RequirementKey))
                history.Add(new(source.RequirementKey, PpeClock.GetDate(fact.IssuedAt!.Value), fact.Quantity));
        }
        var validation = PpeDocumentRules.Validate(content, history, unknown, PpeClock.Today, confirming);
        var errors = validation.Errors.ToList();
        var live = LoadDocumentNorm(content.NormSetId);
        if (live is null || live.Version != content.NormSetVersion || live.RequiresReview || live.Status != "active" || live.ArchivedAt != null)
            errors.Add(new(null, "norm_changed", "Норма изменена или снята с публикации: пересмотрите черновик"));
        else
        {
            foreach (var line in content.Lines)
            {
                var row = live.Rows.FirstOrDefault(x => x.Id == line.NormRowId);
                var mapping = row?.Mappings.FirstOrDefault(x => x.ItemId == line.ItemId && x.IsApproved && x.ArchivedAt == null);
                if (mapping is null || mapping.NormUnitsPerItem != line.NormUnitsPerItem)
                    errors.Add(new(line.Id, "mapping_changed", "Подтверждённое соответствие изменилось: пересмотрите строку"));
                if (!NormDateContains(live, line.IssueDate)) errors.Add(new(line.Id, "norm_date", "Дата выдачи вне срока действия нормы"));
            }
        }
        var ids = content.Lines.Select(x => x.ItemId).Distinct().ToList();
        var currentItems = dbContext.InventoryItems.AsNoTracking().Include(x => x.Unit).Where(x => ids.Contains(x.Id)).ToDictionary(x => x.Id);
        foreach (var line in content.Lines)
        {
            if (!currentItems.TryGetValue(line.ItemId, out var item) || !item.IsActive)
                errors.Add(new(line.Id, "item_inactive", "Товар больше недоступен"));
            else
            {
                if (RequiresPpeSize(item) && string.IsNullOrWhiteSpace(line.SizeText)) errors.Add(new(line.Id, "size", "Укажите размер СИЗ"));
                if ((item.Unit?.Symbol ?? "") != line.UnitSymbol) errors.Add(new(line.Id, "unit_changed", "Единица номенклатуры изменена: пересмотрите строку"));
            }
        }
        return validation with { Errors = errors };
    }

    public InventoryCommandResult<PpeIssueDocumentDto> ValidateIssueDocument(Guid id)
    {
        var document = dbContext.Set<PpeIssueDocumentEntity>().AsNoTracking().FirstOrDefault(x => x.Id == id);
        if (document is null) return Failure<PpeIssueDocumentDto>("id", "Документ не найден");
        var result = MapDocument(document);
        return Success(document.Status == "draft" ? result with { Validation = ValidateDocumentContent(result.Content, false) } : result);
    }

    public InventoryCommandResult<PpeIssueDocumentDto> ConfirmIssueDocument(Guid id, ConfirmPpeIssueDocumentDto request, string actor)
    {
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey) || request.IdempotencyKey.Length > 120)
            return Failure<PpeIssueDocumentDto>("idempotencyKey", "Укажите ключ операции длиной до 120 символов");
        using var transaction = dbContext.Database.BeginTransaction(IsolationLevel.Serializable);
        try
        {
            var document = dbContext.Set<PpeIssueDocumentEntity>().FirstOrDefault(x => x.Id == id);
            if (document is null) return Failure<PpeIssueDocumentDto>("id", "Документ не найден");
            if (document.Status == "confirmed" && document.IdempotencyKey == request.IdempotencyKey) return Success(MapDocument(document));
            if (document.Status != "draft" || document.Version != request.ExpectedVersion)
                return Failure<PpeIssueDocumentDto>("conflict", "Документ уже изменён или подтверждён");
            var content = ReadDocument(document);
            var employee = dbContext.Employees.FirstOrDefault(x => x.Id == document.EmployeeId);
            var norm = LoadDocumentNorm(document.NormSetId);
            if (employee is null || NormalizeInventoryEmployeeStatus(employee.Status) != "active" || norm is null || !PpeScopeMatches(norm, employee))
                return Failure<PpeIssueDocumentDto>("employee", "Сотрудник или применимость нормы изменились");
            if (employee.Position != content.Employee.Position || employee.Department != content.Employee.Department)
                return Failure<PpeIssueDocumentDto>("employee", "Должность или подразделение изменились: обновите черновик");
            var validation = ValidateDocumentContent(content, true);
            if (validation.Errors.Count > 0)
                return new(null, validation.Errors.GroupBy(x => x.LineId?.ToString() ?? x.Code).ToDictionary(x => x.Key, x => x.Select(y => y.Message).ToArray()));

            var now = DateTimeOffset.UtcNow;
            var card = dbContext.InventoryPpeCards.Include(x => x.NormRows)
                .FirstOrDefault(x => x.EmployeeId == employee.Id && x.ArchivedAt == null);
            if (card is not null && card.Status is not ("active" or "draft"))
                return Failure<PpeIssueDocumentDto>("cardStatus", "Личная карточка закрыта. Сначала проверьте её состояние");
            if (card is null)
            {
                card = new InventoryPpeCardEntity { Id = Guid.NewGuid(), EmployeeId = employee.Id, Position = employee.Position,
                    Status = "active", Version = 1, CreatedAt = now, NormSetId = norm.Id };
                ApplyPpeEmployeeDetails(card, content.Employee.Details);
                dbContext.InventoryPpeCards.Add(card);
            }
            // Copy the complete norm tree, never replace existing rows or reopen the personal card.
            var cardRows = card.NormRows.Where(x => x.SourceNormRowId.HasValue)
                .GroupBy(x => x.SourceNormRowId!.Value).ToDictionary(x => x.Key, x => x.First());
            var nextOrder = card.NormRows.Select(x => x.SortOrder).DefaultIfEmpty(-1).Max() + 1;
            foreach (var source in content.NormRows.OrderBy(x => x.SortOrder))
            {
                if (cardRows.ContainsKey(source.Id)) continue;
                var row = new InventoryPpeCardNormRowEntity { Id = Guid.NewGuid(), CardId = card.Id, SourceNormRowId = source.Id,
                    RowType = source.RowType, SortOrder = nextOrder++, NormItemName = source.NormItemName,
                    NormPoint = source.NormPoint, IssuePeriodText = source.IssuePeriodText, Quantity = source.Quantity,
                    QuantityText = source.QuantityText, LifeMonths = source.LifeMonths };
                if (source.ParentRowId.HasValue && cardRows.TryGetValue(source.ParentRowId.Value, out var parent)) row.ParentRowId = parent.Id;
                cardRows.Add(source.Id, row);
                dbContext.InventoryPpeCardNormRows.Add(row);
            }
            foreach (var selected in content.Lines)
            {
                var source = content.NormRows.Single(x => x.Id == selected.NormRowId);
                var line = new InventoryPpeCardLineEntity { Id = Guid.NewGuid(), CardId = card.Id, CardNormRowId = cardRows[source.Id].Id,
                    IssueDocumentId = document.Id, IssueDate = selected.IssueDate, RequirementKey = source.RequirementKey,
                    NormUnitsPerItem = selected.NormUnitsPerItem, ItemId = selected.ItemId, Quantity = selected.Quantity,
                    UnitPriceMinor = selected.UnitPriceMinor, Status = "issued", IssuedAt = PpeClock.StartOfDayUtc(selected.IssueDate),
                    DueAt = source.LifeMonths is > 0 ? PpeClock.StartOfDayUtc(selected.IssueDate.AddMonths(source.LifeMonths.Value)) : null,
                    Comment = selected.ExceptionReason, PrintItemName = source.NormItemName, NormPoint = source.NormPoint,
                    IssuePeriodText = source.IssuePeriodText, QuantityText = source.QuantityText,
                    BrandModelArticle = selected.BrandModelArticle, SizeText = selected.SizeText, IssueMethod = "personal" };
                dbContext.InventoryPpeCardLines.Add(line);
                dbContext.InventoryPpeCardLineEvents.Add(new InventoryPpeCardLineEventEntity { Id = Guid.NewGuid(), LineId = line.Id,
                    EventType = "issued", FromStatus = "", ToStatus = "issued", Comment = selected.ExceptionReason, Actor = actor, CreatedAt = now });
            }
            card.Status = "active";
            card.Version++;
            document.Status = "confirmed";
            document.ConfirmedAt = now;
            document.IdempotencyKey = request.IdempotencyKey;
            document.Version++;
            document.ValidationJson = JsonSerializer.Serialize(validation, DocumentJson);
            AddDocumentAudit(document, "confirmed", actor);
            dbContext.SaveChanges();
            transaction.Commit();
            return Success(MapDocument(document));
        }
        catch (Exception exception) when (IsDocumentWriteConflict(exception))
        {
            transaction.Dispose();
            dbContext.ChangeTracker.Clear();
            var committed = dbContext.Set<PpeIssueDocumentEntity>().AsNoTracking().FirstOrDefault(x => x.Id == id);
            if (committed is { Status: "confirmed" } && committed.IdempotencyKey == request.IdempotencyKey) return Success(MapDocument(committed));
            return Failure<PpeIssueDocumentDto>("conflict", "Параллельная операция изменила данные. Обновите документ и повторите проверку");
        }
    }

    private static bool IsDocumentWriteConflict(Exception exception)
    {
        // Npgsql's execution strategy can wrap serialization errors in InvalidOperationException.
        for (Exception? current = exception; current is not null; current = current.InnerException)
            if (current is DbUpdateConcurrencyException || current is PostgresException { SqlState: "23505" or "40001" }) return true;
        return false;
    }

    public InventoryCommandResult<PpeIssueDocumentDto> CancelIssueDocument(Guid id, CancelPpeIssueDocumentDto request, string actor)
    {
        var document = dbContext.Set<PpeIssueDocumentEntity>().FirstOrDefault(x => x.Id == id);
        if (document is null) return Failure<PpeIssueDocumentDto>("id", "Документ не найден");
        if (document.Status != "draft" || document.Version != request.ExpectedVersion) return Failure<PpeIssueDocumentDto>("conflict", "Отменить можно только неизменённый черновик");
        document.Status = "cancelled";
        document.Version++;
        AddDocumentAudit(document, "cancelled", actor);
        return SaveDocumentChanges(document);
    }

    private InventoryCommandResult<PpeIssueDocumentDto> SaveDocumentChanges(PpeIssueDocumentEntity document)
    {
        try { dbContext.SaveChanges(); return Success(MapDocument(document)); }
        catch (DbUpdateConcurrencyException)
        {
            dbContext.ChangeTracker.Clear();
            return Failure<PpeIssueDocumentDto>("conflict", "Документ изменён другим пользователем. Обновите его перед сохранением");
        }
    }

    private void AddDocumentAudit(PpeIssueDocumentEntity document, string action, string actor) =>
        dbContext.InventorySystemLogs.Add(new InventorySystemLogEntity { Id = Guid.NewGuid(), EntityType = "ppe_issue_document",
            EntityId = document.Id, Action = action, Details = $"version={document.Version}", Actor = actor, CreatedAt = DateTimeOffset.UtcNow });
}

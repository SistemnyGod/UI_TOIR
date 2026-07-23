using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService
{
    public InventoryCommandResult<InventoryPpeWorkspaceDto> GetPpeWorkspace(Guid employeeId)
    {
        var employee = dbContext.Employees.AsNoTracking().FirstOrDefault(row => row.Id == employeeId);
        if (employee is null)
        {
            return Failure<InventoryPpeWorkspaceDto>("employeeId", "Employee not found");
        }

        var card = dbContext.InventoryPpeCards
            .AsNoTracking()
            .Where(row => row.EmployeeId == employeeId && row.ArchivedAt == null)
            .OrderByDescending(row => row.CreatedAt)
            .Select(row => row.Id)
            .FirstOrDefault();
        var cardDetail = card == Guid.Empty ? null : LoadPpeCard(card);

        var normalizedPosition = NormalizeOptional(employee.Position).ToLowerInvariant();
        var activeNormSet = dbContext.InventoryPpeNormSets
            .AsNoTracking()
            .Include(row => row.Rows)
            .Where(row => row.PositionName.ToLower() == normalizedPosition && row.Status == "active" && row.ArchivedAt == null)
            .OrderByDescending(row => row.EffectiveFrom)
            .ThenByDescending(row => row.UpdatedAt)
            .FirstOrDefault();

        var normRows = card == Guid.Empty
            ? []
            : LoadCardNormRows(card).Select(MapCardNormRow).ToList();
        if (normRows.Count == 0 && cardDetail is not null)
        {
            normRows = BuildLegacyNormRows(MapPpeCardDetail(cardDetail));
        }

        var recentHistory = GetPpeHistory(new InventoryListQuery(PageSize: 10, EmployeeId: employeeId)).Rows
            .Select(MapPpeHistoryToInventoryHistory)
            .ToList();
        var now = DateTime.UtcNow;
        var itemRows = normRows.Where(row => row.RowType == "item").ToList();

        return Success(new InventoryPpeWorkspaceDto(
            MapEmployee(employee),
            cardDetail is null ? null : MapPpeCardDetail(cardDetail),
            activeNormSet is null ? null : MapNormSet(activeNormSet),
            normRows,
            recentHistory,
            itemRows.Count,
            itemRows.Count(row => row.CoverageStatus == "issued"),
            itemRows.Count(row => row.CoverageStatus == "not_issued"),
            itemRows.Count(row => row.CoverageStatus == "partial"),
            itemRows.Count(row => row.CoverageStatus == "overdue"),
            itemRows.Count(row => row.MappedItemId is null)));
    }

    public InventoryListResponseDto<InventoryPpeHistoryRowDto> GetPpeHistory(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.InventoryPpeCardLineEvents
            .AsNoTracking()
            .Include(row => row.Line).ThenInclude(line => line.Card).ThenInclude(card => card.Employee)
            .Include(row => row.Line).ThenInclude(line => line.Item).ThenInclude(item => item.Unit)
            .Include(row => row.Line).ThenInclude(line => line.CardNormRow)
            .AsQueryable();

        if (query.EmployeeId is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.Line.Card.EmployeeId == query.EmployeeId.Value);
        }

        if (query.ItemId is not null)
        {
            rowsQuery = rowsQuery.Where(row => row.Line.ItemId == query.ItemId.Value);
        }

        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            rowsQuery = rowsQuery.Where(row =>
                row.Line.Card.Employee.FullName.ToLower().Contains(search) ||
                row.Line.Item.Name.ToLower().Contains(search) ||
                row.Line.PrintItemName.ToLower().Contains(search));
        }

        var action = NormalizeStatus(query.Action);
        if (action.Length > 0 && action != "all")
        {
            rowsQuery = rowsQuery.Where(row => row.EventType == action || row.ToStatus == action);
        }

        var status = NormalizeStatus(query.Status);
        if (status.Length > 0 && status != "all")
        {
            rowsQuery = rowsQuery.Where(row => row.ToStatus == status);
        }

        if (query.DateFrom is not null) rowsQuery = rowsQuery.Where(row => row.CreatedAt >= query.DateFrom.Value);
        if (query.DateTo is not null)
        {
            var dateToExclusive = query.DateTo.Value.TimeOfDay == TimeSpan.Zero
                ? query.DateTo.Value.AddDays(1)
                : query.DateTo.Value;
            rowsQuery = rowsQuery.Where(row => row.CreatedAt < dateToExclusive);
        }

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderByDescending(row => row.CreatedAt)
            .ThenByDescending(row => row.Id)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList()
            .Select(MapPpeHistoryRow)
            .ToList();
        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryPpeCardDetailDto> CreatePpeCardDraft(CreateInventoryPpeCardDraftDto request)
    {
        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null)
        {
            return Failure<InventoryPpeCardDetailDto>("employeeId", "Employee not found");
        }

        var source = NormalizeStatus(request.Source);
        if (source is not ("active_norms" or "previous_card" or "empty"))
        {
            return Failure<InventoryPpeCardDetailDto>("source", "Unsupported PPE card source");
        }

        InventoryPpeNormSetEntity? normSet = null;
        if (source == "active_norms")
        {
            var normalizedPosition = NormalizeOptional(employee.Position).ToLowerInvariant();
            normSet = request.NormSetId is not null
                ? dbContext.InventoryPpeNormSets.Include(row => row.Rows).ThenInclude(row => row.Mappings).FirstOrDefault(row => row.Id == request.NormSetId && row.Status == "active")
                : dbContext.InventoryPpeNormSets.Include(row => row.Rows).ThenInclude(row => row.Mappings)
                    .Where(row => row.PositionName.ToLower() == normalizedPosition && row.Status == "active" && row.ArchivedAt == null)
                    .OrderByDescending(row => row.EffectiveFrom).FirstOrDefault();
            if (normSet is null)
            {
                return Failure<InventoryPpeCardDetailDto>("normSetId", "Active PPE norm set not found");
            }
        }

        var card = new InventoryPpeCardEntity
        {
            Id = Guid.NewGuid(),
            EmployeeId = employee.Id,
            Position = employee.Position,
            Status = "draft",
            Comment = NormalizeOptional(request.Comment),
            IssueType = NormalizePpeDraftIssueType(request.IssueType),
            ResponsibleName = NormalizePrintField(request.ResponsibleName, string.Empty, 240),
            Basis = NormalizePrintField(request.Basis, string.Empty, 600),
            NormSetId = normSet?.Id,
            Version = 1,
            CreatedAt = request.CardDate.ToUniversalTime()
        };
        ApplyPpeEmployeeDetails(card, request.EmployeeDetails);
        dbContext.InventoryPpeCards.Add(card);

        if (normSet is not null)
        {
            CopyNormSetRows(card.Id, normSet.Rows);
        }
        else if (source == "previous_card")
        {
            var sourceCardId = request.SourceCardId ?? dbContext.InventoryPpeCards
                .Where(row => row.EmployeeId == employee.Id && row.ArchivedAt == null && row.Id != card.Id)
                .OrderByDescending(row => row.CreatedAt)
                .Select(row => (Guid?)row.Id)
                .FirstOrDefault();
            if (sourceCardId is null)
            {
                return Failure<InventoryPpeCardDetailDto>("sourceCardId", "Previous PPE card is required");
            }

            var previousRows = LoadCardNormRows(sourceCardId.Value);
            if (previousRows.Count > 0) CopyCardNormRows(card.Id, previousRows);
            else CopyLegacyCardLines(card.Id, sourceCardId.Value);
        }

        var now = DateTimeOffset.UtcNow;
        AddSystemLog("ppe_card", card.Id, "draft_created", $"{employee.FullName}; source={source}", now);
        dbContext.SaveChanges();
        return Success(MapPpeCardDetail(LoadPpeCard(card.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardDetailDto> UpdatePpeCardDraft(Guid cardId, UpdateInventoryPpeCardDraftDto request)
    {
        var card = dbContext.InventoryPpeCards.FirstOrDefault(row => row.Id == cardId && row.ArchivedAt == null);
        if (card is null) return Failure<InventoryPpeCardDetailDto>("cardId", "PPE card not found");
        if (card.Version != request.ExpectedVersion) return Failure<InventoryPpeCardDetailDto>("conflict", "PPE card was changed by another user");
        if (card.Status != "draft") return Failure<InventoryPpeCardDetailDto>("status", "Only a PPE draft can be edited");

        var issueType = NormalizePpeDraftIssueType(request.IssueType);
        var responsibleName = NormalizePrintField(request.ResponsibleName, string.Empty, 240);
        var basis = NormalizePrintField(request.Basis, string.Empty, 600);
        if (responsibleName.Length == 0) return Failure<InventoryPpeCardDetailDto>("responsibleName", "Responsible person is required");
        if (basis.Length == 0) return Failure<InventoryPpeCardDetailDto>("basis", "Issue basis is required");

        card.CreatedAt = request.CardDate.ToUniversalTime();
        card.IssueType = issueType;
        card.ResponsibleName = responsibleName;
        card.Basis = basis;
        ApplyPpeEmployeeDetails(card, request.EmployeeDetails);
        card.Version += 1;
        AddSystemLog("ppe_card", card.Id, "draft_updated", $"type={issueType}; responsible={responsibleName}", DateTimeOffset.UtcNow);
        try
        {
            dbContext.SaveChanges();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Failure<InventoryPpeCardDetailDto>("conflict", "PPE card was changed by another user");
        }
        return Success(MapPpeCardDetail(LoadPpeCard(card.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardDetailDto> UpdatePpeCardNormRows(Guid cardId, UpdateInventoryPpeCardNormRowsDto request)
    {
        var card = dbContext.InventoryPpeCards.Include(row => row.NormRows).ThenInclude(row => row.Issues)
            .FirstOrDefault(row => row.Id == cardId && row.ArchivedAt == null);
        if (card is null) return Failure<InventoryPpeCardDetailDto>("cardId", "PPE card not found");
        if (card.Version != request.ExpectedVersion) return Failure<InventoryPpeCardDetailDto>("conflict", "PPE card was changed by another user");
        if (request.Rows.Select(row => row.SortOrder).Distinct().Count() != request.Rows.Count)
        {
            return Failure<InventoryPpeCardDetailDto>("rows", "PPE norm row order must be unique");
        }

        var requestRowsById = request.Rows.Where(row => row.Id is not null).ToDictionary(row => row.Id!.Value);
        foreach (var requestRow in request.Rows.Where(row => row.ParentRowId is not null))
        {
            if (!requestRowsById.TryGetValue(requestRow.ParentRowId!.Value, out var parent) || NormalizePpeRowType(parent.RowType) != "group")
            {
                return Failure<InventoryPpeCardDetailDto>("rows", "PPE norm row parent must reference a group in the same card");
            }
            if (requestRow.Id == requestRow.ParentRowId)
            {
                return Failure<InventoryPpeCardDetailDto>("rows", "PPE norm row cannot be its own parent");
            }
        }

        var incomingIds = request.Rows.Where(row => row.Id is not null).Select(row => row.Id!.Value).ToHashSet();
        var protectedRows = card.NormRows.Where(row => !incomingIds.Contains(row.Id) && row.Issues.Count > 0).ToList();
        if (protectedRows.Count > 0)
        {
            return Failure<InventoryPpeCardDetailDto>("rows", "Norm rows with issue facts cannot be removed");
        }

        dbContext.InventoryPpeCardNormRows.RemoveRange(card.NormRows.Where(row => !incomingIds.Contains(row.Id)));
        var rowsById = card.NormRows.ToDictionary(row => row.Id);
        foreach (var requestRow in request.Rows.OrderBy(row => row.SortOrder))
        {
            var row = requestRow.Id is not null && rowsById.TryGetValue(requestRow.Id.Value, out var existing)
                ? existing
                : new InventoryPpeCardNormRowEntity { Id = requestRow.Id ?? Guid.NewGuid(), CardId = card.Id };
            row.SourceNormRowId = requestRow.SourceNormRowId;
            row.ParentRowId = requestRow.ParentRowId;
            row.RowType = NormalizePpeRowType(requestRow.RowType);
            row.SortOrder = requestRow.SortOrder;
            row.NormItemName = NormalizeOptional(requestRow.NormItemName);
            row.NormPoint = NormalizeOptional(requestRow.NormPoint);
            row.IssuePeriodText = NormalizeOptional(requestRow.IssuePeriodText);
            row.Quantity = row.RowType == "group" ? 0 : requestRow.Quantity;
            row.QuantityText = row.RowType == "group" ? string.Empty : NormalizeOptional(requestRow.QuantityText);
            row.LifeMonths = row.RowType == "group" ? null : requestRow.LifeMonths;
            row.MappedItemId = row.RowType == "group" ? null : requestRow.MappedItemId;
            row.BrandModelArticle = row.RowType == "group" ? string.Empty : NormalizeOptional(requestRow.BrandModelArticle);
            row.DefaultUnitPriceMinor = row.RowType == "group" ? null : requestRow.DefaultUnitPriceMinor;
            if (requestRow.Id is null || !rowsById.ContainsKey(row.Id)) dbContext.InventoryPpeCardNormRows.Add(row);
        }

        card.Version += 1;
        AddSystemLog("ppe_card", card.Id, "norm_rows_updated", $"rows={request.Rows.Count}", DateTimeOffset.UtcNow);
        try
        {
            dbContext.SaveChanges();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Failure<InventoryPpeCardDetailDto>("conflict", "PPE card was changed by another user");
        }
        return Success(MapPpeCardDetail(LoadPpeCard(card.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardLineDto> CreatePpeIssue(Guid cardId, CreateInventoryPpeIssueDto request)
    {
        var normRow = dbContext.InventoryPpeCardNormRows
            .Include(row => row.Card)
            .Include(row => row.SourceNormRow).ThenInclude(row => row!.Mappings)
            .FirstOrDefault(row => row.Id == request.CardNormRowId && row.CardId == cardId);
        if (normRow is null) return Failure<InventoryPpeCardLineDto>("cardNormRowId", "PPE norm row not found");
        if (request.ExpectedVersion is not null && normRow.Card.Version != request.ExpectedVersion)
        {
            return Failure<InventoryPpeCardLineDto>("conflict", "PPE card was changed by another user");
        }
        if (normRow.RowType != "item") return Failure<InventoryPpeCardLineDto>("cardNormRowId", "PPE group cannot be issued");
        var item = dbContext.InventoryItems.FirstOrDefault(row => row.Id == request.ItemId && row.IsActive);
        if (item is null) return Failure<InventoryPpeCardLineDto>("itemId", "PPE item not found");
        var allowedItemIds = normRow.SourceNormRow?.Mappings
            .Where(row => row.ArchivedAt == null)
            .Select(row => row.ItemId)
            .ToHashSet() ?? [];
        if (allowedItemIds.Count > 0 && !allowedItemIds.Contains(item.Id))
        {
            return Failure<InventoryPpeCardLineDto>("itemId", "Selected PPE item is not allowed by the published norm mapping");
        }
        if (request.Quantity <= 0) return Failure<InventoryPpeCardLineDto>("quantity", "Quantity must be greater than zero");
        var issueMethod = NormalizeStatus(request.IssueMethod);
        if (issueMethod is not ("personal" or "dispenser")) return Failure<InventoryPpeCardLineDto>("issueMethod", "Unsupported issue method");

        var line = new InventoryPpeCardLineEntity
        {
            Id = Guid.NewGuid(),
            CardId = cardId,
            CardNormRowId = normRow.Id,
            ItemId = item.Id,
            WarehouseId = request.WarehouseId,
            Quantity = request.Quantity,
            UnitPriceMinor = request.UnitPriceMinor ?? normRow.DefaultUnitPriceMinor ?? item.DefaultUnitPriceMinor,
            Status = "issued",
            IssuedAt = request.IssuedAt.ToUniversalTime(),
            DueAt = normRow.LifeMonths is null ? null : request.IssuedAt.ToUniversalTime().AddMonths(normRow.LifeMonths.Value),
            Comment = NormalizeOptional(request.Comment),
            PrintItemName = normRow.NormItemName,
            NormPoint = normRow.NormPoint,
            IssuePeriodText = normRow.IssuePeriodText,
            QuantityText = normRow.QuantityText,
            IsSectionTitle = false,
            BrandModelArticle = NormalizePrintField(request.BrandModelArticle, normRow.BrandModelArticle, 600),
            IssueMethod = issueMethod,
            SizeText = NormalizeOptional(request.SizeText),
            WriteOffActNumber = string.Empty
        };
        dbContext.InventoryPpeCardLines.Add(line);
        normRow.MappedItemId ??= item.Id;
        normRow.Card.Status = "active";
        normRow.Card.Version += 1;
        var now = DateTimeOffset.UtcNow;
        AddPpeEvent(line.Id, "issued", string.Empty, "issued", line.Comment, now);
        AddPpeLineSystemLog(line, "issued", "PPE issue fact created", now);
        try
        {
            dbContext.SaveChanges();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Failure<InventoryPpeCardLineDto>("conflict", "PPE card was changed by another user");
        }
        return Success(MapPpeCardLine(LoadPpeLine(line.Id)!));
    }

    public InventoryCommandResult<InventoryPpeCardDetailDto> CreatePpeIssueBatch(Guid cardId, CreateInventoryPpeIssueBatchDto request)
    {
        if (request.Lines.Count == 0) return Failure<InventoryPpeCardDetailDto>("lines", "At least one PPE issue line is required");
        if (request.Lines.Select(row => row.CardNormRowId).Distinct().Count() != request.Lines.Count)
        {
            return Failure<InventoryPpeCardDetailDto>("lines", "A PPE norm row can only be issued once per document");
        }

        var card = dbContext.InventoryPpeCards
            .Include(row => row.NormRows).ThenInclude(row => row.SourceNormRow).ThenInclude(row => row!.Mappings)
            .FirstOrDefault(row => row.Id == cardId && row.ArchivedAt == null);
        if (card is null) return Failure<InventoryPpeCardDetailDto>("cardId", "PPE card not found");
        if (card.Version != request.ExpectedVersion) return Failure<InventoryPpeCardDetailDto>("conflict", "PPE card was changed by another user");

        var normRows = card.NormRows.ToDictionary(row => row.Id);
        var itemIds = request.Lines.Select(row => row.ItemId).Distinct().ToList();
        var items = dbContext.InventoryItems.Where(row => itemIds.Contains(row.Id) && row.IsActive).ToDictionary(row => row.Id);
        var prepared = new List<(CreateInventoryPpeIssueBatchLineDto Request, InventoryPpeCardNormRowEntity NormRow, InventoryItemEntity Item, string Method)>();
        foreach (var requested in request.Lines)
        {
            if (!normRows.TryGetValue(requested.CardNormRowId, out var normRow) || normRow.RowType != "item")
            {
                return Failure<InventoryPpeCardDetailDto>("cardNormRowId", "PPE norm row not found or is not issuable");
            }
            if (!items.TryGetValue(requested.ItemId, out var item)) return Failure<InventoryPpeCardDetailDto>("itemId", "PPE item not found");
            if (requested.Quantity <= 0) return Failure<InventoryPpeCardDetailDto>("quantity", "Quantity must be greater than zero");
            var method = NormalizeStatus(requested.IssueMethod);
            if (method is not ("personal" or "dispenser")) return Failure<InventoryPpeCardDetailDto>("issueMethod", "Unsupported issue method");
            var allowedItemIds = normRow.SourceNormRow?.Mappings.Where(row => row.ArchivedAt == null).Select(row => row.ItemId).ToHashSet() ?? [];
            if (allowedItemIds.Count > 0 && !allowedItemIds.Contains(item.Id))
            {
                return Failure<InventoryPpeCardDetailDto>("itemId", "Selected PPE item is not allowed by the published norm mapping");
            }
            prepared.Add((requested, normRow, item, method));
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var preparedLine in prepared)
        {
            var requested = preparedLine.Request;
            var normRow = preparedLine.NormRow;
            var item = preparedLine.Item;
            var line = new InventoryPpeCardLineEntity
            {
                Id = Guid.NewGuid(), CardId = card.Id, CardNormRowId = normRow.Id, ItemId = item.Id,
                WarehouseId = requested.WarehouseId, Quantity = requested.Quantity,
                UnitPriceMinor = requested.UnitPriceMinor ?? normRow.DefaultUnitPriceMinor ?? item.DefaultUnitPriceMinor,
                Status = "issued", IssuedAt = requested.IssuedAt.ToUniversalTime(),
                DueAt = normRow.LifeMonths is null ? null : requested.IssuedAt.ToUniversalTime().AddMonths(normRow.LifeMonths.Value),
                Comment = NormalizeOptional(requested.Comment), PrintItemName = normRow.NormItemName,
                NormPoint = normRow.NormPoint, IssuePeriodText = normRow.IssuePeriodText,
                QuantityText = normRow.QuantityText, IsSectionTitle = false,
                BrandModelArticle = NormalizePrintField(requested.BrandModelArticle, normRow.BrandModelArticle, 600),
                IssueMethod = preparedLine.Method, SizeText = NormalizeOptional(requested.SizeText), WriteOffActNumber = string.Empty
            };
            dbContext.InventoryPpeCardLines.Add(line);
            normRow.MappedItemId ??= item.Id;
            AddPpeEvent(line.Id, "issued", string.Empty, "issued", line.Comment, now);
            AddPpeLineSystemLog(line, "issued", "PPE issue fact created in batch", now);
        }

        card.Status = "active";
        card.Version += 1;
        AddSystemLog("ppe_card", card.Id, "issue_batch_created", $"lines={prepared.Count}", now);
        try
        {
            dbContext.SaveChanges();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Failure<InventoryPpeCardDetailDto>("conflict", "PPE card was changed by another user");
        }
        return Success(MapPpeCardDetail(LoadPpeCard(card.Id)!));
    }

    public InventoryListResponseDto<InventoryPpeNormMappingDto> GetPpeNormRowMappings(Guid normRowId, InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.InventoryPpeNormCatalogMappings.AsNoTracking()
            .Include(row => row.Item)
            .Where(row => row.NormRowId == normRowId && row.ArchivedAt == null);
        var total = rowsQuery.Count();
        var rows = rowsQuery.OrderByDescending(row => row.IsDefault).ThenBy(row => row.Item.Name)
            .Skip((paging.Page - 1) * paging.PageSize).Take(paging.PageSize).ToList().Select(MapNormMapping).ToList();
        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryPpeNormMappingDto> UpsertPpeNormRowMapping(Guid normRowId, UpsertInventoryPpeNormMappingDto request)
    {
        var normRow = dbContext.InventoryPpeNormRows.FirstOrDefault(row => row.Id == normRowId && row.RowType == "item");
        if (normRow is null) return Failure<InventoryPpeNormMappingDto>("normRowId", "PPE norm row not found");
        var item = dbContext.InventoryItems.FirstOrDefault(row => row.Id == request.ItemId && row.IsActive);
        if (item is null) return Failure<InventoryPpeNormMappingDto>("itemId", "PPE item not found");
        if (request.IsDefault)
        {
            foreach (var other in dbContext.InventoryPpeNormCatalogMappings.Where(row => row.NormRowId == normRowId && row.ArchivedAt == null)) other.IsDefault = false;
        }

        var now = DateTimeOffset.UtcNow;
        var mapping = dbContext.InventoryPpeNormCatalogMappings.FirstOrDefault(row => row.NormRowId == normRowId && row.ItemId == item.Id);
        if (mapping is null)
        {
            mapping = new InventoryPpeNormCatalogMappingEntity { Id = Guid.NewGuid(), NormRowId = normRowId, ItemId = item.Id, CreatedAt = now };
            dbContext.InventoryPpeNormCatalogMappings.Add(mapping);
        }
        mapping.BrandModelArticle = NormalizeOptional(request.BrandModelArticle);
        mapping.DefaultUnitPriceMinor = request.DefaultUnitPriceMinor;
        mapping.IsDefault = request.IsDefault;
        mapping.Comment = NormalizeOptional(request.Comment);
        mapping.UpdatedAt = now;
        mapping.ArchivedAt = null;
        dbContext.SaveChanges();
        mapping.Item = item;
        return Success(MapNormMapping(mapping));
    }

    private static string NormalizePpeDraftIssueType(string? value) => NormalizeStatus(value) switch
    {
        "primary" => "primary",
        "replacement" => "replacement",
        "additional" => "additional",
        _ => "planned"
    };

    private List<InventoryPpeCardNormRowEntity> LoadCardNormRows(Guid cardId) =>
        dbContext.InventoryPpeCardNormRows.AsNoTracking()
            .Include(row => row.MappedItem)
            .Include(row => row.SourceNormRow).ThenInclude(row => row!.Mappings).ThenInclude(row => row.Item)
            .Include(row => row.Issues).ThenInclude(row => row.Item).ThenInclude(row => row.Unit)
            .Where(row => row.CardId == cardId)
            .OrderBy(row => row.SortOrder).ToList();

    private void CopyNormSetRows(Guid cardId, IEnumerable<InventoryPpeNormRowEntity> sourceRows)
    {
        var idMap = sourceRows.ToDictionary(row => row.Id, _ => Guid.NewGuid());
        foreach (var source in sourceRows.OrderBy(row => row.SortOrder))
        {
            var mapping = source.Mappings.Where(row => row.ArchivedAt == null).OrderByDescending(row => row.IsDefault).FirstOrDefault();
            dbContext.InventoryPpeCardNormRows.Add(new InventoryPpeCardNormRowEntity
            {
                Id = idMap[source.Id], CardId = cardId, SourceNormRowId = source.Id,
                ParentRowId = source.ParentRowId is null ? null : idMap[source.ParentRowId.Value],
                RowType = source.RowType, SortOrder = source.SortOrder, NormItemName = source.NormItemName,
                NormPoint = source.NormPoint, IssuePeriodText = source.IssuePeriodText, Quantity = source.Quantity,
                QuantityText = source.QuantityText, LifeMonths = source.LifeMonths, MappedItemId = mapping?.ItemId,
                BrandModelArticle = mapping?.BrandModelArticle ?? string.Empty, DefaultUnitPriceMinor = mapping?.DefaultUnitPriceMinor
            });
        }
    }

    private void CopyCardNormRows(Guid cardId, IEnumerable<InventoryPpeCardNormRowEntity> sourceRows)
    {
        var idMap = sourceRows.ToDictionary(row => row.Id, _ => Guid.NewGuid());
        foreach (var source in sourceRows.OrderBy(row => row.SortOrder))
        {
            dbContext.InventoryPpeCardNormRows.Add(new InventoryPpeCardNormRowEntity
            {
                Id = idMap[source.Id], CardId = cardId, SourceNormRowId = source.SourceNormRowId,
                ParentRowId = source.ParentRowId is null ? null : idMap[source.ParentRowId.Value], RowType = source.RowType,
                SortOrder = source.SortOrder, NormItemName = source.NormItemName, NormPoint = source.NormPoint,
                IssuePeriodText = source.IssuePeriodText, Quantity = source.Quantity, QuantityText = source.QuantityText,
                LifeMonths = source.LifeMonths, MappedItemId = source.MappedItemId, BrandModelArticle = source.BrandModelArticle,
                DefaultUnitPriceMinor = source.DefaultUnitPriceMinor
            });
        }
    }

    private void CopyLegacyCardLines(Guid cardId, Guid sourceCardId)
    {
        var lines = dbContext.InventoryPpeCardLines.AsNoTracking().Where(row => row.CardId == sourceCardId && row.Status != "archived").OrderBy(row => row.Id).ToList();
        for (var index = 0; index < lines.Count; index++)
        {
            var line = lines[index];
            dbContext.InventoryPpeCardNormRows.Add(new InventoryPpeCardNormRowEntity
            {
                Id = Guid.NewGuid(), CardId = cardId, RowType = line.IsSectionTitle ? "group" : "item", SortOrder = index,
                NormItemName = line.PrintItemName, NormPoint = line.NormPoint, IssuePeriodText = line.IssuePeriodText,
                Quantity = line.IsSectionTitle ? 0 : line.Quantity, QuantityText = line.QuantityText ?? string.Empty,
                MappedItemId = line.IsSectionTitle ? null : line.ItemId, BrandModelArticle = line.BrandModelArticle,
                DefaultUnitPriceMinor = line.UnitPriceMinor
            });
        }
    }

    private static string NormalizePpeRowType(string value) => NormalizeStatus(value) == "group" ? "group" : "item";

    private InventoryPpeCardNormRowDto MapCardNormRow(InventoryPpeCardNormRowEntity row)
    {
        var activeIssues = row.Issues.Where(issue => issue.Status is "issued" or "partial").ToList();
        var issuedQuantity = activeIssues.Sum(issue => issue.Quantity);
        var coverage = row.RowType == "group" ? "group"
            : activeIssues.Any(issue => issue.DueAt is not null && issue.DueAt < DateTimeOffset.UtcNow) ? "overdue"
            : issuedQuantity <= 0 ? "not_issued"
            : issuedQuantity < row.Quantity ? "partial" : "issued";
        return new InventoryPpeCardNormRowDto(
            row.Id, row.SourceNormRowId, row.ParentRowId, row.RowType, row.SortOrder, row.NormItemName,
            row.NormPoint, row.IssuePeriodText, row.Quantity, row.QuantityText, row.LifeMonths,
            row.MappedItemId, row.MappedItem?.Name ?? string.Empty, row.BrandModelArticle, row.DefaultUnitPriceMinor,
            coverage, issuedQuantity,
            row.SourceNormRow?.Mappings.Where(mapping => mapping.ArchivedAt == null).Select(MapNormMapping).ToList() ?? []);
    }

    private static InventoryPpeNormSetDto MapNormSet(InventoryPpeNormSetEntity row) =>
        new(row.Id, row.PositionName, row.VersionName, row.EffectiveFrom, row.EffectiveTo, row.SourceName, row.Status, row.RequiresReview, row.Version, row.Rows.Count);

    private static InventoryPpeNormMappingDto MapNormMapping(InventoryPpeNormCatalogMappingEntity row) =>
        new(row.Id, row.NormRowId, row.ItemId, row.Item.Name, row.Item.Sku, row.BrandModelArticle, row.DefaultUnitPriceMinor, row.IsDefault, row.Comment);

    private static InventoryPpeHistoryRowDto MapPpeHistoryRow(InventoryPpeCardLineEventEntity row)
    {
        var action = row.EventType == "created" && row.ToStatus == "issued" ? "issued" : row.EventType;
        return new InventoryPpeHistoryRowDto(
            row.Id, row.Line.CardId, row.LineId, row.Line.Card.EmployeeId, row.Line.Card.Employee.FullName,
            row.Line.ItemId, row.Line.Item.Name, action, PpeHistoryActionLabel(action), row.FromStatus, row.ToStatus,
            row.Line.Quantity, row.Line.Item.Unit?.Symbol ?? row.Line.Item.Unit?.Name ?? string.Empty,
            row.Comment, row.Actor, row.CreatedAt.UtcDateTime, row.Line.CardNormRowId,
            row.Line.CardNormRow?.NormItemName ?? PpeLinePrintName(row.Line));
    }

    private static string PpeHistoryActionLabel(string action) => action switch
    {
        "issued" => "Выдано",
        "returned" => "Возвращено",
        "written_off" => "Списано",
        "defective" => "Неисправно",
        "created" => "Создано",
        "status_changed" => "Статус изменен",
        _ => action
    };

    private static InventoryHistoryDto MapPpeHistoryToInventoryHistory(InventoryPpeHistoryRowDto row) =>
        new(row.Id, "ppe_card_line", row.Action, $"{row.ActionLabel}: {row.NormItemName}", row.Actor, row.CreatedAt, row.EmployeeName, row.ItemName);

    private static List<InventoryPpeCardNormRowDto> BuildLegacyNormRows(InventoryPpeCardDetailDto card) =>
        card.Lines.Select((line, index) => new InventoryPpeCardNormRowDto(
            line.Id, null, null, line.IsSectionTitle ? "group" : "item", index, line.PrintItemName,
            line.NormPoint, line.IssuePeriodText, line.Quantity, line.QuantityText, null,
            line.IsSectionTitle ? null : line.ItemId, line.IsSectionTitle ? string.Empty : line.ItemName,
            line.BrandModelArticle, line.UnitPriceMinor, line.IsSectionTitle ? "group" : line.Status,
            line.Status == "issued" ? line.Quantity : 0, [])).ToList();
}

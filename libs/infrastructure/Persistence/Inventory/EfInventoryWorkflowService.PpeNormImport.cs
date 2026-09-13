using System.Globalization;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService
{
    public InventoryListResponseDto<InventoryPpeNormSetDto> GetPpeNormSets(InventoryListQuery query)
    {
        var paging = NormalizePaging(query);
        var rowsQuery = dbContext.InventoryPpeNormSets.AsNoTracking()
            .Include(row => row.Rows)
            .Where(row => row.ArchivedAt == null || row.Status == "archived");
        var search = NormalizeQuery(query.Query);
        if (search.Length > 0)
        {
            var footwearSearch = search.Contains("обув", StringComparison.Ordinal)
                || search.Contains("ботин", StringComparison.Ordinal)
                || search.Contains("сапог", StringComparison.Ordinal);
            var winterSearch = search.Contains("зим", StringComparison.Ordinal)
                || search.Contains("утепл", StringComparison.Ordinal)
                || search.Contains("мех", StringComparison.Ordinal);
            rowsQuery = rowsQuery.Where(row =>
                row.PositionName.ToLower().Contains(search) ||
                row.VersionName.ToLower().Contains(search) ||
                row.SourceName.ToLower().Contains(search) ||
                row.Rows.Any(normRow =>
                    normRow.NormItemName.ToLower().Contains(search) ||
                    normRow.NormPoint.ToLower().Contains(search) ||
                    (footwearSearch && (normRow.NormItemName.ToLower().Contains("обув")
                        || normRow.NormItemName.ToLower().Contains("ботин")
                        || normRow.NormItemName.ToLower().Contains("сапог"))) ||
                    (winterSearch && (normRow.NormItemName.ToLower().Contains("зим")
                        || normRow.NormItemName.ToLower().Contains("утепл")
                        || normRow.NormItemName.ToLower().Contains("мех")))));
        }

        var position = NormalizeOptional(query.Position).ToLowerInvariant();
        if (position.Length > 0) rowsQuery = rowsQuery.Where(row => row.PositionName.ToLower() == position);
        var status = NormalizeStatus(query.Status);
        if (status.Length > 0 && status != "all") rowsQuery = rowsQuery.Where(row => row.Status == status);

        var total = rowsQuery.Count();
        var rows = rowsQuery
            .OrderBy(row => row.PositionName)
            .ThenByDescending(row => row.UpdatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToList()
            .Select(MapNormSet)
            .ToList();
        return ToListResponse(rows, total, paging);
    }

    public InventoryCommandResult<InventoryPpeNormSetDetailDto> GetPpeNormSet(Guid normSetId)
    {
        var normSet = dbContext.InventoryPpeNormSets
            .AsNoTracking()
            .Include(row => row.Rows)
                .ThenInclude(row => row.Mappings)
                    .ThenInclude(mapping => mapping.Item)
            .FirstOrDefault(row => row.Id == normSetId && row.ArchivedAt == null);
        if (normSet is null)
        {
            return Failure<InventoryPpeNormSetDetailDto>("normSetId", "PPE norm set not found");
        }

        var itemRows = normSet.Rows.Where(row => row.RowType == "item").ToList();
        var mappedRows = itemRows.Count(row => row.Mappings.Any(mapping => mapping.ArchivedAt == null));
        return Success(new InventoryPpeNormSetDetailDto(
            MapNormSet(normSet),
            normSet.Rows.OrderBy(row => row.SortOrder).Select(MapNormRow).ToList(),
            itemRows.Count,
            mappedRows,
            itemRows.Count - mappedRows));
    }

    public InventoryCommandResult<InventoryPpeNormImportResultDto> ImportPpeNormSetsDraft(Stream source, string fileName)
    {
        if (!fileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            return Failure<InventoryPpeNormImportResultDto>("file", "PPE norm import supports .xlsx files only");
        }

        PpeNormImportDocument document;
        try
        {
            document = ReadPpeNormWorkbook(source);
        }
        catch (Exception exception) when (exception is InvalidDataException or FormatException or IOException)
        {
            return Failure<InventoryPpeNormImportResultDto>("file", exception.Message);
        }

        if (document.Scopes.Count == 0)
        {
            return Failure<InventoryPpeNormImportResultDto>("file", "The workbook does not contain PPE norm rows with a position and item name");
        }

        var baseVersion = ReadNormVersion(fileName);

        var now = DateTimeOffset.UtcNow;
        var effectiveFrom = ReadNormEffectiveDate(fileName);
        var catalogItems = dbContext.InventoryItems
            .AsNoTracking()
            .Include(item => item.Category)
            .Where(item => item.IsActive)
            .ToList()
            .Where(IsPpeCatalogItem)
            .ToList();
        var versionNamesByScope = dbContext.InventoryPpeNormSets.AsNoTracking()
            .Select(set => new { set.DepartmentName, set.PositionName, set.VersionName })
            .ToList()
            .GroupBy(set => NormScopeKey(set.DepartmentName, set.PositionName), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => new HashSet<string>(group.Select(set => set.VersionName), StringComparer.OrdinalIgnoreCase),
                StringComparer.OrdinalIgnoreCase);
        var createdSets = new List<InventoryPpeNormSetEntity>();
        var mappingWarnings = new List<string>();
        foreach (var scope in document.Scopes)
        {
            var scopeKey = NormScopeKey(scope.DepartmentName, scope.PositionName);
            if (!versionNamesByScope.TryGetValue(scopeKey, out var versionNames))
            {
                versionNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                versionNamesByScope.Add(scopeKey, versionNames);
            }
            var versionName = NextNormVersion(baseVersion, versionNames);
            versionNames.Add(versionName);
            var normSet = new InventoryPpeNormSetEntity
            {
                Id = Guid.NewGuid(),
                DepartmentName = scope.DepartmentName,
                PositionName = scope.PositionName,
                PositionAliasesJson = "[]",
                ScopeConfirmed = false,
                VersionName = versionName,
                EffectiveFrom = effectiveFrom,
                SourceName = Path.GetFileName(fileName),
                Status = "draft",
                RequiresReview = true,
                Version = 1,
                CreatedAt = now,
                UpdatedAt = now
            };
            var mappedCount = 0;
            var itemCount = 0;
            foreach (var sourceRow in scope.Rows.OrderBy(row => row.SortOrder))
            {
                var normRow = new InventoryPpeNormRowEntity
                {
                    Id = sourceRow.Id,
                    NormSetId = normSet.Id,
                    ParentRowId = sourceRow.ParentRowId,
                    RowType = sourceRow.RowType,
                    SortOrder = sourceRow.SortOrder,
                    NormItemName = sourceRow.NormItemName,
                    NormPoint = sourceRow.NormPoint,
                    IssuePeriodText = sourceRow.IssuePeriodText,
                    Quantity = sourceRow.Quantity,
                    QuantityText = sourceRow.QuantityText,
                    LifeMonths = null,
                    PeriodMonths = sourceRow.PeriodMonths,
                    UnitSymbol = sourceRow.UnitSymbol,
                    RequirementKey = sourceRow.Id,
                    AlternativeGroup = sourceRow.AlternativeGroup
                };
                if (normRow.RowType == "item")
                {
                    itemCount += 1;
                    var catalogItem = FindNormCatalogMatch(normRow.NormItemName, catalogItems);
                    if (catalogItem is not null)
                    {
                        normRow.Mappings.Add(new InventoryPpeNormCatalogMappingEntity
                        {
                            Id = Guid.NewGuid(),
                            NormRowId = normRow.Id,
                            ItemId = catalogItem.Id,
                            BrandModelArticle = string.Join(" / ", new[] { catalogItem.BrandName, catalogItem.ModelName, catalogItem.Article }
                                .Where(value => !string.IsNullOrWhiteSpace(value))),
                            DefaultUnitPriceMinor = catalogItem.DefaultUnitPriceMinor,
                            IsDefault = true,
                            IsApproved = false,
                            NormUnitsPerItem = 1m,
                            CreatedAt = now,
                            UpdatedAt = now
                        });
                        mappedCount += 1;
                    }
                }
                normSet.Rows.Add(normRow);
            }
            createdSets.Add(normSet);
            dbContext.InventoryPpeNormSets.Add(normSet);
            AddSystemLog("ppe_norm_set", normSet.Id, "draft_imported", $"{scope.DepartmentName}; {scope.PositionName}; {fileName}; rows={scope.Rows.Count}", now);
            if (itemCount > mappedCount)
            {
                mappingWarnings.Add($"{scope.DepartmentName} / {scope.PositionName}: сопоставлено {mappedCount} из {itemCount}; вручную сопоставьте оставшиеся строки по категориям СИЗ.");
            }
        }

        dbContext.SaveChanges();
        return Success(new InventoryPpeNormImportResultDto(
            document.SourceRows,
            createdSets.Count,
            document.GroupsCreated,
            document.ItemsCreated,
            document.SkippedRows,
            document.Warnings.Concat(mappingWarnings).ToList(),
            createdSets.Select(MapNormSet).ToList()));
    }

    public InventoryCommandResult<InventoryPpeNormSetDto> PublishPpeNormSet(Guid normSetId, PublishInventoryPpeNormSetDto request)
    {
        if (!request.ConfirmReviewed)
        {
            return Failure<InventoryPpeNormSetDto>("confirmReviewed", "Manual review must be confirmed before publishing PPE norms");
        }

        using var publication = dbContext.Database.BeginTransaction(System.Data.IsolationLevel.Serializable);
        var normSet = dbContext.InventoryPpeNormSets.Include(row => row.Rows)
            .FirstOrDefault(row => row.Id == normSetId && row.Status == "draft" && row.ArchivedAt == null);
        if (normSet is null) return Failure<InventoryPpeNormSetDto>("normSetId", "Draft PPE norm set not found");
        if (normSet.Version != request.ExpectedVersion) return Failure<InventoryPpeNormSetDto>("conflict", "PPE norm set was changed by another user");
        if (!normSet.Rows.Any(row => row.RowType == "item"))
        {
            return Failure<InventoryPpeNormSetDto>("rows", "PPE norm set must contain at least one item row");
        }

        var now = DateTimeOffset.UtcNow;
        if (!normSet.ScopeConfirmed)
        {
            return Failure<InventoryPpeNormSetDto>("scopeConfirmed", "PPE norm scope must be confirmed before publishing");
        }

        foreach (var active in dbContext.InventoryPpeNormSets.Where(row =>
            row.Id != normSet.Id
            && row.DepartmentName == normSet.DepartmentName
            && row.PositionName == normSet.PositionName
            && row.Status == "active"
            && row.ArchivedAt == null))
        {
            active.Status = "archived";
            active.ArchivedAt = now;
            active.UpdatedAt = now;
            active.Version += 1;
        }
        normSet.Status = "active";
        normSet.RequiresReview = false;
        normSet.EffectiveFrom ??= DateOnly.FromDateTime(now.UtcDateTime);
        normSet.UpdatedAt = now;
        normSet.Version += 1;
        AddSystemLog("ppe_norm_set", normSet.Id, "published", normSet.PositionName, now);
        try
        {
            dbContext.SaveChanges();
            publication.Commit();
        }
        catch (Exception exception) when (IsDocumentWriteConflict(exception))
        {
            publication.Dispose();
            dbContext.ChangeTracker.Clear();
            return Failure<InventoryPpeNormSetDto>("conflict", "PPE norm set was changed by another user");
        }
        return Success(MapNormSet(normSet));
    }

    internal static PpeNormImportDocument ReadPpeNormWorkbook(Stream source)
    {
        using var workbook = new XLWorkbook(source);
        var worksheet = workbook.Worksheets.FirstOrDefault()
            ?? throw new InvalidDataException("The workbook does not contain worksheets");
        var scopes = new Dictionary<string, PpeNormImportScope>(StringComparer.OrdinalIgnoreCase);
        var warnings = new List<string>();
        PpeNormImportScope? currentScope = null;
        var currentDepartmentName = string.Empty;
        string currentGroupName = string.Empty;
        Guid? currentGroupId = null;
        var sourceRows = 0;
        var skippedRows = 0;
        var groupsCreated = 0;
        var itemsCreated = 0;

        foreach (var row in worksheet.RowsUsed().Where(row => row.RowNumber() > 9))
        {
            var departmentName = NormalizeWorkbookText(row.Cell(1).GetFormattedString());
            var positionName = NormalizeWorkbookText(row.Cell(2).GetFormattedString());
            var groupName = NormalizeWorkbookText(row.Cell(3).GetFormattedString());
            var normItemName = NormalizeWorkbookText(row.Cell(4).GetFormattedString());
            var issuePeriod = NormalizeWorkbookText(row.Cell(5).GetFormattedString());
            var normPoint = NormalizeWorkbookText(row.Cell(6).GetFormattedString());
            var isDepartmentSectionHeader = departmentName.Length > 0
                && positionName.Length == 0
                && groupName.Length == 0
                && normItemName.Length == 0
                && issuePeriod.Length == 0
                && normPoint.Length == 0;
            if (isDepartmentSectionHeader)
            {
                currentDepartmentName = departmentName;
                currentScope = null;
                currentGroupName = string.Empty;
                currentGroupId = null;
            }
            if (positionName.Length > 0)
            {
                if (currentDepartmentName.Length == 0)
                {
                    skippedRows += 1;
                    warnings.Add($"Row {row.RowNumber()}: PPE position skipped because department section is empty");
                    currentScope = null;
                    continue;
                }
                var scopeKey = $"{currentDepartmentName}\u001f{positionName}";
                if (!scopes.TryGetValue(scopeKey, out currentScope))
                {
                    currentScope = new PpeNormImportScope(currentDepartmentName, positionName);
                    scopes.Add(scopeKey, currentScope);
                }
                currentGroupName = string.Empty;
                currentGroupId = null;
            }
            if (normItemName.Length == 0) continue;
            sourceRows += 1;
            if (currentScope is null)
            {
                skippedRows += 1;
                warnings.Add($"Row {row.RowNumber()}: PPE item skipped because department or position is empty");
                continue;
            }
            ValidatePpeNormTextLength(row.RowNumber(), normItemName, normPoint);

            if (groupName.Length > 0 && !string.Equals(groupName, currentGroupName, StringComparison.OrdinalIgnoreCase))
            {
                currentGroupName = groupName;
                currentGroupId = Guid.NewGuid();
                currentScope.Rows.Add(new PpeNormImportRow(
                    currentGroupId.Value, null, "group", currentScope.Rows.Count,
                    groupName, string.Empty, string.Empty, 0, string.Empty, null, string.Empty, null, string.Empty));
                groupsCreated += 1;
            }

            var (quantity, quantityText, unitSymbol) = ReadNormQuantity(issuePeriod);
            currentScope.Rows.Add(new PpeNormImportRow(
                Guid.NewGuid(), currentGroupId, "item", currentScope.Rows.Count,
                normItemName, normPoint, issuePeriod, quantity, quantityText, null, unitSymbol, ReadPeriodMonths(issuePeriod), string.Empty));
            itemsCreated += 1;
        }

        return new PpeNormImportDocument(
            scopes.Values.Where(scope => scope.Rows.Any(row => row.RowType == "item")).ToList(),
            sourceRows, groupsCreated, itemsCreated, skippedRows, warnings);
    }

    private static string NormalizeWorkbookText(string value) =>
        Regex.Replace(value ?? string.Empty, @"\s+", " ").Trim();

    private static bool IsPpeCatalogItem(InventoryItemEntity item)
    {
        var kind = item.ItemKind.Trim();
        var category = item.Category?.Name?.Trim() ?? string.Empty;
        var normalizedKind = NormalizeNormLookupText(kind);
        var normalizedCategory = NormalizeNormLookupText(category);
        if (item.IsActive && (normalizedKind.Contains("ppe", StringComparison.Ordinal)
            || normalizedKind.Contains("siz", StringComparison.Ordinal)
            || normalizedKind.Contains("сиз", StringComparison.Ordinal)
            || normalizedKind.Contains("спец", StringComparison.Ordinal)
            || normalizedCategory.Contains("ppe", StringComparison.Ordinal)
            || normalizedCategory.Contains("siz", StringComparison.Ordinal)
            || normalizedCategory.Contains("сиз", StringComparison.Ordinal)
            || normalizedCategory.Contains("спец", StringComparison.Ordinal)))
        {
            return true;
        }
        return item.IsActive && (kind.Contains("СИЗ", StringComparison.OrdinalIgnoreCase)
            || kind.Contains("спец", StringComparison.OrdinalIgnoreCase)
            || kind.Equals("ppe", StringComparison.OrdinalIgnoreCase)
            || kind.Equals("siz", StringComparison.OrdinalIgnoreCase)
            || category.Contains("СИЗ", StringComparison.OrdinalIgnoreCase)
            || category.Contains("спецодеж", StringComparison.OrdinalIgnoreCase)
            || category.Contains("ppe", StringComparison.OrdinalIgnoreCase));
    }

    private static InventoryItemEntity? FindNormCatalogMatch(string normItemName, IReadOnlyList<InventoryItemEntity> catalogItems)
    {
        var normValue = NormalizeNormLookupText(normItemName);
        if (normValue.Length == 0) return null;

        var exact = catalogItems
            .Where(item => new[] { item.Name, item.NormItemName, item.ActualItemName }
                .Select(NormalizeNormLookupText)
                .Any(value => value.Length > 0 && value == normValue))
            .ToList();
        if (exact.Count == 1) return exact[0];
        if (exact.Count > 1) return null;

        var contains = catalogItems
            .Select(item => new
            {
                Item = item,
                Values = new[] { item.Name, item.NormItemName, item.ActualItemName }
                    .Select(NormalizeNormLookupText)
                    .Where(value => value.Length >= 14)
                    .Distinct()
                    .ToList()
            })
            .SelectMany(candidate => candidate.Values
                .Where(value => normValue.Contains(value, StringComparison.Ordinal) || value.Contains(normValue, StringComparison.Ordinal))
                .Select(value => new { candidate.Item, Length = value.Length }))
            .OrderByDescending(candidate => candidate.Length)
            .ToList();
        if (contains.Count == 0) return null;
        var bestLength = contains[0].Length;
        var best = contains.Where(candidate => candidate.Length == bestLength).Select(candidate => candidate.Item).DistinctBy(item => item.Id).ToList();
        return best.Count == 1 ? best[0] : null;
    }

    private static string NormalizeNormLookupText(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant().Replace('ё', 'е');
        normalized = Regex.Replace(normalized, @"[^\p{L}\p{Nd}]+", " ");
        return Regex.Replace(normalized, @"\s+", " ").Trim();
    }

    internal static bool PositionNamesMatch(string? employeePosition, string? normPosition)
    {
        var employeeTokens = NormalizePositionTokens(employeePosition);
        var normTokens = NormalizePositionTokens(normPosition);
        return employeeTokens.Length > 0
            && employeeTokens.Length == normTokens.Length
            && employeeTokens.All(token => normTokens.Contains(token, StringComparer.Ordinal));
    }

    private static string[] NormalizePositionTokens(string? value) => NormalizeNormLookupText(value)
        .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Where(token => token is not ("по" or "и"))
        .Select(CanonicalizePositionToken)
        .Distinct(StringComparer.Ordinal)
        .OrderBy(token => token, StringComparer.Ordinal)
        .ToArray();

    private static string CanonicalizePositionToken(string token)
    {
        if (token is "зам" or "замест" || token.StartsWith("заместител", StringComparison.Ordinal)) return "заместитель";
        if (token is "нач" or "начальн" || token.StartsWith("начальник", StringComparison.Ordinal)) return "начальник";
        if (token is "электромонтёр" || token.StartsWith("электромонтер", StringComparison.Ordinal)) return "электромонтер";
        return token;
    }

    private static void ValidatePpeNormTextLength(int rowNumber, string normItemName, string normPoint)
    {
        if (normItemName.Length > 4000 || normPoint.Length > 4000)
        {
            throw new InvalidDataException($"Row {rowNumber}: normative text exceeds the supported 4000 character limit");
        }
    }

    private static (decimal Quantity, string QuantityText, string UnitSymbol) ReadNormQuantity(string value)
    {
        var match = Regex.Match(value ?? string.Empty, @"(?<quantity>\d+(?:[.,]\d+)?)\s*(?<unit>\p{L}+[\p{L}.]*)?", RegexOptions.IgnoreCase);
        if (!match.Success) return (1m, value ?? string.Empty, string.Empty);
        var quantity = decimal.Parse(match.Groups["quantity"].Value.Replace(',', '.'), CultureInfo.InvariantCulture);
        var unit = match.Groups["unit"].Success && !match.Groups["unit"].Value.Equals("на", StringComparison.OrdinalIgnoreCase)
            ? match.Groups["unit"].Value
            : string.Empty;
        var quantityText = unit.Length == 0 ? match.Groups["quantity"].Value : $"{match.Groups["quantity"].Value} {unit}";
        return (quantity, quantityText, unit);
    }

    private static int? ReadPeriodMonths(string value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant().Replace('ё', 'е');
        var matches = Regex.Matches(normalized, @"(?<value>\d+(?:[.,]\d+)?)\s*(?<unit>\p{L}+)", RegexOptions.IgnoreCase);
        var match = matches.Cast<Match>().LastOrDefault(candidate =>
            candidate.Groups["unit"].Value.StartsWith("месяц", StringComparison.Ordinal)
            || candidate.Groups["unit"].Value.StartsWith("мес", StringComparison.Ordinal)
            || candidate.Groups["unit"].Value.StartsWith("год", StringComparison.Ordinal)
            || candidate.Groups["unit"].Value.StartsWith("лет", StringComparison.Ordinal));
        if (match is null) return null;
        var amount = decimal.Parse(match.Groups["value"].Value.Replace(',', '.'), CultureInfo.InvariantCulture);
        var unit = match.Groups["unit"].Value;
        if (unit.StartsWith("месяц", StringComparison.Ordinal) || unit.StartsWith("мес", StringComparison.Ordinal))
        {
            return (int)Math.Round(amount, MidpointRounding.AwayFromZero);
        }

        return unit.StartsWith("год", StringComparison.Ordinal) || unit.StartsWith("лет", StringComparison.Ordinal)
            ? (int)Math.Round(amount * 12m, MidpointRounding.AwayFromZero)
            : null;
    }

    private static string ReadNormVersion(string fileName)
    {
        var match = Regex.Match(Path.GetFileNameWithoutExtension(fileName), @"\d{2}\.\d{2}\.\d{2,4}");
        var value = match.Success ? match.Value : Path.GetFileNameWithoutExtension(fileName);
        return value.Length <= 100 ? value : value[..100];
    }

    private static DateOnly? ReadNormEffectiveDate(string fileName)
    {
        var match = Regex.Match(Path.GetFileNameWithoutExtension(fileName), @"\d{2}\.\d{2}\.\d{2,4}");
        if (!match.Success) return null;
        var formats = new[] { "dd.MM.yy", "dd.MM.yyyy" };
        return DateOnly.TryParseExact(match.Value, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : null;
    }

    private static string NormScopeKey(string departmentName, string positionName) => $"{departmentName}\u001f{positionName}";

    private static string NextNormVersion(string baseVersion, IReadOnlySet<string> existing)
    {
        if (!existing.Contains(baseVersion)) return baseVersion;

        for (var suffix = 1; ; suffix += 1)
        {
            var suffixText = $"-{suffix}";
            var prefixLength = Math.Max(1, 100 - suffixText.Length);
            var value = $"{baseVersion[..Math.Min(baseVersion.Length, prefixLength)]}{suffixText}";
            if (!existing.Contains(value)) return value;
        }
    }

    internal sealed class PpeNormImportScope(string departmentName, string positionName)
    {
        public string DepartmentName { get; } = departmentName;
        public string PositionName { get; } = positionName;
        public List<PpeNormImportRow> Rows { get; } = [];
    }

    internal sealed record PpeNormImportRow(
        Guid Id,
        Guid? ParentRowId,
        string RowType,
        int SortOrder,
        string NormItemName,
        string NormPoint,
        string IssuePeriodText,
        decimal Quantity,
        string QuantityText,
        int? LifeMonths,
        string UnitSymbol,
        int? PeriodMonths,
        string AlternativeGroup);

    internal sealed record PpeNormImportDocument(
        IReadOnlyList<PpeNormImportScope> Scopes,
        int SourceRows,
        int GroupsCreated,
        int ItemsCreated,
        int SkippedRows,
        IReadOnlyList<string> Warnings);
}

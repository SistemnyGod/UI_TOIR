using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text.RegularExpressions;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed partial class EfInventoryWorkflowService
{
    internal sealed record PpeEntitlementResolution(
        decimal NormQuantity,
        decimal AlreadyIssuedQuantity,
        decimal AvailableQuantity,
        DateOnly? PeriodFrom,
        DateOnly? PeriodTo,
        string Status,
        IReadOnlyList<string> Warnings);

    internal static PpeEntitlementResolution CalculatePpeEntitlement(
        decimal normQuantity,
        decimal alreadyIssuedQuantity,
        DateOnly? periodFrom,
        DateOnly? periodTo,
        string status = "resolved",
        IReadOnlyList<string>? warnings = null)
    {
        var normalizedStatus = status is "manual_control_required" or "not_applicable" ? status : "resolved";
        var available = normalizedStatus == "manual_control_required"
            ? 0m
            : normalizedStatus == "not_applicable"
                ? decimal.MaxValue
                : Math.Max(0m, normQuantity - alreadyIssuedQuantity);
        return new(
            Math.Max(0m, normQuantity),
            Math.Max(0m, alreadyIssuedQuantity),
            available,
            periodFrom,
            periodTo,
            normalizedStatus,
            warnings ?? []);
    }

    private PpeEntitlementResolution ResolvePpeEntitlement(
        Guid employeeId,
        Guid? sourceNormRowId,
        decimal normQuantity,
        string issuePeriodText,
        int? lifeMonths,
        DateOnly issueDate)
    {
        if (sourceNormRowId is null)
        {
            return CalculatePpeEntitlement(normQuantity, 0, null, null, "not_applicable");
        }

        if (!TryResolvePpePeriod(issuePeriodText, lifeMonths, issueDate, out var periodFrom, out var periodTo, out var periodWarning))
        {
            return CalculatePpeEntitlement(normQuantity, 0, null, null, "manual_control_required", [periodWarning]);
        }

        var periodStart = new DateTimeOffset(periodFrom.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var periodEndExclusive = new DateTimeOffset(periodTo.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var alreadyIssued = dbContext.InventoryPpeCardLines
            .Where(line => line.Card.EmployeeId == employeeId
                && line.CardNormRow != null
                && line.CardNormRow.SourceNormRowId == sourceNormRowId
                && (line.Status == "issued" || line.Status == "partial")
                && line.IssuedAt != null
                && line.IssuedAt.HasValue
                && line.IssuedAt.Value >= periodStart
                && line.IssuedAt.Value < periodEndExclusive)
            .Sum(line => (decimal?)line.Quantity) ?? 0m;

        return CalculatePpeEntitlement(normQuantity, alreadyIssued, periodFrom, periodTo);
    }

    private static bool TryResolvePpePeriod(
        string issuePeriodText,
        int? lifeMonths,
        DateOnly issueDate,
        out DateOnly periodFrom,
        out DateOnly periodTo,
        out string warning)
    {
        var text = (issuePeriodText ?? string.Empty).Trim().ToLowerInvariant().Replace('ё', 'е');
        if (Regex.IsMatch(text, "до\\s+износ|дежур|сезон|по\\s+мере\\s+износ"))
        {
            periodFrom = default;
            periodTo = default;
            warning = "The norm period requires manual control before issue";
            return false;
        }

        var months = lifeMonths is > 0 ? lifeMonths : null;
        if (months is null)
        {
            var matches = Regex.Matches(
                text,
                "(?<count>\\d+(?:[.,]\\d+)?)\\s*(?<unit>год(?:а|ов)?|лет|месяц(?:а|ев)?|мес|квартал(?:а|ов)?)");
            var match = matches.Cast<Match>().LastOrDefault();
            if (match is not null
                && decimal.TryParse(match.Groups["count"].Value.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var count)
                && count > 0)
            {
                var unit = match.Groups["unit"].Value;
                months = unit.StartsWith("год", StringComparison.Ordinal) || unit == "лет"
                    ? (int)Math.Round(count * 12m, MidpointRounding.AwayFromZero)
                    : unit.StartsWith("кварт", StringComparison.Ordinal)
                        ? (int)Math.Round(count * 3m, MidpointRounding.AwayFromZero)
                        : (int)Math.Round(count, MidpointRounding.AwayFromZero);
            }
        }

        if (months is null or <= 0)
        {
            periodFrom = default;
            periodTo = default;
            warning = "The norm period is not structured and requires manual control";
            return false;
        }

        periodTo = issueDate;
        periodFrom = issueDate.AddMonths(-months.Value);
        warning = string.Empty;
        return true;
    }

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
            .OrderBy(row => row.Status == "draft" ? 0 : row.Status == "active" ? 1 : 2)
            .ThenByDescending(row => row.CreatedAt)
            .Select(row => row.Id)
            .FirstOrDefault();
        var cardDetail = card == Guid.Empty ? null : LoadPpeCard(card);

        var activeNormSet = dbContext.InventoryPpeNormSets
            .AsNoTracking()
            .Include(row => row.Rows)
            .Where(row => row.Status == "active" && !row.RequiresReview && row.ArchivedAt == null)
            .ToList()
            .Where(row => PositionNamesMatch(employee.Position, row.PositionName))
            .OrderByDescending(row => row.EffectiveFrom)
            .ThenByDescending(row => row.UpdatedAt)
            .FirstOrDefault();

        var cardDto = cardDetail is null ? null : MapPpeCardDetail(cardDetail);
        var normRows = cardDto?.NormRows?.ToList() ?? [];
        if (normRows.Count == 0 && cardDto is not null)
        {
            normRows = BuildLegacyNormRows(cardDto);
        }

        var recentHistory = GetPpeHistory(new InventoryListQuery(PageSize: 10, EmployeeId: employeeId)).Rows
            .Select(MapPpeHistoryToInventoryHistory)
            .ToList();
        var now = DateTime.UtcNow;
        var itemRows = normRows.Where(row => row.RowType == "item").ToList();

        return Success(new InventoryPpeWorkspaceDto(
            MapEmployee(employee),
            cardDto,
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

    public IReadOnlyList<InventoryPpeNormCandidateDto> GetPpeNormCandidates(Guid itemId, Guid employeeId, decimal quantity, DateOnly? issueDate)
    {
        var employee = dbContext.Employees.AsNoTracking().FirstOrDefault(row => row.Id == employeeId);
        if (employee is null) return [];

        var item = dbContext.InventoryItems
            .AsNoTracking()
            .Include(row => row.Category)
            .Include(row => row.Unit)
            .FirstOrDefault(row => row.Id == itemId && row.IsActive);
        if (item is null) return [];

        var effectiveDate = issueDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var normSet = dbContext.InventoryPpeNormSets
            .AsNoTracking()
            .Include(row => row.Rows).ThenInclude(row => row.Mappings)
            .Where(row => row.Status == "active" && !row.RequiresReview && row.ArchivedAt == null)
            .ToList()
            .Where(row => PositionNamesMatch(employee.Position, row.PositionName))
            .Where(row => (!row.EffectiveFrom.HasValue || row.EffectiveFrom.Value <= effectiveDate) && (!row.EffectiveTo.HasValue || row.EffectiveTo.Value >= effectiveDate))
            .OrderByDescending(row => row.EffectiveFrom)
            .ThenByDescending(row => row.UpdatedAt)
            .FirstOrDefault();
        if (normSet is null) return [];

        return BuildPpeNormCandidates(employeeId, item, normSet, effectiveDate, quantity);
    }

    private IReadOnlyList<InventoryPpeNormCandidateDto> BuildPpeNormCandidates(
        Guid employeeId,
        InventoryItemEntity item,
        InventoryPpeNormSetEntity normSet,
        DateOnly effectiveDate,
        decimal quantity,
        IReadOnlyDictionary<Guid, PpeEntitlementResolution>? precomputedEntitlements = null,
        IReadOnlyDictionary<Guid, int>? precomputedPreviousConfirmedCounts = null)
    {
        var itemId = item.Id;

        var itemText = string.Join(" ", item.Name, item.NormItemName, item.ActualItemName, item.ItemKind,
            item.Category?.Name, item.Unit?.Name, item.BrandName, item.ModelName, item.Article, item.ProtectionClass);
        var normRowsById = normSet.Rows.ToDictionary(row => row.Id);
        var candidates = new List<InventoryPpeNormCandidateDto>();
        foreach (var normRow in normSet.Rows.Where(row => row.RowType == "item"))
        {
            var mapping = normRow.Mappings.FirstOrDefault(row => row.ItemId == itemId && row.ArchivedAt == null);
            var parentText = normRow.ParentRowId is { } parentId && normRowsById.TryGetValue(parentId, out var parentRow)
                ? parentRow.NormItemName
                : string.Empty;
            var compatibility = EvaluatePpeNormTextCompatibility(itemText, string.Join(" ", parentText, normRow.NormItemName));
            var itemKinds = DetectPpeKinds(NormalizeNormLookupText(itemText));
            var textSuggested = compatibility.IsCompatible;
            var entitlement = precomputedEntitlements is not null && precomputedEntitlements.TryGetValue(normRow.Id, out var precomputedEntitlement)
                ? precomputedEntitlement
                : ResolvePpeEntitlement(employeeId, normRow.Id, normRow.Quantity, normRow.IssuePeriodText, normRow.LifeMonths, effectiveDate);
            var alreadyIssued = entitlement.AlreadyIssuedQuantity;
            var available = entitlement.AvailableQuantity;
            int? resolvedLifeMonths = normRow.LifeMonths;
            if (resolvedLifeMonths is null
                && entitlement.PeriodFrom is { } periodFrom
                && entitlement.PeriodTo is { } periodTo)
            {
                resolvedLifeMonths = (periodTo.Year - periodFrom.Year) * 12 + periodTo.Month - periodFrom.Month;
            }
            var previousConfirmedCount = precomputedPreviousConfirmedCounts is not null
                ? precomputedPreviousConfirmedCounts.GetValueOrDefault(normRow.Id)
                : dbContext.InventoryPpeCardLines
                    .Count(line => line.Card.EmployeeId == employeeId
                        && line.CardNormRow != null
                        && line.CardNormRow.SourceNormRowId == normRow.Id
                        && line.ItemId == itemId
                        && (line.Status == "issued" || line.Status == "partial"));
            var status = ResolvePpeNormCandidateStatus(
                mapping is not null,
                textSuggested,
                entitlement.Status,
                available,
                quantity);
            var reasons = mapping is not null
                ? new[] { "Сохранённое соответствие этой номенклатуры с нормой найдено" }
                : textSuggested
                    ? compatibility.Reasons
                    : new[] { "Совместимость по виду СИЗ, сезонности и описанию не подтверждена" };
            var warnings = new List<string>(entitlement.Warnings);
            if (available < quantity) warnings.Add("Доступный остаток нормы меньше выбранного количества");
            if (mapping is null) warnings.Add("Соответствие ещё не подтверждено");
            var itemUnit = NormalizePpeUnit(string.Join(" ", item.Unit?.Name, item.Unit?.Symbol));
            var normUnit = NormalizePpeUnit(normRow.QuantityText);
            if (itemKinds.Contains("обувь", StringComparer.Ordinal)
                && itemUnit.Length > 0
                && normUnit.Length > 0
                && itemUnit != normUnit)
            {
                warnings.Add($"Единица номенклатуры «{itemUnit}» отличается от единицы нормы «{normUnit}» — проверьте количество");
            }
            if (previousConfirmedCount > 0) reasons = [.. reasons, $"Ранее использовалось в выдачах: {previousConfirmedCount}"];
            candidates.Add(new InventoryPpeNormCandidateDto(
                normRow.Id,
                normSet.Id,
                normSet.Version,
                normRow.NormItemName,
                normRow.NormPoint,
                normRow.Quantity,
                normRow.QuantityText,
                normRow.IssuePeriodText,
                resolvedLifeMonths,
                alreadyIssued,
                available,
                mapping?.Id,
                previousConfirmedCount,
                status,
                reasons,
                warnings,
                normRow.SortOrder));
        }

        return OrderPpeNormCandidates(candidates);
    }

    public InventoryPpeNormCandidateBatchResponseDto GetPpeNormCandidatesBatch(InventoryPpeNormCandidateBatchRequestDto request)
    {
        var distinctItems = request.Items
            .GroupBy(row => row.SelectionId, StringComparer.Ordinal)
            .Select(group => group.First())
            .ToList();
        var employee = dbContext.Employees.AsNoTracking().FirstOrDefault(row => row.Id == request.EmployeeId);
        if (employee is null)
        {
            return new(distinctItems.Select(row => UnmatchedBatchItem(row, "Сотрудник не найден")).ToList(), "employee_missing");
        }

        var effectiveDate = request.IssueDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var normSet = dbContext.InventoryPpeNormSets
            .AsNoTracking()
            .Include(row => row.Rows).ThenInclude(row => row.Mappings)
            .Where(row => row.Status == "active" && row.ArchivedAt == null)
            .ToList()
            .Where(row => PositionNamesMatch(employee.Position, row.PositionName))
            .Where(row => (!row.EffectiveFrom.HasValue || row.EffectiveFrom.Value <= effectiveDate)
                && (!row.EffectiveTo.HasValue || row.EffectiveTo.Value >= effectiveDate))
            .OrderByDescending(row => row.EffectiveFrom)
            .ThenByDescending(row => row.UpdatedAt)
            .FirstOrDefault();

        if (normSet is null)
        {
            return new(distinctItems.Select(row => UnmatchedBatchItem(row, "Для должности сотрудника не найден опубликованный набор норм АТОМ")).ToList(), "norm_set_missing");
        }

        if (normSet.RequiresReview)
        {
            return new(
                distinctItems.Select(row => UnmatchedBatchItem(row, "Опубликованный набор норм АТОМ требует проверки и не может использоваться для выдачи")).ToList(),
                "norm_set_requires_review");
        }

        var itemIds = distinctItems.Select(row => row.ItemId).Distinct().ToList();
        var items = dbContext.InventoryItems
            .AsNoTracking()
            .Include(row => row.Category)
            .Include(row => row.Unit)
            .Where(row => itemIds.Contains(row.Id) && row.IsActive)
            .ToDictionary(row => row.Id);
        var normRowIds = normSet.Rows.Where(row => row.RowType == "item").Select(row => row.Id).ToHashSet();
        var entitlementByNormRow = BuildPpeBatchEntitlements(request.EmployeeId, normSet.Rows, effectiveDate);
        var previousConfirmedCounts = dbContext.InventoryPpeCardLines
            .AsNoTracking()
            .Where(line => line.Card.EmployeeId == request.EmployeeId
                && line.CardNormRow != null
                && line.CardNormRow.SourceNormRowId != null
                && normRowIds.Contains(line.CardNormRow.SourceNormRowId.Value)
                && itemIds.Contains(line.ItemId)
                && (line.Status == "issued" || line.Status == "partial"))
            .GroupBy(line => new { NormRowId = line.CardNormRow!.SourceNormRowId!.Value, line.ItemId })
            .ToDictionary(group => (group.Key.NormRowId, group.Key.ItemId), group => group.Count());

        var response = new List<InventoryPpeNormCandidateBatchItemDto>(distinctItems.Count);
        foreach (var itemRequest in distinctItems)
        {
            if (!items.TryGetValue(itemRequest.ItemId, out var item))
            {
                response.Add(UnmatchedBatchItem(itemRequest, "Позиция номенклатуры не найдена или неактивна"));
                continue;
            }

            var itemPreviousCounts = previousConfirmedCounts
                .Where(entry => entry.Key.Item2 == itemRequest.ItemId)
                .ToDictionary(entry => entry.Key.Item1, entry => entry.Value);
            var candidates = BuildPpeNormCandidates(
                request.EmployeeId,
                item,
                normSet,
                effectiveDate,
                itemRequest.Quantity,
                entitlementByNormRow,
                itemPreviousCounts);
            var compatible = candidates
                .Where(candidate => candidate.Status is "confirmed_mapping" or "candidate")
                .Where(candidate => candidate.AvailableQuantity >= itemRequest.Quantity)
                .OrderBy(candidate => candidate.Status == "confirmed_mapping" ? 0 : 1)
                .ThenBy(candidate => candidate.PreviouslyConfirmedCount > 0 ? 0 : 1)
                .ThenBy(candidate => candidate.SortOrder)
                .ThenBy(candidate => candidate.NormItemName, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (compatible.Count == 0)
            {
                var unmatchedWarnings = candidates.SelectMany(candidate => candidate.Warnings).Distinct(StringComparer.Ordinal).ToList();
                var unmatchedReasons = candidates.SelectMany(candidate => candidate.Reasons).Distinct(StringComparer.Ordinal).ToList();
                if (unmatchedReasons.Count == 0) unmatchedReasons.Add("Подходящая норма для выбранной позиции не найдена");
                response.Add(new(itemRequest.SelectionId, itemRequest.ItemId, "unmatched", null, [], unmatchedReasons, unmatchedWarnings));
                continue;
            }

            var selected = compatible[0];
            var isSaved = selected.Status == "confirmed_mapping";
            var isUnique = compatible.Count == 1;
            var resolution = isSaved || isUnique ? "confirmed" : "review_required";
            var alternatives = compatible.Skip(1).Take(5).ToList();
            var warnings = selected.Warnings.Concat(alternatives.SelectMany(candidate => candidate.Warnings)).Distinct(StringComparer.Ordinal).ToList();
            var reasons = selected.Reasons.Concat(alternatives.SelectMany(candidate => candidate.Reasons)).Distinct(StringComparer.Ordinal).ToList();
            if (!isSaved && !isUnique) reasons.Insert(0, "Найдено несколько подходящих норм — подтвердите выбор бухгалтера");
            response.Add(new(itemRequest.SelectionId, itemRequest.ItemId, resolution, selected, alternatives, reasons, warnings));
        }

        return new(response, normSet.RequiresReview ? "norm_set_requires_review" : null);
    }

    private Dictionary<Guid, PpeEntitlementResolution> BuildPpeBatchEntitlements(
        Guid employeeId,
        IEnumerable<InventoryPpeNormRowEntity> normRows,
        DateOnly effectiveDate)
    {
        var rows = normRows.Where(row => row.RowType == "item").ToList();
        var rowIds = rows.Select(row => row.Id).ToHashSet();
        var issuedLines = dbContext.InventoryPpeCardLines
            .AsNoTracking()
            .Where(line => line.Card.EmployeeId == employeeId
                && line.CardNormRow != null
                && line.CardNormRow.SourceNormRowId != null
                && rowIds.Contains(line.CardNormRow.SourceNormRowId.Value)
                && (line.Status == "issued" || line.Status == "partial")
                && line.IssuedAt != null)
            .Select(line => new
            {
                NormRowId = line.CardNormRow!.SourceNormRowId!.Value,
                line.IssuedAt,
                line.Quantity
            })
            .ToList();

        var result = new Dictionary<Guid, PpeEntitlementResolution>();
        foreach (var row in rows)
        {
            if (!TryResolvePpePeriod(row.IssuePeriodText, row.LifeMonths, effectiveDate, out var periodFrom, out var periodTo, out var periodWarning))
            {
                result[row.Id] = CalculatePpeEntitlement(row.Quantity, 0, null, null, "manual_control_required", [periodWarning]);
                continue;
            }

            var periodStart = new DateTimeOffset(periodFrom.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            var periodEndExclusive = new DateTimeOffset(periodTo.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            var alreadyIssued = issuedLines
                .Where(line => line.NormRowId == row.Id
                    && line.IssuedAt.HasValue
                    && line.IssuedAt.Value >= periodStart
                    && line.IssuedAt.Value < periodEndExclusive)
                .Sum(line => line.Quantity);
            result[row.Id] = CalculatePpeEntitlement(row.Quantity, alreadyIssued, periodFrom, periodTo);
        }

        return result;
    }

    private static InventoryPpeNormCandidateBatchItemDto UnmatchedBatchItem(InventoryPpeNormCandidateBatchLineDto item, string reason) =>
        new(item.SelectionId, item.ItemId, "unmatched", null, [], [reason], []);

    internal static string ResolvePpeNormCandidateStatus(
        bool hasMapping,
        bool textSuggested,
        string entitlementStatus,
        decimal availableQuantity,
        decimal requestedQuantity)
    {
        if (!hasMapping && !textSuggested) return "incompatible";
        if (entitlementStatus == "manual_control_required") return "manual_control_required";
        if (availableQuantity < requestedQuantity) return "limit_exhausted";
        return hasMapping ? "confirmed_mapping" : "candidate";
    }

    internal static (bool IsCompatible, string[] Reasons) EvaluatePpeNormTextCompatibility(string? itemDescription, string? normDescription)
    {
        var itemText = NormalizeNormLookupText(itemDescription);
        var normText = NormalizeNormLookupText(normDescription);
        if (itemText.Length == 0 || normText.Length == 0) return (false, []);

        var itemKinds = DetectPpeKinds(itemText);
        var normKinds = DetectPpeKinds(normText);
        var commonKinds = itemKinds.Intersect(normKinds, StringComparer.Ordinal).ToArray();
        if (itemKinds.Count > 0 && normKinds.Count > 0 && commonKinds.Length == 0) return (false, []);

        var itemSeason = DetectPpeSeason(itemText);
        var normSeason = DetectPpeSeason(normText);
        if (itemSeason.Length > 0 && normSeason.Length > 0 && itemSeason != normSeason) return (false, []);

        var itemTokens = SignificantPpeTokens(itemText);
        var sharedTokens = SignificantPpeTokens(normText)
            .Where(itemTokens.Contains)
            .OrderByDescending(token => token.Length)
            .Take(4)
            .ToArray();
        var compatible = commonKinds.Length > 0 || sharedTokens.Length >= 2;
        if (!compatible) return (false, []);

        var reasons = new List<string>();
        if (commonKinds.Length > 0) reasons.Add($"Совпадает вид СИЗ: {string.Join(", ", commonKinds)}");
        if (itemSeason.Length > 0 && itemSeason == normSeason) reasons.Add($"Совпадает сезонность: {itemSeason}");
        if (sharedTokens.Length > 0) reasons.Add($"Совпадают признаки: {string.Join(", ", sharedTokens)}");
        return (true, reasons.ToArray());
    }

    private static HashSet<string> SignificantPpeTokens(string text) => text
        .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Where(token => token.Length >= 5 && !PpeNormGenericTokens.Contains(token))
        .ToHashSet(StringComparer.Ordinal);

    private static List<string> DetectPpeKinds(string text)
    {
        var result = new List<string>();
        if (ContainsAny(text, "обув", "ботин", "полубот", "сапог", "бахил")) result.Add("обувь");
        if (ContainsAny(text, "костюм", "комбинез", "куртк", "брюк", "халат", "белье", "одежд")) result.Add("одежда");
        if (ContainsAny(text, "перчат", "рукавиц")) result.Add("защита рук");
        if (ContainsAny(text, "каск", "головн", "подшлем")) result.Add("защита головы");
        if (ContainsAny(text, "очк", "щиток лиц", "защита глаз")) result.Add("защита глаз и лица");
        if (ContainsAny(text, "респиратор", "противогаз", "сизод", "органов дых")) result.Add("защита дыхания");
        if (ContainsAny(text, "наушник", "беруш")) result.Add("защита слуха");
        if (ContainsAny(text, "привяз", "страхов", "удерживающ")) result.Add("защита от падения");
        if (ContainsAny(text, "жилет")) result.Add("жилет");
        return result;
    }

    private static string DetectPpeSeason(string text)
    {
        if (ContainsAny(text, "зим", "утепл", "шерст", "мех")) return "зимняя";
        if (ContainsAny(text, "летн")) return "летняя";
        return string.Empty;
    }

    private static string NormalizePpeUnit(string? text)
    {
        var normalized = NormalizeNormLookupText(text);
        if (ContainsAny(normalized, "пар", "пара", "пары")) return "пар";
        if (ContainsAny(normalized, "шт", "штук", "штука", "единиц")) return "шт";
        return string.Empty;
    }

    private static bool ContainsAny(string text, params string[] values) => values.Any(value => text.Contains(value, StringComparison.Ordinal));

    private static readonly HashSet<string> PpeNormGenericTokens = new(StringComparer.Ordinal)
    {
        "защита", "защиты", "защитный", "защитная", "защитные", "средство", "средства", "работы", "работах",
        "специальный", "специальная", "специальные", "воздействий", "производственных", "общих", "изделие",
        "класса", "класс", "сотрудника", "мужской", "женский", "выдачи", "нормы", "атом"
    };

    internal static IReadOnlyList<InventoryPpeNormCandidateDto> OrderPpeNormCandidates(IEnumerable<InventoryPpeNormCandidateDto> candidates) =>
        candidates
            .OrderBy(candidate => candidate.Status switch
            {
                "confirmed_mapping" => 0,
                "candidate" => 1,
                "incompatible" => 2,
                "limit_exhausted" => 3,
                "manual_control_required" => 4,
                _ => 4
            })
            .ThenBy(candidate => candidate.PreviouslyConfirmedCount > 0 ? 0 : 1)
            .ThenBy(candidate => candidate.NormItemName)
            .ToList();

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
        if (NormalizeInventoryEmployeeStatus(employee.Status) != "active")
        {
            return Failure<InventoryPpeCardDetailDto>("employeeId", "Only an active employee can receive PPE");
        }

        var source = NormalizeStatus(request.Source);
        if (source is not ("active_norms" or "previous_card" or "empty"))
        {
            return Failure<InventoryPpeCardDetailDto>("source", "Unsupported PPE card source");
        }

        var existingCard = dbContext.InventoryPpeCards
            .Where(row => row.EmployeeId == employee.Id && row.ArchivedAt == null)
            .OrderBy(row => row.Status == "draft" ? 0 : row.Status == "active" ? 1 : 2)
            .ThenByDescending(row => row.CreatedAt)
            .FirstOrDefault();
        if (existingCard is not null)
        {
            if (existingCard.Status == "draft") return Success(MapPpeCardDetail(LoadPpeCard(existingCard.Id)!));
            existingCard.Status = "draft";
            existingCard.IssueType = NormalizePpeDraftIssueType(request.IssueType);
            existingCard.ResponsibleName = NormalizePrintField(request.ResponsibleName, string.Empty, 240);
            existingCard.Basis = NormalizePrintField(request.Basis, string.Empty, 600);
            existingCard.Comment = NormalizeOptional(request.Comment);
            ApplyPpeEmployeeDetails(existingCard, request.EmployeeDetails);
            existingCard.Version += 1;
            AddSystemLog("ppe_card", existingCard.Id, "draft_reopened", employee.FullName, DateTimeOffset.UtcNow);
            dbContext.SaveChanges();
            return Success(MapPpeCardDetail(LoadPpeCard(existingCard.Id)!));
        }

        InventoryPpeNormSetEntity? normSet = null;
        if (source == "active_norms")
        {
            normSet = request.NormSetId is not null
                ? dbContext.InventoryPpeNormSets.Include(row => row.Rows).ThenInclude(row => row.Mappings).FirstOrDefault(row => row.Id == request.NormSetId && row.Status == "active" && !row.RequiresReview && row.ArchivedAt == null)
                : dbContext.InventoryPpeNormSets.Include(row => row.Rows).ThenInclude(row => row.Mappings)
                    .Where(row => row.Status == "active" && !row.RequiresReview && row.ArchivedAt == null)
                    .ToList()
                    .Where(row => PositionNamesMatch(employee.Position, row.PositionName))
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
        try
        {
            dbContext.SaveChanges();
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            var competingCard = dbContext.InventoryPpeCards.AsNoTracking()
                .Any(row => row.EmployeeId == employee.Id && row.ArchivedAt == null);
            if (competingCard) return Failure<InventoryPpeCardDetailDto>("conflict", "У сотрудника уже есть действующая карточка СИЗ");
            throw;
        }
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
            row.DraftIssuedAt = row.RowType == "group" ? null : requestRow.DraftIssuedAt;
            row.DraftQuantity = row.RowType == "group" ? null : requestRow.DraftQuantity;
            row.DraftUnitPriceMinor = row.RowType == "group" ? null : requestRow.DraftUnitPriceMinor;
            row.DraftIssueMethod = row.RowType == "group" ? "personal" : NormalizeStatus(requestRow.DraftIssueMethod);
            row.DraftSizeText = row.RowType == "group" ? string.Empty : NormalizeOptional(requestRow.DraftSizeText);
            row.DraftWarehouseId = row.RowType == "group" ? null : requestRow.DraftWarehouseId;
            row.DraftComment = row.RowType == "group" ? string.Empty : NormalizeOptional(requestRow.DraftComment);
            row.DraftBrandModelArticle = row.RowType == "group" ? string.Empty : NormalizePrintField(requestRow.DraftBrandModelArticle, row.BrandModelArticle, 600);
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
            .Include(row => row.SourceNormRow).ThenInclude(row => row!.NormSet)
            .FirstOrDefault(row => row.Id == request.CardNormRowId && row.CardId == cardId);
        if (normRow is null) return Failure<InventoryPpeCardLineDto>("cardNormRowId", "PPE norm row not found");
        if (request.ExpectedVersion is not null && normRow.Card.Version != request.ExpectedVersion)
        {
            return Failure<InventoryPpeCardLineDto>("conflict", "PPE card was changed by another user");
        }
        if (normRow.RowType != "item") return Failure<InventoryPpeCardLineDto>("cardNormRowId", "PPE group cannot be issued");
        var item = dbContext.InventoryItems.FirstOrDefault(row => row.Id == request.ItemId && row.IsActive);
        if (item is null) return Failure<InventoryPpeCardLineDto>("itemId", "PPE item not found");
        if (RequiresPpeSize(item) && string.IsNullOrWhiteSpace(request.SizeText)) return Failure<InventoryPpeCardLineDto>("sizeText", "A size is required for this PPE item");
        if (normRow.SourceNormRowId is null)
        {
            return Failure<InventoryPpeCardLineDto>("isAdditional", "Use the batch additional issue flow for a line without an ATOM norm");
        }
        var allowedItemIds = normRow.SourceNormRow?.Mappings
            .Where(row => row.ArchivedAt == null)
            .Select(row => row.ItemId)
            .ToHashSet() ?? [];
        if (normRow.MappedItemId != item.Id && !allowedItemIds.Contains(item.Id))
        {
            return Failure<InventoryPpeCardLineDto>("itemId", "Selected PPE item is not allowed by the published norm mapping");
        }
        if (request.Quantity <= 0) return Failure<InventoryPpeCardLineDto>("quantity", "Quantity must be greater than zero");
        var issueDate = DateOnly.FromDateTime(request.IssuedAt.UtcDateTime);
        var sourceNorm = normRow.SourceNormRow;
        if (sourceNorm is null || sourceNorm.NormSet is null) return Failure<InventoryPpeCardLineDto>("normVersion", "The ATOM norm version for this line is no longer available");
        if (sourceNorm.NormSet.RequiresReview) return Failure<InventoryPpeCardLineDto>("normVersion", "The ATOM norm version requires review before issue");
        if ((sourceNorm.NormSet.EffectiveFrom.HasValue && sourceNorm.NormSet.EffectiveFrom.Value > issueDate)
            || (sourceNorm.NormSet.EffectiveTo.HasValue && sourceNorm.NormSet.EffectiveTo.Value < issueDate))
        {
            return Failure<InventoryPpeCardLineDto>("normDate", "The issue date is outside the ATOM norm validity period");
        }
        var entitlement = ResolvePpeEntitlement(normRow.Card.EmployeeId, normRow.SourceNormRowId, normRow.Quantity, normRow.IssuePeriodText, normRow.LifeMonths, issueDate);
        if (entitlement.Status == "manual_control_required") return Failure<InventoryPpeCardLineDto>("entitlement", "The norm period requires manual control before issue");
        if (request.Quantity > entitlement.AvailableQuantity) return Failure<InventoryPpeCardLineDto>("quantity", $"Available norm quantity is {entitlement.AvailableQuantity}");
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
            .Include(row => row.NormRows).ThenInclude(row => row.SourceNormRow).ThenInclude(row => row!.NormSet)
            .FirstOrDefault(row => row.Id == cardId && row.ArchivedAt == null);
        if (card is null) return Failure<InventoryPpeCardDetailDto>("cardId", "PPE card not found");
        var idempotencyKey = NormalizeOptional(request.IdempotencyKey);
        if (idempotencyKey.Length > 0 && string.Equals(card.LastIssueBatchKey, idempotencyKey, StringComparison.Ordinal))
        {
            return Success(MapPpeCardDetail(LoadPpeCard(card.Id)!));
        }
        var employee = dbContext.Employees.FirstOrDefault(row => row.Id == card.EmployeeId);
        if (employee is null || NormalizeInventoryEmployeeStatus(employee.Status) != "active")
        {
            return Failure<InventoryPpeCardDetailDto>("employeeId", "Only an active employee can receive PPE");
        }
        if (card.Version != request.ExpectedVersion) return Failure<InventoryPpeCardDetailDto>("conflict", "PPE card was changed by another user");

        var normRows = card.NormRows.ToDictionary(row => row.Id);
        var itemIds = request.Lines.Select(row => row.ItemId).Distinct().ToList();
        var items = dbContext.InventoryItems.Where(row => itemIds.Contains(row.Id) && row.IsActive).ToDictionary(row => row.Id);
        var prepared = new List<(CreateInventoryPpeIssueBatchLineDto Request, InventoryPpeCardNormRowEntity NormRow, InventoryItemEntity Item, string Method)>();
        var requestedStock = new Dictionary<(Guid ItemId, Guid WarehouseId), decimal>();
        foreach (var requested in request.Lines)
        {
            if (!normRows.TryGetValue(requested.CardNormRowId, out var normRow) || normRow.RowType != "item")
            {
                return Failure<InventoryPpeCardDetailDto>("cardNormRowId", "PPE norm row not found or is not issuable");
            }
            if (!items.TryGetValue(requested.ItemId, out var item)) return Failure<InventoryPpeCardDetailDto>("itemId", "PPE item not found");
            if (requested.Quantity <= 0) return Failure<InventoryPpeCardDetailDto>("quantity", "Quantity must be greater than zero");
            if (RequiresPpeSize(item) && string.IsNullOrWhiteSpace(requested.SizeText)) return Failure<InventoryPpeCardDetailDto>("sizeText", "A size is required for this PPE item");
            var effectivePrice = requested.UnitPriceMinor ?? normRow.DefaultUnitPriceMinor ?? item.DefaultUnitPriceMinor;
            if (effectivePrice is null || effectivePrice <= 0) return Failure<InventoryPpeCardDetailDto>("unitPriceMinor", "A positive unit price is required");
            if (requested.WarehouseId is null || !dbContext.InventoryWarehouses.Any(row => row.Id == requested.WarehouseId.Value && !row.IsArchived)) return Failure<InventoryPpeCardDetailDto>("warehouseId", "An active warehouse is required");
            var method = NormalizeStatus(requested.IssueMethod);
            if (method is not ("personal" or "dispenser")) return Failure<InventoryPpeCardDetailDto>("issueMethod", "Unsupported issue method");
            var isAdditional = requested.IsAdditional;
            if (normRow.SourceNormRowId is null && !isAdditional)
            {
                return Failure<InventoryPpeCardDetailDto>("isAdditional", "A PPE line without an ATOM norm must be explicitly marked as additional");
            }
            if (normRow.SourceNormRowId is not null && isAdditional)
            {
                return Failure<InventoryPpeCardDetailDto>("isAdditional", "A line linked to an ATOM norm cannot be issued as additional");
            }
            if (isAdditional && (string.IsNullOrWhiteSpace(card.Basis) || string.IsNullOrWhiteSpace(card.ResponsibleName) || string.IsNullOrWhiteSpace(requested.Comment)))
            {
                return Failure<InventoryPpeCardDetailDto>("comment", "Additional PPE issue requires a reason, basis and responsible person");
            }
            if (!isAdditional)
            {
                var sourceNorm = normRow.SourceNormRow;
                var normValidationDate = DateOnly.FromDateTime(requested.IssuedAt.UtcDateTime);
                if (sourceNorm is null || sourceNorm.NormSet is null)
                {
                    return Failure<InventoryPpeCardDetailDto>("normVersion", "The ATOM norm version for this line is no longer available");
                }
                if (sourceNorm.NormSet.RequiresReview)
                {
                    return Failure<InventoryPpeCardDetailDto>("normVersion", "The ATOM norm version requires review before issue");
                }
                if ((sourceNorm.NormSet.EffectiveFrom.HasValue && sourceNorm.NormSet.EffectiveFrom.Value > normValidationDate)
                    || (sourceNorm.NormSet.EffectiveTo.HasValue && sourceNorm.NormSet.EffectiveTo.Value < normValidationDate))
                {
                    return Failure<InventoryPpeCardDetailDto>("normDate", "The issue date is outside the ATOM norm validity period");
                }
            }
            var warehouseId = requested.WarehouseId.Value;
            var stockKey = (item.Id, warehouseId);
            var alreadyRequested = requestedStock.GetValueOrDefault(stockKey);
            var availableStock = GetAvailableStock(item.Id, warehouseId);
            if (requested.Quantity > availableStock - alreadyRequested)
            {
                return Failure<InventoryPpeCardDetailDto>("warehouseId", $"Insufficient stock for {item.Name}: available {Math.Max(0m, availableStock - alreadyRequested)}");
            }
            requestedStock[stockKey] = alreadyRequested + requested.Quantity;
            var allowedItemIds = normRow.SourceNormRow?.Mappings.Where(row => row.ArchivedAt == null).Select(row => row.ItemId).ToHashSet() ?? [];
            var hasResolvedMapping = normRow.MappedItemId == item.Id || allowedItemIds.Contains(item.Id);
            if (!isAdditional && !hasResolvedMapping)
            {
                return Failure<InventoryPpeCardDetailDto>("itemId", "Selected PPE item is not allowed by the published norm mapping");
            }
            var issueDate = DateOnly.FromDateTime(requested.IssuedAt.UtcDateTime);
            var entitlement = ResolvePpeEntitlement(card.EmployeeId, normRow.SourceNormRowId, normRow.Quantity, normRow.IssuePeriodText, normRow.LifeMonths, issueDate);
            if (!isAdditional && entitlement.Status == "manual_control_required")
            {
                return Failure<InventoryPpeCardDetailDto>("entitlement", "The norm period requires manual control before issue");
            }
            if (!isAdditional && requested.Quantity > entitlement.AvailableQuantity)
            {
                return Failure<InventoryPpeCardDetailDto>("quantity", $"Available norm quantity is {entitlement.AvailableQuantity}");
            }
            prepared.Add((requested, normRow, item, method));
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var preparedLine in prepared)
        {
            var requested = preparedLine.Request;
            var normRow = preparedLine.NormRow;
            var item = preparedLine.Item;
            var isAdditional = requested.IsAdditional;
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
            AddPpeStockMoveIfNeeded(line, string.Empty, line.Status, now);
            normRow.MappedItemId ??= item.Id;
            if (requested.SaveMappingOnSuccess && !isAdditional && normRow.SourceNormRow is not null)
            {
                if (requested.MakeDefaultMapping)
                {
                    foreach (var other in dbContext.InventoryPpeNormCatalogMappings.Where(row => row.NormRowId == normRow.SourceNormRow.Id && row.ArchivedAt == null)) other.IsDefault = false;
                }
                var mapping = dbContext.InventoryPpeNormCatalogMappings.FirstOrDefault(row => row.NormRowId == normRow.SourceNormRow.Id && row.ItemId == item.Id);
                if (mapping is null)
                {
                    mapping = new InventoryPpeNormCatalogMappingEntity { Id = Guid.NewGuid(), NormRowId = normRow.SourceNormRow.Id, ItemId = item.Id, CreatedAt = now };
                    dbContext.InventoryPpeNormCatalogMappings.Add(mapping);
                }
                mapping.BrandModelArticle = NormalizeOptional(requested.BrandModelArticle);
                mapping.DefaultUnitPriceMinor = requested.UnitPriceMinor ?? item.DefaultUnitPriceMinor;
                mapping.IsDefault = requested.MakeDefaultMapping;
                mapping.UpdatedAt = now;
                mapping.ArchivedAt = null;
            }
            AddPpeEvent(line.Id, "issued", string.Empty, "issued", line.Comment, now);
            AddPpeLineSystemLog(line, "issued", "PPE issue fact created in batch", now);
        }

        card.Status = "active";
        card.LastIssueBatchKey = idempotencyKey.Length == 0 ? null : idempotencyKey;
        foreach (var preparedLine in prepared)
        {
            preparedLine.NormRow.DraftIssuedAt = null;
            preparedLine.NormRow.DraftQuantity = null;
            preparedLine.NormRow.DraftUnitPriceMinor = null;
            preparedLine.NormRow.DraftSizeText = string.Empty;
            preparedLine.NormRow.DraftWarehouseId = null;
            preparedLine.NormRow.DraftComment = string.Empty;
            preparedLine.NormRow.DraftBrandModelArticle = string.Empty;
        }
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

    private static bool RequiresPpeSize(InventoryItemEntity item) => NormalizeStatus(item.TrackingType) is "size" or "size_quantity";

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

    private InventoryPpeCardNormRowDto MapCardNormRow(InventoryPpeCardNormRowEntity row, DateOnly? issueDate = null)
    {
        var activeIssues = row.Issues.Where(issue => issue.Status is "issued" or "partial").ToList();
        var issuedQuantity = activeIssues.Sum(issue => issue.Quantity);
        var coverage = row.RowType == "group" ? "group"
            : activeIssues.Any(issue => issue.DueAt is not null && issue.DueAt < DateTimeOffset.UtcNow) ? "overdue"
            : issuedQuantity <= 0 ? "not_issued"
            : issuedQuantity < row.Quantity ? "partial" : "issued";
        var entitlement = row.RowType == "item"
            ? ResolvePpeEntitlement(
                row.Card.EmployeeId,
                row.SourceNormRowId,
                row.Quantity,
                row.IssuePeriodText,
                row.LifeMonths,
                issueDate ?? DateOnly.FromDateTime(DateTime.UtcNow))
            : CalculatePpeEntitlement(0, 0, null, null, "not_applicable");
        return new InventoryPpeCardNormRowDto(
            row.Id, row.SourceNormRowId, row.ParentRowId, row.RowType, row.SortOrder, row.NormItemName,
            row.NormPoint, row.IssuePeriodText, row.Quantity, row.QuantityText, row.LifeMonths,
            row.MappedItemId, row.MappedItem?.Name ?? string.Empty, row.BrandModelArticle, row.DefaultUnitPriceMinor,
            coverage, issuedQuantity,
            row.SourceNormRow?.Mappings.Where(mapping => mapping.ArchivedAt == null).Select(MapNormMapping).ToList() ?? [],
            row.DraftIssuedAt?.UtcDateTime, row.DraftQuantity, row.DraftUnitPriceMinor, row.DraftIssueMethod,
            row.DraftSizeText, row.DraftWarehouseId, row.DraftComment, row.DraftBrandModelArticle,
            entitlement.AlreadyIssuedQuantity, entitlement.AvailableQuantity, entitlement.Status,
            entitlement.PeriodFrom, entitlement.PeriodTo, entitlement.Warnings);
    }

    private static InventoryPpeNormSetDto MapNormSet(InventoryPpeNormSetEntity row) =>
        new(row.Id, row.PositionName, row.VersionName, row.EffectiveFrom, row.EffectiveTo, row.SourceName, row.Status, row.RequiresReview, row.Version, row.Rows.Count);

    private static InventoryPpeNormRowDto MapNormRow(InventoryPpeNormRowEntity row) =>
        new(row.Id, row.ParentRowId, row.RowType, row.SortOrder, row.NormItemName, row.NormPoint, row.IssuePeriodText,
            row.Quantity, row.QuantityText, row.LifeMonths,
            row.Mappings.Where(mapping => mapping.ArchivedAt == null).OrderByDescending(mapping => mapping.IsDefault).Select(MapNormMapping).ToList());

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

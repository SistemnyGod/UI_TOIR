using Microsoft.EntityFrameworkCore;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence.Inventory;

internal sealed class EfPpeKitTemplateService(Patrol360DbContext db) : IPpeKitTemplateService
{
    public IReadOnlyList<PpeKitTemplateDto> Get(Guid userId) => db.InventoryPpeIssueTemplates.AsNoTracking().Include(x => x.Lines)
        .Where(x => !x.IsArchived && (x.OwnerUserId == userId || x.IsShared)).OrderByDescending(x => x.UpdatedAt).Select(Map).ToList();

    public InventoryCommandResult<PpeKitTemplateDto> Create(CreatePpeKitTemplateDto request, Guid userId, string userName, bool canManageShared)
    {
        if (userId == Guid.Empty) return Error("userId", "Не удалось определить владельца шаблона");
        if (string.IsNullOrWhiteSpace(userName) || userName.Trim().Length > 160) return Error("ownerName", "Имя владельца должно содержать от 1 до 160 символов");
        var invalid = Validate(request.Name, request.NormSetId, request.IsShared, request.Lines, canManageShared);
        if (invalid is not null) return invalid;
        var now = DateTimeOffset.UtcNow;
        var entity = new InventoryPpeIssueTemplateEntity { Id = Guid.NewGuid(), Name = request.Name.Trim(), NormSetId = request.NormSetId, OwnerUserId = userId, OwnerName = userName.Trim(), IsShared = request.IsShared, Version = 1, CreatedAt = now, UpdatedAt = now };
        ReplaceLines(entity, request.Lines);
        db.InventoryPpeIssueTemplates.Add(entity); db.SaveChanges();
        return Ok(Map(entity));
    }

    public InventoryCommandResult<PpeKitTemplateDto> Update(Guid id, UpdatePpeKitTemplateDto request, Guid userId, bool canManageShared)
    {
        var entity = Find(id, userId); if (entity is null) return Error("id", "Шаблон не найден");
        var denied = CanEdit(entity, userId, canManageShared); if (denied is not null) return denied;
        if (entity.Version != request.ExpectedVersion) return Error("conflict", "Шаблон уже изменён другим пользователем");
        var invalid = Validate(request.Name, entity.NormSetId, request.IsShared, request.Lines, canManageShared); if (invalid is not null) return invalid;
        entity.Name = request.Name.Trim(); entity.IsShared = request.IsShared; ReplaceLines(entity, request.Lines); Touch(entity); return Save(entity);
    }

    public InventoryCommandResult<PpeKitTemplateDto> Rename(Guid id, RenamePpeKitTemplateDto request, Guid userId, bool canManageShared)
    {
        var entity = Find(id, userId); if (entity is null) return Error("id", "Шаблон не найден");
        var denied = CanEdit(entity, userId, canManageShared); if (denied is not null) return denied;
        if (entity.Version != request.ExpectedVersion) return Error("conflict", "Шаблон уже изменён другим пользователем");
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 160) return Error("name", "Название шаблона должно содержать от 1 до 160 символов");
        entity.Name = request.Name.Trim(); Touch(entity); return Save(entity);
    }

    public InventoryCommandResult<PpeKitTemplateDto> Copy(Guid id, CopyPpeKitTemplateDto request, Guid userId, string userName, bool canManageShared)
    {
        var source = Find(id, userId); if (source is null) return Error("id", "Шаблон не найден");
        var name = string.IsNullOrWhiteSpace(request.Name) ? $"{source.Name} (копия)" : request.Name.Trim();
        return Create(new(name, source.NormSetId, request.IsShared, source.Lines.Select(x => new SavePpeKitTemplateLineDto(x.NormRowId, x.ItemId, x.ItemName, x.UnitSymbol, x.Quantity, x.LifeMonths, x.UnitPriceMinor)).ToList()), userId, userName, canManageShared);
    }

    public InventoryCommandResult<PpeKitTemplateDto> Apply(Guid id, Guid normSetId, Guid userId)
    {
        var entity = Find(id, userId); if (entity is null) return Error("id", "Шаблон не найден");
        if (entity.NormSetId != normSetId) return Error("normSetId", "Шаблон относится к другому набору норм");
        var pairs = entity.Lines.Select(x => new { x.NormRowId, x.ItemId }).ToList();
        var mappings = db.InventoryPpeNormCatalogMappings.AsNoTracking()
            .Include(x => x.NormRow).ThenInclude(x => x.NormSet)
            .Include(x => x.Item).ThenInclude(x => x.Unit)
            .Include(x => x.Item).ThenInclude(x => x.Category)
            .Where(x => pairs.Select(p => p.NormRowId).Contains(x.NormRowId)).ToList();
        var current = new List<PpeKitTemplateLineDto>();
        foreach (var line in entity.Lines)
        {
            var mapping = mappings.FirstOrDefault(x => x.NormRowId == line.NormRowId && x.ItemId == line.ItemId);
            if (mapping is null || !mapping.IsApproved || mapping.ArchivedAt != null || mapping.NormUnitsPerItem <= 0 || string.IsNullOrWhiteSpace(mapping.ApprovalEvidence)
                || mapping.NormRow.NormSetId != normSetId || mapping.NormRow.RowType != "item" || mapping.NormRow.NormSet.Status != "active" || mapping.NormRow.NormSet.ArchivedAt != null || mapping.NormRow.NormSet.RequiresReview)
                return Error("mapping", "В шаблоне есть товар, соответствие которого текущей норме больше не утверждено");
            if (!mapping.Item.IsActive || !IsPpe(mapping.Item)) return Error("itemId", "Выбранная номенклатура СИЗ больше недоступна");
            var unit = mapping.Item.Unit?.Symbol?.Trim() ?? string.Empty;
            if (unit.Length == 0 || NormalizeUnit(unit) != NormalizeUnit(mapping.NormRow.UnitSymbol)) return Error("mapping", "Единицы товара и нормы не совпадают");
            current.Add(new(line.NormRowId, line.ItemId, mapping.Item.Name, unit, line.Quantity, line.LifeMonths, line.UnitPriceMinor));
        }
        return Ok(new(entity.Id, entity.Name, entity.NormSetId, entity.OwnerUserId, entity.OwnerName, entity.IsShared, entity.Version, entity.UpdatedAt, current));
    }

    public InventoryCommandResult<PpeKitTemplateDto> Archive(Guid id, ArchivePpeKitTemplateDto request, Guid userId, bool canManageShared)
    {
        var entity = Find(id, userId); if (entity is null) return Error("id", "Шаблон не найден");
        var denied = CanEdit(entity, userId, canManageShared); if (denied is not null) return denied;
        if (entity.Version != request.ExpectedVersion) return Error("conflict", "Шаблон уже изменён другим пользователем");
        entity.IsArchived = true; Touch(entity); return Save(entity);
    }

    private InventoryPpeIssueTemplateEntity? Find(Guid id, Guid userId) => db.InventoryPpeIssueTemplates.Include(x => x.Lines).FirstOrDefault(x => x.Id == id && !x.IsArchived && (x.OwnerUserId == userId || x.IsShared));
    private static InventoryCommandResult<PpeKitTemplateDto>? CanEdit(InventoryPpeIssueTemplateEntity x, Guid userId, bool shared) => x.IsShared ? shared ? null : Error("permission", "Для изменения общих шаблонов требуется право управления нормами СИЗ") : x.OwnerUserId == userId ? null : Error("permission", "Изменять личный шаблон может только его владелец");
    private static InventoryCommandResult<PpeKitTemplateDto>? Validate(string name, Guid normSetId, bool isShared, IReadOnlyList<SavePpeKitTemplateLineDto> lines, bool canManageShared)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 160) return Error("name", "Название шаблона должно содержать от 1 до 160 символов");
        if (normSetId == Guid.Empty) return Error("normSetId", "Необходимо выбрать набор норм");
        if (isShared && !canManageShared) return Error("permission", "Для изменения общих шаблонов требуется право управления нормами СИЗ");
        if (lines is null || lines.Count == 0 || lines.Count > 500) return Error("lines", "Шаблон должен содержать от 1 до 500 позиций");
        if (lines.Any(x => x is null || x.NormRowId == Guid.Empty || x.ItemId == Guid.Empty || x.Quantity <= 0 || x.Quantity > 999_999_999.999m || decimal.Round(x.Quantity, 3) != x.Quantity || x.LifeMonths is <= 0 or > 1200 || x.UnitPriceMinor is < 0 || string.IsNullOrWhiteSpace(x.ItemName) || x.ItemName.Trim().Length > 500 || string.IsNullOrWhiteSpace(x.UnitSymbol) || x.UnitSymbol.Trim().Length > 40)) return Error("lines", "Позиции шаблона содержат недопустимые значения");
        if (lines.Select(x => (x.NormRowId, x.ItemId)).Distinct().Count() != lines.Count) return Error("lines", "Шаблон содержит повторяющиеся соответствия норм и товаров");
        return null;
    }
    private void ReplaceLines(InventoryPpeIssueTemplateEntity entity, IReadOnlyList<SavePpeKitTemplateLineDto> lines)
    {
        var requested = lines.ToDictionary(x => (x.NormRowId, x.ItemId));
        foreach (var existing in entity.Lines.ToList())
        {
            if (!requested.TryGetValue((existing.NormRowId, existing.ItemId), out var line)) { entity.Lines.Remove(existing); db.InventoryPpeIssueTemplateLines.Remove(existing); continue; }
            SetLine(existing, line); requested.Remove((existing.NormRowId, existing.ItemId));
        }
        foreach (var line in requested.Values)
        {
            var created = new InventoryPpeIssueTemplateLineEntity { Id = Guid.NewGuid(), TemplateId = entity.Id };
            SetLine(created, line);
            entity.Lines.Add(created);
            // A preassigned GUID on a new child of a tracked entity otherwise looks like an UPDATE to EF.
            if (db.Entry(entity).State != EntityState.Detached) db.Entry(created).State = EntityState.Added;
        }
    }
    private static void SetLine(InventoryPpeIssueTemplateLineEntity entity, SavePpeKitTemplateLineDto line) { entity.NormRowId = line.NormRowId; entity.ItemId = line.ItemId; entity.ItemName = (line.ItemName ?? "").Trim(); entity.UnitSymbol = (line.UnitSymbol ?? "").Trim(); entity.Quantity = line.Quantity; entity.LifeMonths = line.LifeMonths; entity.UnitPriceMinor = line.UnitPriceMinor; }
    private static void Touch(InventoryPpeIssueTemplateEntity entity) { entity.Version++; entity.UpdatedAt = DateTimeOffset.UtcNow; }
    private static string NormalizeUnit(string value) => value.Trim().TrimEnd('.').ToLowerInvariant() switch { "штука" or "штук" or "шт" => "шт", "пара" or "пар" => "пар", var unit => unit };
    private static bool IsPpe(InventoryItemEntity item) { var value = $"{item.ItemKind} {item.Category?.Name}".ToLowerInvariant(); return value.Contains("ppe") || value.Contains("siz") || value.Contains("сиз") || value.Contains("спец"); }
    private InventoryCommandResult<PpeKitTemplateDto> Save(InventoryPpeIssueTemplateEntity entity) { try { db.SaveChanges(); return Ok(Map(entity)); } catch (DbUpdateConcurrencyException) { return Error("conflict", "Шаблон уже изменён другим пользователем"); } }
    private static PpeKitTemplateDto Map(InventoryPpeIssueTemplateEntity x) => new(x.Id, x.Name, x.NormSetId, x.OwnerUserId, x.OwnerName, x.IsShared, x.Version, x.UpdatedAt, x.Lines.Select(line => new PpeKitTemplateLineDto(line.NormRowId, line.ItemId, line.ItemName, line.UnitSymbol, line.Quantity, line.LifeMonths, line.UnitPriceMinor)).ToList());
    private static InventoryCommandResult<PpeKitTemplateDto> Ok(PpeKitTemplateDto value) => new(value, new Dictionary<string, string[]>());
    private static InventoryCommandResult<PpeKitTemplateDto> Error(string key, string message) => new(null, new Dictionary<string, string[]> { [key] = [message] });
}

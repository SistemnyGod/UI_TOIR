using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Tools.PpeSmokeFixture;

public static class Program
{

    public static void Main()
    {
        var audit = Environment.GetEnvironmentVariable("PATROL360_PPE_AUDIT_CONNECTION");
        if (!string.IsNullOrWhiteSpace(audit))
        {
            PpeCopyAudit.Run(audit, Environment.GetEnvironmentVariable("PATROL360_PPE_AUDIT_OUTPUT") ?? throw new InvalidOperationException("Set PATROL360_PPE_AUDIT_OUTPUT."));
            return;
        }
        var connection = Environment.GetEnvironmentVariable("PATROL360_PPE_SMOKE_CONNECTION");
        var output = Environment.GetEnvironmentVariable("PATROL360_PPE_SMOKE_FIXTURE");
        if (string.IsNullOrWhiteSpace(connection)) throw new InvalidOperationException("Set PATROL360_PPE_SMOKE_CONNECTION.");
        if (string.IsNullOrWhiteSpace(output)) throw new InvalidOperationException("Set PATROL360_PPE_SMOKE_FIXTURE.");

        var target = new Npgsql.NpgsqlConnectionStringBuilder(connection);
        if (target.Host is not ("127.0.0.1" or "localhost") || target.Port != 55439 || target.Database != "patrol360_ppe_test")
            throw new InvalidOperationException("Only the isolated PPE smoke database on loopback:55439 is allowed.");
        var options = new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(connection).Options;
        using var context = new Patrol360DbContext(options);
        var employeeId = Guid.NewGuid();
        var existingUnit = context.Set<InventoryUnitEntity>().SingleOrDefault(x => x.Symbol == "шт.");
        var unitId = existingUnit?.Id ?? Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var normId = Guid.NewGuid();
        var rowId = Guid.NewGuid();
        var cardId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        if (!context.Employees.Any(x => x.Id == employeeId))
        {
            var unit = new InventoryUnitEntity { Id = unitId, Name = $"Штука smoke {unitId:N}", Symbol = "шт." };
            var employee = new EmployeeEntity { Id = employeeId, FullName = $"Синтетический СИЗ Smoke {employeeId.ToString("N")[..6]}", PersonnelNo = $"PPE-{employeeId:N}"[..20], Department = $"Синтетический цех {employeeId:N}", Position = "Испытатель СИЗ", Status = "active" };
            var item = new InventoryItemEntity { Id = itemId, Name = $"Каска smoke {itemId:N}", Sku = $"PPE-{itemId:N}"[..20], UnitId = unitId, ItemKind = "ppe", NormItemName = "Каска защитная", ActualItemName = "Каска smoke", DefaultUnitPriceMinor = 12345, IsActive = true, TrackingType = "quantity", CreatedAt = now };
            var norm = new InventoryPpeNormSetEntity { Id = normId, DepartmentName = employee.Department, PositionName = employee.Position, PositionAliasesJson = "[\"Испытатель СИЗ\"]", ScopeConfirmed = true, VersionName = $"smoke-{normId:N}", SourceName = "synthetic-api-smoke", EffectiveFrom = DateOnly.FromDateTime(now.UtcDateTime).AddYears(-1), Status = "active", Version = 1, CreatedAt = now, UpdatedAt = now };
            var row = new InventoryPpeNormRowEntity { Id = rowId, NormSetId = normId, RowType = "item", SortOrder = 0, NormItemName = "Каска защитная", NormPoint = "smoke п.1", IssuePeriodText = "1 шт. на 12 мес.", Quantity = 1, QuantityText = "1 шт.", PeriodMonths = 12, LifeMonths = 12, UnitSymbol = "шт.", RequirementKey = Guid.NewGuid() };
            row.Mappings.Add(new InventoryPpeNormCatalogMappingEntity { Id = Guid.NewGuid(), NormRowId = rowId, ItemId = itemId, IsDefault = true, IsApproved = true, NormUnitsPerItem = 1, ApprovedBy = "synthetic-smoke", ApprovalEvidence = "synthetic smoke fixture", BrandModelArticle = "SMOKE-HELMET-1", DefaultUnitPriceMinor = 12345, CreatedAt = now, UpdatedAt = now });
            norm.Rows.Add(row);
            var card = new InventoryPpeCardEntity { Id = cardId, EmployeeId = employeeId, Position = employee.Position, Status = "draft", Version = 1, CreatedAt = now, NormSetId = normId, ResponsibleName = "Синтетический ответственный", Basis = "Smoke API" };
            card.NormRows.Add(new InventoryPpeCardNormRowEntity { Id = Guid.NewGuid(), CardId = cardId, SourceNormRowId = rowId, RowType = "item", SortOrder = 0, NormItemName = row.NormItemName, NormPoint = row.NormPoint, IssuePeriodText = row.IssuePeriodText, Quantity = 1, QuantityText = "1 шт.", LifeMonths = 12, MappedItemId = itemId });
            if (existingUnit is null) context.Add(unit);
            context.AddRange(employee, item, norm, card);
            context.SaveChanges();
        }

        File.WriteAllText(output!, JsonSerializer.Serialize(new { employeeId, unitId, itemId, normId, rowId, cardId }, new JsonSerializerOptions { WriteIndented = true }));
    }
}


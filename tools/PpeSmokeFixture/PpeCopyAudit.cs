using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Patrol360.Contracts;
using Patrol360.Application;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Tools.PpeSmokeFixture;

internal static class PpeCopyAudit
{
    public static void Run(string connection, string output)
    {
        var target = new NpgsqlConnectionStringBuilder(connection);
        if (target.Host is not ("127.0.0.1" or "localhost") || target.Port != 55439 || target.Database != "patrol360_ppe_copy")
            throw new InvalidOperationException("Audit accepts only the restored isolated copy on loopback:55439/patrol360_ppe_copy.");
        target.Options = "-c default_transaction_read_only=on";
        using var db = new Patrol360DbContext(new DbContextOptionsBuilder<Patrol360DbContext>().UseNpgsql(target.ConnectionString).Options);
        db.ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking;
        var service = new EfInventoryWorkflowService(db);
        var first = service.GetPpeNormSets(new InventoryListQuery(PageSize: 100));
        var norms = first.Rows.ToList();
        for (var page = 2; page <= first.PageCount; page++) norms.AddRange(service.GetPpeNormSets(new InventoryListQuery(Page: page, PageSize: 100)).Rows);
        var sets = norms.Select(norm => service.GetPpeNormSet(norm.Id).Value!).ToList();
        var mappingDiagnostics = db.InventoryPpeNormCatalogMappings.Where(x => x.ArchivedAt == null)
            .Include(x => x.NormRow).ThenInclude(x => x.NormSet)
            .Include(x => x.Item).ThenInclude(x => x.Unit).AsSplitQuery().ToList()
            .Select(mapping => new {
                mapping.Id, mapping.NormRowId, mapping.NormRow.NormSetId, mapping.ItemId,
                requirement = mapping.NormRow.NormItemName, normUnit = mapping.NormRow.UnitSymbol,
                normPoint = mapping.NormRow.NormPoint, quantity = mapping.NormRow.Quantity,
                scopeConfirmed = mapping.NormRow.NormSet.ScopeConfirmed,
                itemName = mapping.Item.Name, itemKind = mapping.Item.ItemKind, itemActive = mapping.Item.IsActive,
                itemUnit = mapping.Item.Unit?.Symbol, mapping.NormUnitsPerItem, mapping.IsApproved,
                mapping.ApprovalEvidence, mapping.BrandModelArticle,
                structuralProblems = new[] {
                    string.IsNullOrWhiteSpace(mapping.NormRow.NormItemName) ? "Нет наименования требования" : null,
                    string.IsNullOrWhiteSpace(mapping.NormRow.UnitSymbol) ? "Нет единицы нормы" : null,
                    string.IsNullOrWhiteSpace(mapping.NormRow.NormPoint) ? "Нет пункта нормы" : null,
                    mapping.NormRow.Quantity <= 0 ? "Некорректное количество" : null,
                    !mapping.NormRow.NormSet.ScopeConfirmed ? "Применимость не подтверждена" : null,
                    !mapping.Item.IsActive ? "Товар не действует" : null,
                    string.IsNullOrWhiteSpace(mapping.Item.Unit?.Symbol) ? "Нет единицы товара" : null,
                    mapping.NormUnitsPerItem <= 0 ? "Некорректный коэффициент" : null,
                    !mapping.IsApproved ? "Соответствие не утверждено" : null,
                    string.IsNullOrWhiteSpace(mapping.ApprovalEvidence) ? "Нет основания проверки" : null,
                }.Where(x => x is not null).ToArray(),
                requiredAction = "Проверить характеристики и соответствие исходной норме вручную; данный аудит не является утверждением."
            }).ToList();
        var report = new
        {
            generatedAt = DateTimeOffset.UtcNow, source = "Restored production backup, read-only connection; no integrations",
            counts = new { normSets = norms.Count, mappings = db.InventoryPpeNormCatalogMappings.Count(x => x.ArchivedAt == null),
                approvedMappings = db.InventoryPpeNormCatalogMappings.Count(x => x.ArchivedAt == null && x.IsApproved),
                cards = db.InventoryPpeCards.Count(), lines = db.InventoryPpeCardLines.Count(),
                documents = db.Set<Patrol360.Infrastructure.Persistence.Entities.PpeIssueDocumentEntity>().Count(), templates = db.InventoryPpeIssueTemplates.Count(),
                historicalStockMoves = db.InventoryStockMoves.Count(x => x.PpeCardLineId != null || x.MoveType.StartsWith("ppe_")) },
            readySets = norms.Count(x => x.Status == "active" && !x.RequiresReview && x.Readiness?.IsReady == true),
            mappingDiagnostics,
            sets,
            mappingsToReview = sets.SelectMany(set => set.Rows.SelectMany(row => row.Mappings.Select(mapping => new
            { normSetId = set.NormSet.Id, rowId = row.Id, requirement = row.NormItemName, mapping }))),
            missingMappings = sets.SelectMany(set => set.Rows.Where(row => row.RowType == "item" && row.Mappings.Count == 0)
                .Select(row => new { normSetId = set.NormSet.Id, rowId = row.Id, requirement = row.NormItemName, row.UnitSymbol, row.Quantity,
                    action = "Подобрать существующий подтверждённый товар через интерфейс. При отсутствии — заполнить карточку товара по фактическим сведениям." }))
        };
        File.WriteAllText(output, JsonSerializer.Serialize(report, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true }));
        Console.WriteLine($"Read-only audit: {norms.Count} sets; report {output}");
    }
}

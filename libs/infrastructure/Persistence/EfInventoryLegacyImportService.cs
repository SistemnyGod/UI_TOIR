using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class EfInventoryLegacyImportService(
    Patrol360DbContext dbContext,
    IConfiguration configuration) : IInventoryLegacyImportService
{
    private const string SourceKey = "IT-inventarizaci";
    private bool AllowSyntheticLegacyNames =>
        string.Equals(configuration["InventoryLegacy:AllowSyntheticNames"], "true", StringComparison.OrdinalIgnoreCase);

    public async Task<InventoryCommandResult<InventoryLegacyImportRunDto>> ImportAsync(
        InventoryLegacyImportRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var connectionString = configuration["InventoryLegacy:ConnectionString"]
            ?? Environment.GetEnvironmentVariable("INVENTORY_LEGACY_CONNECTION_STRING");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return Failure<InventoryLegacyImportRunDto>(
                "connectionString",
                "Legacy Inventory connection string is not configured");
        }

        var run = new InventoryLegacyImportRunEntity
        {
            Id = Guid.NewGuid(),
            DryRun = request.DryRun,
            Status = "running",
            CreatedAt = DateTimeOffset.UtcNow,
            Error = string.Empty,
            StockChecksum = "{}",
            TablesJson = "[]"
        };
        dbContext.InventoryLegacyImportRuns.Add(run);
        await dbContext.SaveChangesAsync(cancellationToken);

        var tableResults = new List<InventoryLegacyImportTableDto>();

        try
        {
            await using var source = new NpgsqlConnection(connectionString);
            await source.OpenAsync(cancellationToken);

            var schema = await LegacySchema.LoadAsync(source, cancellationToken);

            await ImportReferenceTableAsync(source, schema, request.DryRun, "category", tableResults, UpsertCategory, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "unit", tableResults, UpsertUnit, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "warehouse", tableResults, UpsertWarehouse, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "employee", tableResults, UpsertEmployee, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "web_user", tableResults, UpsertUser, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "item", tableResults, UpsertItem, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "custody_issue_document", tableResults, UpsertCustodyDocument, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "custody_record", tableResults, UpsertCustodyRecord, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "custody_record_event", tableResults, UpsertCustodyEvent, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "ppe_card", tableResults, UpsertPpeCard, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "ppe_card_line", tableResults, UpsertPpeLine, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "ppe_card_line_event", tableResults, UpsertPpeEvent, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "stock_move", tableResults, UpsertStockMove, cancellationToken);
            await ImportReferenceTableAsync(source, schema, request.DryRun, "system_log", tableResults, UpsertSystemLog, cancellationToken);

            if (request.DryRun)
            {
                dbContext.ChangeTracker.Clear();
                run = await dbContext.InventoryLegacyImportRuns.FirstAsync(row => row.Id == run.Id, cancellationToken);
            }

            run.Status = "completed";
            run.CompletedAt = DateTimeOffset.UtcNow;
            ApplyRunTotals(run, tableResults);
            run.StockChecksum = BuildStockChecksum();
            run.TablesJson = JsonSerializer.Serialize(tableResults);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is NpgsqlException or InvalidOperationException or DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            run = await dbContext.InventoryLegacyImportRuns.FirstAsync(row => row.Id == run.Id, cancellationToken);
            run.Status = "failed";
            run.CompletedAt = DateTimeOffset.UtcNow;
            run.Error = ex.Message;
            run.TablesJson = JsonSerializer.Serialize(tableResults);
            ApplyRunTotals(run, tableResults);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return Success(MapRun(run));
    }

    public InventoryCommandResult<InventoryLegacyImportRunDto> GetRun(Guid id)
    {
        var run = dbContext.InventoryLegacyImportRuns.AsNoTracking().FirstOrDefault(row => row.Id == id);
        return run is null
            ? Failure<InventoryLegacyImportRunDto>("id", "Legacy import run not found")
            : Success(MapRun(run));
    }

    private async Task ImportReferenceTableAsync(
        NpgsqlConnection source,
        LegacySchema schema,
        bool dryRun,
        string tableName,
        List<InventoryLegacyImportTableDto> results,
        Func<LegacyRow, bool, ImportRowResult> upsert,
        CancellationToken cancellationToken)
    {
        if (!schema.Tables.TryGetValue(tableName, out var columns))
        {
            results.Add(new(tableName, 0, 0, 0, 0, "skipped", "Source table is missing"));
            return;
        }

        var rows = await ReadRowsAsync(source, tableName, columns, cancellationToken);
        var inserted = 0;
        var updated = 0;
        var skipped = 0;

        foreach (var row in rows)
        {
            var result = upsert(row, dryRun);
            inserted += result.Inserted ? 1 : 0;
            updated += result.Updated ? 1 : 0;
            skipped += result.Skipped ? 1 : 0;
        }

        if (!dryRun)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        results.Add(new(tableName, rows.Count, inserted, updated, skipped, "completed", string.Empty));
    }

    private ImportRowResult UpsertCategory(LegacyRow row, bool dryRun)
    {
        if (!row.Id.HasValue)
        {
            return ImportRowResult.Skip();
        }

        var name = RequiredText(row, $"Legacy category {row.Id}", "name", "title");
        if (name is null)
        {
            return ImportRowResult.Skip();
        }
        var existing = dbContext.InventoryCategories.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                existing.Name = name;
                existing.IsArchived = row.Bool("is_archived", "archived");
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            dbContext.InventoryCategories.Add(new InventoryCategoryEntity
            {
                Id = Guid.NewGuid(),
                LegacyId = row.Id,
                Name = name,
                IsArchived = row.Bool("is_archived", "archived"),
                CreatedAt = row.Date("created_at") ?? DateTimeOffset.UtcNow
            });
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertUnit(LegacyRow row, bool dryRun)
    {
        if (!row.Id.HasValue)
        {
            return ImportRowResult.Skip();
        }

        var name = RequiredText(row, $"Legacy unit {row.Id}", "name", "title");
        if (name is null)
        {
            return ImportRowResult.Skip();
        }

        var symbol = row.Text("symbol", "short_name", "code") ?? name;
        var existing = dbContext.InventoryUnits.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                existing.Name = name;
                existing.Symbol = symbol;
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            dbContext.InventoryUnits.Add(new InventoryUnitEntity
            {
                Id = Guid.NewGuid(),
                LegacyId = row.Id,
                Name = name,
                Symbol = symbol
            });
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertWarehouse(LegacyRow row, bool dryRun)
    {
        if (!row.Id.HasValue)
        {
            return ImportRowResult.Skip();
        }

        var name = RequiredText(row, $"Legacy warehouse {row.Id}", "name", "title");
        if (name is null)
        {
            return ImportRowResult.Skip();
        }

        var existing = dbContext.InventoryWarehouses.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                existing.Name = name;
                existing.IsArchived = row.Bool("is_archived", "archived");
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            dbContext.InventoryWarehouses.Add(new InventoryWarehouseEntity
            {
                Id = Guid.NewGuid(),
                LegacyId = row.Id,
                Name = name,
                IsDefault = row.Bool("is_default", "default"),
                IsArchived = row.Bool("is_archived", "archived")
            });
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertEmployee(LegacyRow row, bool dryRun)
    {
        if (!row.Id.HasValue)
        {
            return ImportRowResult.Skip();
        }

        var fullName = RequiredText(row, $"Сотрудник учета №{row.Id}", "full_name", "name", "fio");
        if (fullName is null)
        {
            return ImportRowResult.Skip();
        }

        var personnelNo = row.Text("personnel_no", "tab_no", "code") ?? $"УЧ-{row.Id}";
        var existingLink = dbContext.InventoryEmployeeLegacyLinks.Include(link => link.Employee).FirstOrDefault(link => link.SourceKey == SourceKey && link.LegacyId == row.Id);
        var existing = existingLink?.Employee ?? dbContext.Employees.FirstOrDefault(item => item.PersonnelNo == personnelNo);
        if (existing is not null)
        {
            if (!dryRun)
            {
                existing.FullName = fullName;
                existing.PersonnelNo = personnelNo;
                existing.Position = row.Text("position", "job_title") ?? existing.Position;
                existing.Department = row.Text("department", "division", "group") ?? existing.Department;
                existing.Status = NormalizeEmployeeStatus(row);
                EnsureEmployeeLink(existing.Id, row.Id.Value);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var employee = new EmployeeEntity
            {
                Id = Guid.NewGuid(),
                FullName = fullName,
                PersonnelNo = personnelNo,
                Position = row.Text("position", "job_title") ?? string.Empty,
                Department = row.Text("department", "division", "group") ?? string.Empty,
                Status = NormalizeEmployeeStatus(row),
                Shift = row.Text("shift") ?? string.Empty,
                LastSeenAt = DateTimeOffset.UtcNow
            };
            dbContext.Employees.Add(employee);
            EnsureEmployeeLink(employee.Id, row.Id.Value);
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertUser(LegacyRow row, bool dryRun)
    {
        if (!row.Id.HasValue)
        {
            return ImportRowResult.Skip();
        }

        var login = RequiredText(row, $"legacy-user-{row.Id}", "login", "username");
        if (login is null)
        {
            return ImportRowResult.Skip();
        }

        var existingLink = dbContext.InventoryUserLegacyLinks.Include(link => link.User).FirstOrDefault(link => link.SourceKey == SourceKey && link.LegacyId == row.Id);
        var existing = existingLink?.User ?? dbContext.SiteUsers.FirstOrDefault(item => item.NormalizedLogin == login.ToUpperInvariant());
        if (existing is not null)
        {
            if (!dryRun)
            {
                existing.Login = login;
                existing.NormalizedLogin = login.ToUpperInvariant();
                existing.DisplayName = row.Text("display_name", "name") ?? login;
                existing.Status = row.Bool("is_active", "active") ? "active" : "disabled";
                EnsureUserLink(existing.Id, row.Id.Value);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var user = new SiteUserEntity
            {
                Id = Guid.NewGuid(),
                Login = login,
                NormalizedLogin = login.ToUpperInvariant(),
                DisplayName = row.Text("display_name", "name") ?? login,
                PasswordHash = row.Text("password_hash") ?? string.Empty,
                Status = row.Bool("is_active", "active") ? "active" : "disabled",
                CreatedAt = row.Date("created_at") ?? DateTimeOffset.UtcNow
            };
            dbContext.SiteUsers.Add(user);
            EnsureUserLink(user.Id, row.Id.Value);
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertItem(LegacyRow row, bool dryRun)
    {
        if (!row.Id.HasValue)
        {
            return ImportRowResult.Skip();
        }

        var name = RequiredText(row, $"Legacy item {row.Id}", "name", "title");
        if (name is null)
        {
            return ImportRowResult.Skip();
        }

        var existing = dbContext.InventoryItems.FirstOrDefault(item => item.LegacyId == row.Id);
        var unitId = ResolveUnit(row.Int("unit_id"));
        var categoryId = ResolveCategory(row.Int("category_id"));
        if (existing is not null)
        {
            if (!dryRun)
            {
                ApplyItem(existing, row, name, unitId, categoryId);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var item = new InventoryItemEntity
            {
                Id = Guid.NewGuid(),
                LegacyId = row.Id,
                CreatedAt = row.Date("created_at") ?? DateTimeOffset.UtcNow
            };
            ApplyItem(item, row, name, unitId, categoryId);
            dbContext.InventoryItems.Add(item);
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertStockMove(LegacyRow row, bool dryRun)
    {
        if (!row.Id.HasValue)
        {
            return ImportRowResult.Skip();
        }

        var itemId = ResolveItem(row.Int("item_id"));
        var warehouseId = ResolveWarehouse(row.Int("warehouse_id")) ?? ResolveDefaultWarehouse();
        if (itemId is null || warehouseId is null)
        {
            return ImportRowResult.Skip();
        }

        var existing = dbContext.InventoryStockMoves.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                ApplyStockMove(existing, row, itemId.Value, warehouseId.Value);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var move = new InventoryStockMoveEntity { Id = Guid.NewGuid(), LegacyId = row.Id };
            ApplyStockMove(move, row, itemId.Value, warehouseId.Value);
            dbContext.InventoryStockMoves.Add(move);
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertCustodyDocument(LegacyRow row, bool dryRun)
    {
        if (!row.Id.HasValue)
        {
            return ImportRowResult.Skip();
        }

        var employeeId = ResolveEmployee(row.Int("employee_id"));
        if (employeeId is null)
        {
            return ImportRowResult.Skip();
        }

        var existing = dbContext.InventoryCustodyDocuments.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                ApplyCustodyDocument(existing, row, employeeId.Value);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var document = new InventoryCustodyDocumentEntity { Id = Guid.NewGuid(), LegacyId = row.Id };
            ApplyCustodyDocument(document, row, employeeId.Value);
            dbContext.InventoryCustodyDocuments.Add(document);
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertCustodyRecord(LegacyRow row, bool dryRun)
    {
        if (!row.Id.HasValue)
        {
            return ImportRowResult.Skip();
        }

        var employeeId = ResolveEmployee(row.Int("employee_id"));
        var itemId = ResolveItem(row.Int("item_id"));
        var warehouseId = ResolveWarehouse(row.Int("warehouse_id")) ?? ResolveDefaultWarehouse();
        var documentId = ResolveCustodyDocument(row.Int("document_id", "issue_document_id", "custody_issue_document_id"));
        if (employeeId is null || itemId is null || warehouseId is null || documentId is null)
        {
            return ImportRowResult.Skip();
        }

        var existing = dbContext.InventoryCustodyRecords.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                ApplyCustodyRecord(existing, row, documentId.Value, employeeId.Value, itemId.Value, warehouseId.Value);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var record = new InventoryCustodyRecordEntity { Id = Guid.NewGuid(), LegacyId = row.Id };
            ApplyCustodyRecord(record, row, documentId.Value, employeeId.Value, itemId.Value, warehouseId.Value);
            dbContext.InventoryCustodyRecords.Add(record);
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertCustodyEvent(LegacyRow row, bool dryRun)
    {
        var recordId = ResolveCustodyRecord(row.Int("record_id", "custody_record_id"));
        if (!row.Id.HasValue || recordId is null)
        {
            return ImportRowResult.Skip();
        }

        var existing = dbContext.InventoryCustodyRecordEvents.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                ApplyCustodyEvent(existing, row, recordId.Value);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var ev = new InventoryCustodyRecordEventEntity { Id = Guid.NewGuid(), LegacyId = row.Id };
            ApplyCustodyEvent(ev, row, recordId.Value);
            dbContext.InventoryCustodyRecordEvents.Add(ev);
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertPpeCard(LegacyRow row, bool dryRun)
    {
        var employeeId = ResolveEmployee(row.Int("employee_id"));
        if (!row.Id.HasValue || employeeId is null)
        {
            return ImportRowResult.Skip();
        }

        var existing = dbContext.InventoryPpeCards.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                ApplyPpeCard(existing, row, employeeId.Value);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var card = new InventoryPpeCardEntity { Id = Guid.NewGuid(), LegacyId = row.Id };
            ApplyPpeCard(card, row, employeeId.Value);
            dbContext.InventoryPpeCards.Add(card);
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertPpeLine(LegacyRow row, bool dryRun)
    {
        var cardId = ResolvePpeCard(row.Int("ppe_card_id", "card_id"));
        var itemId = ResolveItem(row.Int("item_id"));
        if (!row.Id.HasValue || cardId is null || itemId is null)
        {
            return ImportRowResult.Skip();
        }

        var existing = dbContext.InventoryPpeCardLines.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                ApplyPpeLine(existing, row, cardId.Value, itemId.Value);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var line = new InventoryPpeCardLineEntity { Id = Guid.NewGuid(), LegacyId = row.Id };
            ApplyPpeLine(line, row, cardId.Value, itemId.Value);
            dbContext.InventoryPpeCardLines.Add(line);
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertPpeEvent(LegacyRow row, bool dryRun)
    {
        var lineId = ResolvePpeLine(row.Int("line_id", "ppe_card_line_id"));
        if (!row.Id.HasValue || lineId is null)
        {
            return ImportRowResult.Skip();
        }

        var existing = dbContext.InventoryPpeCardLineEvents.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                ApplyPpeEvent(existing, row, lineId.Value);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var ev = new InventoryPpeCardLineEventEntity { Id = Guid.NewGuid(), LegacyId = row.Id };
            ApplyPpeEvent(ev, row, lineId.Value);
            dbContext.InventoryPpeCardLineEvents.Add(ev);
        }

        return ImportRowResult.Insert();
    }

    private ImportRowResult UpsertSystemLog(LegacyRow row, bool dryRun)
    {
        if (!row.Id.HasValue)
        {
            return ImportRowResult.Skip();
        }

        var existing = dbContext.InventorySystemLogs.FirstOrDefault(item => item.LegacyId == row.Id);
        if (existing is not null)
        {
            if (!dryRun)
            {
                ApplySystemLog(existing, row);
            }

            return ImportRowResult.Update();
        }

        if (!dryRun)
        {
            var log = new InventorySystemLogEntity { Id = Guid.NewGuid(), LegacyId = row.Id };
            ApplySystemLog(log, row);
            dbContext.InventorySystemLogs.Add(log);
        }

        return ImportRowResult.Insert();
    }

    private void ApplyItem(InventoryItemEntity item, LegacyRow row, string name, Guid? unitId, Guid? categoryId)
    {
        item.Name = name;
        item.Sku = row.Text("sku", "code", "article") ?? string.Empty;
        item.Article = row.Text("article") ?? item.Sku;
        item.CategoryId = categoryId;
        item.UnitId = unitId;
        item.ItemKind = row.Text("item_kind", "ppe_kind") ?? string.Empty;
        item.NormItemName = row.Text("norm_item_name") ?? string.Empty;
        item.ActualItemName = row.Text("actual_item_name") ?? string.Empty;
        item.BrandName = row.Text("brand_name", "brand") ?? string.Empty;
        item.ModelName = row.Text("model_name", "model") ?? string.Empty;
        item.ProtectionClass = row.Text("protection_class") ?? string.Empty;
        item.DefaultLifeMonths = row.Int("default_life_months", "life_months");
        item.DefaultUnitPriceMinor = row.Long("default_unit_price_minor", "unit_price_minor");
        item.MinStockQty = row.Decimal("min_stock_qty", "min_qty");
        item.IsConsumable = row.Bool("is_consumable", "consumable");
        item.TrackLife = row.Bool("track_life", defaultValue: true);
        item.TrackingType = row.Text("tracking_type") ?? "quantity";
        item.Comment = row.Text("comment", "description") ?? string.Empty;
        item.IsActive = row.Bool("is_active", "active", defaultValue: true);
    }

    private string? RequiredText(LegacyRow row, string syntheticValue, params string[] names) =>
        row.Text(names) ?? (AllowSyntheticLegacyNames ? syntheticValue : null);

    private static string NormalizeEmployeeStatus(LegacyRow row)
    {
        if (row.Bool("is_archived", "archived"))
        {
            return "archived";
        }

        var status = row.Text("status");
        return string.IsNullOrWhiteSpace(status) || status.Equals("active", StringComparison.OrdinalIgnoreCase)
            ? "Активен"
            : status;
    }

    private void ApplyStockMove(InventoryStockMoveEntity move, LegacyRow row, Guid itemId, Guid warehouseId)
    {
        move.ItemId = itemId;
        move.WarehouseId = warehouseId;
        move.EmployeeId = ResolveEmployee(row.Int("employee_id"));
        move.QuantityDelta = row.Decimal("qty_delta", "quantity_delta", "delta", "quantity") ?? 0;
        move.MovedAt = row.Date("moved_at", "created_at", "date") ?? DateTimeOffset.UtcNow;
        move.MoveType = row.Text("move_type", "type") ?? "legacy";
        move.ReferenceType = row.Text("reference_type", "source") ?? "legacy";
        move.ReferenceId = null;
        move.CustodyRecordId = ResolveCustodyRecord(row.Int("custody_record_id"));
        move.PpeCardLineId = ResolvePpeLine(row.Int("ppe_card_line_id"));
    }

    private static void ApplyCustodyDocument(InventoryCustodyDocumentEntity document, LegacyRow row, Guid employeeId)
    {
        document.EmployeeId = employeeId;
        document.Number = row.Text("number", "doc_no", "document_number") ?? $"LEG-CST-{row.Id}";
        document.Status = row.Text("status", "status_code") ?? (row.Bool("is_closed", "closed") ? "closed" : "open");
        document.CreatedAt = row.Date("created_at", "issue_date", "date") ?? DateTimeOffset.UtcNow;
        document.ClosedAt = row.Date("closed_at");
        document.ArchivedAt = row.Bool("is_archived", "archived") ? row.Date("updated_at") ?? DateTimeOffset.UtcNow : null;
    }

    private static void ApplyCustodyRecord(InventoryCustodyRecordEntity record, LegacyRow row, Guid documentId, Guid employeeId, Guid itemId, Guid warehouseId)
    {
        record.DocumentId = documentId;
        record.EmployeeId = employeeId;
        record.ItemId = itemId;
        record.WarehouseId = warehouseId;
        record.Quantity = row.Decimal("quantity", "qty") ?? 1;
        record.Status = row.Text("status", "status_code") ?? "in_use";
        record.Comment = row.Text("comment", "note") ?? string.Empty;
        record.IssuedAt = row.Date("issued_at", "issue_date", "created_at") ?? DateTimeOffset.UtcNow;
        record.ClosedAt = row.Date("closed_at", "return_date");
        record.ArchivedAt = row.Bool("is_archived", "archived") ? row.Date("updated_at") ?? DateTimeOffset.UtcNow : null;
    }

    private static void ApplyCustodyEvent(InventoryCustodyRecordEventEntity ev, LegacyRow row, Guid recordId)
    {
        ev.RecordId = recordId;
        ev.EventType = row.Text("event_type", "action") ?? "legacy";
        ev.FromStatus = row.Text("from_status") ?? string.Empty;
        ev.ToStatus = row.Text("to_status", "status") ?? string.Empty;
        ev.Comment = row.Text("comment", "details") ?? string.Empty;
        ev.Actor = row.Text("actor", "user") ?? "legacy";
        ev.CreatedAt = row.Date("created_at", "event_date") ?? DateTimeOffset.UtcNow;
    }

    private void ApplyPpeCard(InventoryPpeCardEntity card, LegacyRow row, Guid employeeId)
    {
        card.EmployeeId = employeeId;
        card.Position = row.Text("position") ?? dbContext.Employees.Where(employee => employee.Id == employeeId).Select(employee => employee.Position).FirstOrDefault() ?? string.Empty;
        card.Status = row.Text("status") ?? (row.Bool("is_archived", "archived") ? "archived" : "active");
        card.Comment = row.Text("comment", "note") ?? string.Empty;
        card.CreatedAt = row.Date("created_at") ?? DateTimeOffset.UtcNow;
        card.ArchivedAt = row.Bool("is_archived", "archived") ? row.Date("updated_at") ?? DateTimeOffset.UtcNow : null;
    }

    private void ApplyPpeLine(InventoryPpeCardLineEntity line, LegacyRow row, Guid cardId, Guid itemId)
    {
        line.CardId = cardId;
        line.ItemId = itemId;
        line.WarehouseId = ResolveWarehouse(row.Int("warehouse_id"));
        line.Quantity = row.Decimal("quantity", "qty") ?? 1;
        line.Status = row.Text("line_status", "status") ?? "not_issued";
        line.IssuedAt = row.Date("issued_at", "issue_date");
        line.DueAt = row.Date("due_at", "until_date", "expire_date");
        line.Comment = row.Text("comment", "note") ?? string.Empty;
    }

    private static void ApplyPpeEvent(InventoryPpeCardLineEventEntity ev, LegacyRow row, Guid lineId)
    {
        ev.LineId = lineId;
        ev.EventType = row.Text("event_type", "action") ?? "legacy";
        ev.FromStatus = row.Text("from_status") ?? string.Empty;
        ev.ToStatus = row.Text("to_status", "status") ?? string.Empty;
        ev.Comment = row.Text("comment", "details") ?? string.Empty;
        ev.Actor = row.Text("actor", "user") ?? "legacy";
        ev.CreatedAt = row.Date("created_at", "event_date") ?? DateTimeOffset.UtcNow;
    }

    private static void ApplySystemLog(InventorySystemLogEntity log, LegacyRow row)
    {
        log.EntityType = row.Text("entity_type", "section") ?? "legacy";
        log.Action = row.Text("action") ?? "legacy";
        log.Details = row.Text("details", "message", "payload") ?? string.Empty;
        log.Actor = row.Text("actor", "user_login", "user") ?? "legacy";
        log.CreatedAt = row.Date("created_at") ?? DateTimeOffset.UtcNow;
    }

    private void EnsureEmployeeLink(Guid employeeId, int legacyId)
    {
        var link = dbContext.InventoryEmployeeLegacyLinks.FirstOrDefault(row => row.SourceKey == SourceKey && row.LegacyId == legacyId);
        var now = DateTimeOffset.UtcNow;
        if (link is null)
        {
            dbContext.InventoryEmployeeLegacyLinks.Add(new InventoryEmployeeLegacyLinkEntity
            {
                Id = Guid.NewGuid(),
                EmployeeId = employeeId,
                LegacyId = legacyId,
                SourceKey = SourceKey,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            link.EmployeeId = employeeId;
            link.UpdatedAt = now;
        }
    }

    private void EnsureUserLink(Guid userId, int legacyId)
    {
        var link = dbContext.InventoryUserLegacyLinks.FirstOrDefault(row => row.SourceKey == SourceKey && row.LegacyId == legacyId);
        var now = DateTimeOffset.UtcNow;
        if (link is null)
        {
            dbContext.InventoryUserLegacyLinks.Add(new InventoryUserLegacyLinkEntity
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                LegacyId = legacyId,
                SourceKey = SourceKey,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            link.UserId = userId;
            link.UpdatedAt = now;
        }
    }

    private Guid? ResolveCategory(int? legacyId) => legacyId is null ? null : dbContext.InventoryCategories.Where(row => row.LegacyId == legacyId).Select(row => row.Id).FirstOrDefault();

    private Guid? ResolveUnit(int? legacyId) => legacyId is null ? null : dbContext.InventoryUnits.Where(row => row.LegacyId == legacyId).Select(row => row.Id).FirstOrDefault();

    private Guid? ResolveWarehouse(int? legacyId) => legacyId is null ? null : dbContext.InventoryWarehouses.Where(row => row.LegacyId == legacyId).Select(row => row.Id).FirstOrDefault();

    private Guid? ResolveDefaultWarehouse() => dbContext.InventoryWarehouses.Select(row => (Guid?)row.Id).FirstOrDefault();

    private Guid? ResolveItem(int? legacyId) => legacyId is null ? null : dbContext.InventoryItems.Where(row => row.LegacyId == legacyId).Select(row => row.Id).FirstOrDefault();

    private Guid? ResolveEmployee(int? legacyId) => legacyId is null ? null : dbContext.InventoryEmployeeLegacyLinks.Where(row => row.SourceKey == SourceKey && row.LegacyId == legacyId).Select(row => row.EmployeeId).FirstOrDefault();

    private Guid? ResolveCustodyDocument(int? legacyId) => legacyId is null ? null : dbContext.InventoryCustodyDocuments.Where(row => row.LegacyId == legacyId).Select(row => row.Id).FirstOrDefault();

    private Guid? ResolveCustodyRecord(int? legacyId) => legacyId is null ? null : dbContext.InventoryCustodyRecords.Where(row => row.LegacyId == legacyId).Select(row => row.Id).FirstOrDefault();

    private Guid? ResolvePpeCard(int? legacyId) => legacyId is null ? null : dbContext.InventoryPpeCards.Where(row => row.LegacyId == legacyId).Select(row => row.Id).FirstOrDefault();

    private Guid? ResolvePpeLine(int? legacyId) => legacyId is null ? null : dbContext.InventoryPpeCardLines.Where(row => row.LegacyId == legacyId).Select(row => row.Id).FirstOrDefault();

    private string BuildStockChecksum()
    {
        var balances = dbContext.InventoryStockMoves
            .AsNoTracking()
            .GroupBy(row => new { row.ItemId, row.WarehouseId })
            .Select(row => new { row.Key.ItemId, row.Key.WarehouseId, Balance = row.Sum(move => move.QuantityDelta) })
            .OrderBy(row => row.ItemId)
            .ThenBy(row => row.WarehouseId)
            .ToList();
        var payload = JsonSerializer.Serialize(balances);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
        return JsonSerializer.Serialize(new { algorithm = "sha256", hash, balances = balances.Count });
    }

    private static void ApplyRunTotals(InventoryLegacyImportRunEntity run, IReadOnlyList<InventoryLegacyImportTableDto> tableResults)
    {
        run.TablesScanned = tableResults.Count;
        run.RowsRead = tableResults.Sum(row => row.SourceRows);
        run.RowsInserted = tableResults.Sum(row => row.InsertedRows);
        run.RowsUpdated = tableResults.Sum(row => row.UpdatedRows);
        run.RowsSkipped = tableResults.Sum(row => row.SkippedRows);
    }

    private static InventoryLegacyImportRunDto MapRun(InventoryLegacyImportRunEntity run)
    {
        IReadOnlyList<InventoryLegacyImportTableDto> tables = [];
        if (!string.IsNullOrWhiteSpace(run.TablesJson))
        {
            tables = JsonSerializer.Deserialize<List<InventoryLegacyImportTableDto>>(run.TablesJson) ?? [];
        }

        return new(
            run.Id,
            run.DryRun,
            run.Status,
            run.CreatedAt.UtcDateTime,
            run.CompletedAt?.UtcDateTime,
            run.TablesScanned,
            run.RowsRead,
            run.RowsInserted,
            run.RowsUpdated,
            run.RowsSkipped,
            run.Error,
            run.StockChecksum,
            tables);
    }

    private static async Task<List<LegacyRow>> ReadRowsAsync(NpgsqlConnection connection, string tableName, IReadOnlySet<string> columns, CancellationToken cancellationToken)
    {
        var rows = new List<LegacyRow>();
        await using var command = connection.CreateCommand();
        command.CommandText = $"select * from {Quote(tableName)}";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            for (var index = 0; index < reader.FieldCount; index++)
            {
                var name = reader.GetName(index);
                if (!columns.Contains(name))
                {
                    continue;
                }

                values[name] = await reader.IsDBNullAsync(index, cancellationToken) ? null : reader.GetValue(index);
            }

            rows.Add(new LegacyRow(values));
        }

        return rows;
    }

    private static string Quote(string identifier) => "\"" + identifier.Replace("\"", "\"\"") + "\"";

    private static InventoryCommandResult<T> Success<T>(T value) => new(value, EmptyErrors);

    private static InventoryCommandResult<T> Failure<T>(string key, string message) =>
        new(default, new Dictionary<string, string[]> { [key] = [message] });

    private static readonly IReadOnlyDictionary<string, string[]> EmptyErrors =
        new Dictionary<string, string[]>();

    private readonly record struct ImportRowResult(bool Inserted, bool Updated, bool Skipped)
    {
        public static ImportRowResult Insert() => new(true, false, false);
        public static ImportRowResult Update() => new(false, true, false);
        public static ImportRowResult Skip() => new(false, false, true);
    }

    private sealed class LegacySchema
    {
        private LegacySchema(Dictionary<string, IReadOnlySet<string>> tables) => Tables = tables;

        public Dictionary<string, IReadOnlySet<string>> Tables { get; }

        public static async Task<LegacySchema> LoadAsync(NpgsqlConnection connection, CancellationToken cancellationToken)
        {
            var tables = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
            await using var command = connection.CreateCommand();
            command.CommandText = """
                select table_name, column_name
                from information_schema.columns
                where table_schema = 'public'
                order by table_name, ordinal_position
                """;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var table = reader.GetString(0);
                var column = reader.GetString(1);
                if (!tables.TryGetValue(table, out var columns))
                {
                    columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    tables[table] = columns;
                }

                columns.Add(column);
            }

            return new LegacySchema(tables.ToDictionary(row => row.Key, row => (IReadOnlySet<string>)row.Value, StringComparer.OrdinalIgnoreCase));
        }
    }

    private sealed class LegacyRow(Dictionary<string, object?> values)
    {
        public int? Id => Int("id");

        public string? Text(params string[] names)
        {
            foreach (var name in names)
            {
                if (values.TryGetValue(name, out var value) && value is not null)
                {
                    var text = Convert.ToString(value)?.Trim();
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        return text;
                    }
                }
            }

            return null;
        }

        public int? Int(params string[] names)
        {
            foreach (var name in names)
            {
                if (values.TryGetValue(name, out var value) && value is not null && int.TryParse(Convert.ToString(value), out var parsed))
                {
                    return parsed;
                }
            }

            return null;
        }

        public long? Long(params string[] names)
        {
            foreach (var name in names)
            {
                if (values.TryGetValue(name, out var value) && value is not null && long.TryParse(Convert.ToString(value), out var parsed))
                {
                    return parsed;
                }
            }

            return null;
        }

        public decimal? Decimal(params string[] names)
        {
            foreach (var name in names)
            {
                if (values.TryGetValue(name, out var value) && value is not null && decimal.TryParse(Convert.ToString(value), out var parsed))
                {
                    return parsed;
                }
            }

            return null;
        }

        public bool Bool(params string[] names) => Bool(names, defaultValue: false);

        public bool Bool(string name, string alternate, bool defaultValue = false) => Bool([name, alternate], defaultValue);

        public bool Bool(string name, bool defaultValue = false) => Bool([name], defaultValue);

        public bool Bool(string[] names, bool defaultValue)
        {
            foreach (var name in names)
            {
                if (!values.TryGetValue(name, out var value) || value is null)
                {
                    continue;
                }

                if (value is bool boolean)
                {
                    return boolean;
                }

                var text = Convert.ToString(value)?.Trim().ToLowerInvariant();
                if (text is "1" or "true" or "yes" or "y")
                {
                    return true;
                }

                if (text is "0" or "false" or "no" or "n")
                {
                    return false;
                }
            }

            return defaultValue;
        }

        public DateTimeOffset? Date(params string[] names)
        {
            foreach (var name in names)
            {
                if (!values.TryGetValue(name, out var value) || value is null)
                {
                    continue;
                }

                if (value is DateTimeOffset dto)
                {
                    return dto;
                }

                if (value is DateTime date)
                {
                    return new DateTimeOffset(DateTime.SpecifyKind(date, DateTimeKind.Utc));
                }

                if (DateTimeOffset.TryParse(Convert.ToString(value), out var parsed))
                {
                    return parsed;
                }
            }

            return null;
        }
    }
}

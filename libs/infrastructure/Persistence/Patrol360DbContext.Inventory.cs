using Microsoft.EntityFrameworkCore;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Persistence;

public sealed partial class Patrol360DbContext
{
    private static void ConfigureInventoryOperationReceipts(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryOperationReceiptEntity>(entity =>
        {
            entity.ToTable("operation_receipts", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(row => row.AuthorUserId).HasColumnName("author_user_id");
            entity.Property(row => row.PayloadHash).HasColumnName("payload_hash").HasMaxLength(64).IsRequired();
            entity.Property(row => row.ResponseJson).HasColumnName("response_json").HasColumnType("jsonb").IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
        });
    }
    private static void ConfigureInventoryCategories(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryCategoryEntity>(entity =>
        {
            entity.ToTable("categories", "inventory");
            entity.HasKey(category => category.Id);

            entity.Property(category => category.Id).HasColumnName("id");
            entity.Property(category => category.ParentId).HasColumnName("parent_id");
            entity.Property(category => category.LegacyId).HasColumnName("legacy_id");
            entity.Property(category => category.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(category => category.IsArchived).HasColumnName("is_archived");
            entity.Property(category => category.CreatedAt).HasColumnName("created_at");

            entity.HasOne(category => category.Parent)
                .WithMany(category => category.Children)
                .HasForeignKey(category => category.ParentId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(category => new { category.ParentId, category.Name })
                .IsUnique()
                .HasDatabaseName("ux_inventory_categories_parent_name");

            entity.HasIndex(category => category.LegacyId)
                .HasDatabaseName("ix_inventory_categories_legacy_id");
        });
    }

    private static void ConfigureInventoryUnits(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryUnitEntity>(entity =>
        {
            entity.ToTable("units", "inventory");
            entity.HasKey(unit => unit.Id);

            entity.Property(unit => unit.Id).HasColumnName("id");
            entity.Property(unit => unit.LegacyId).HasColumnName("legacy_id");
            entity.Property(unit => unit.Name).HasColumnName("name").HasMaxLength(80).IsRequired();
            entity.Property(unit => unit.Symbol).HasColumnName("symbol").HasMaxLength(24).IsRequired();

            entity.HasIndex(unit => unit.Name)
                .IsUnique()
                .HasDatabaseName("ux_inventory_units_name");

            entity.HasIndex(unit => unit.Symbol)
                .IsUnique()
                .HasDatabaseName("ux_inventory_units_symbol");

            entity.HasIndex(unit => unit.LegacyId)
                .HasDatabaseName("ix_inventory_units_legacy_id");
        });
    }

    private static void ConfigureInventoryItems(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryItemEntity>(entity =>
        {
            entity.ToTable("items", "inventory");
            entity.HasKey(item => item.Id);

            entity.Property(item => item.Id).HasColumnName("id");
            entity.Property(item => item.LegacyId).HasColumnName("legacy_id");
            entity.Property(item => item.Name).HasColumnName("name").HasMaxLength(260).IsRequired();
            entity.Property(item => item.Sku).HasColumnName("sku").HasMaxLength(140).IsRequired();
            entity.Property(item => item.CategoryId).HasColumnName("category_id");
            entity.Property(item => item.UnitId).HasColumnName("unit_id");
            entity.Property(item => item.ItemKind).HasColumnName("item_kind").HasMaxLength(140).IsRequired();
            entity.Property(item => item.NormItemName).HasColumnName("norm_item_name").HasMaxLength(260).IsRequired();
            entity.Property(item => item.ActualItemName).HasColumnName("actual_item_name").HasMaxLength(260).IsRequired();
            entity.Property(item => item.BrandName).HasColumnName("brand_name").HasMaxLength(140).IsRequired();
            entity.Property(item => item.ModelName).HasColumnName("model_name").HasMaxLength(140).IsRequired();
            entity.Property(item => item.Article).HasColumnName("article").HasMaxLength(140).IsRequired();
            entity.Property(item => item.ProtectionClass).HasColumnName("protection_class").HasMaxLength(140).IsRequired();
            entity.Property(item => item.StandardsJson).HasColumnName("standards_json").HasColumnType("jsonb").IsRequired();
            entity.Property(item => item.ClothingSize).HasColumnName("clothing_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.HeightSize).HasColumnName("height_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.ShoeSize).HasColumnName("shoe_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.HeadSize).HasColumnName("head_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.GloveSize).HasColumnName("glove_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.RespiratorSize).HasColumnName("respirator_size").HasMaxLength(80).IsRequired();
            entity.Property(item => item.DefaultLifeMonths).HasColumnName("default_life_months");
            entity.Property(item => item.DefaultUnitPriceMinor).HasColumnName("default_unit_price_minor");
            entity.Property(item => item.MinStockQty).HasColumnName("min_stock_qty").HasPrecision(12, 3);
            entity.Property(item => item.IsConsumable).HasColumnName("is_consumable");
            entity.Property(item => item.TrackLife).HasColumnName("track_life");
            entity.Property(item => item.TrackingType).HasColumnName("tracking_type").HasMaxLength(40).IsRequired();
            entity.Property(item => item.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(item => item.SearchText)
                .HasColumnName("search_text")
                .HasColumnType("text")
                .HasComputedColumnSql(
                    "lower(name || ' ' || sku || ' ' || article || ' ' || item_kind || ' ' || norm_item_name || ' ' || actual_item_name || ' ' || brand_name || ' ' || model_name || ' ' || protection_class || ' ' || comment)",
                    stored: true);
            entity.Property(item => item.IsActive).HasColumnName("is_active");
            entity.Property(item => item.CreatedAt).HasColumnName("created_at");

            entity.HasOne(item => item.Category)
                .WithMany(category => category.Items)
                .HasForeignKey(item => item.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(item => item.Unit)
                .WithMany(unit => unit.Items)
                .HasForeignKey(item => item.UnitId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(item => item.Name)
                .IsUnique()
                .HasDatabaseName("ux_inventory_items_name");

            entity.HasIndex(item => item.Sku).HasDatabaseName("ix_inventory_items_sku");
            entity.HasIndex(item => item.CategoryId).HasDatabaseName("ix_inventory_items_category_id");
            entity.HasIndex(item => item.LegacyId).HasDatabaseName("ix_inventory_items_legacy_id");
            entity.HasIndex(item => item.IsActive).HasDatabaseName("ix_inventory_items_is_active");
            entity.HasIndex(item => item.SearchText)
                .HasDatabaseName("ix_inventory_items_search_text_trgm")
                .HasMethod("gin")
                .HasOperators("gin_trgm_ops");
        });
    }

    private static void ConfigureInventoryWarehouses(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryWarehouseEntity>(entity =>
        {
            entity.ToTable("warehouses", "inventory");
            entity.HasKey(warehouse => warehouse.Id);

            entity.Property(warehouse => warehouse.Id).HasColumnName("id");
            entity.Property(warehouse => warehouse.LegacyId).HasColumnName("legacy_id");
            entity.Property(warehouse => warehouse.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(warehouse => warehouse.IsDefault).HasColumnName("is_default");
            entity.Property(warehouse => warehouse.IsArchived).HasColumnName("is_archived");

            entity.HasIndex(warehouse => warehouse.Name)
                .IsUnique()
                .HasDatabaseName("ux_inventory_warehouses_name");

            entity.HasIndex(warehouse => warehouse.LegacyId)
                .HasDatabaseName("ix_inventory_warehouses_legacy_id");
        });
    }

    private static void ConfigureInventoryStockMoves(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryStockMoveEntity>(entity =>
        {
            entity.ToTable("stock_moves", "inventory");
            entity.HasKey(move => move.Id);

            entity.Property(move => move.Id).HasColumnName("id");
            entity.Property(move => move.LegacyId).HasColumnName("legacy_id");
            entity.Property(move => move.ItemId).HasColumnName("item_id");
            entity.Property(move => move.WarehouseId).HasColumnName("warehouse_id");
            entity.Property(move => move.QuantityDelta).HasColumnName("qty_delta").HasPrecision(12, 3);
            entity.Property(move => move.MovedAt).HasColumnName("moved_at");
            entity.Property(move => move.EmployeeId).HasColumnName("employee_id");
            entity.Property(move => move.MoveType).HasColumnName("move_type").HasMaxLength(60).IsRequired();
            entity.Property(move => move.ReferenceType).HasColumnName("reference_type").HasMaxLength(80).IsRequired();
            entity.Property(move => move.ReferenceId).HasColumnName("reference_id");
            entity.Property(move => move.CustodyRecordId).HasColumnName("custody_record_id");
            entity.Property(move => move.PpeCardLineId).HasColumnName("ppe_card_line_id");

            entity.HasOne(move => move.Item)
                .WithMany(item => item.StockMoves)
                .HasForeignKey(move => move.ItemId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(move => move.Warehouse)
                .WithMany(warehouse => warehouse.StockMoves)
                .HasForeignKey(move => move.WarehouseId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(move => move.Employee)
                .WithMany()
                .HasForeignKey(move => move.EmployeeId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(move => move.CustodyRecord)
                .WithMany(record => record.StockMoves)
                .HasForeignKey(move => move.CustodyRecordId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(move => move.PpeCardLine)
                .WithMany(line => line.StockMoves)
                .HasForeignKey(move => move.PpeCardLineId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(move => new { move.ItemId, move.MovedAt })
                .HasDatabaseName("ix_inventory_stock_moves_item_moved");

            entity.HasIndex(move => new { move.WarehouseId, move.MovedAt })
                .HasDatabaseName("ix_inventory_stock_moves_warehouse_moved");

            entity.HasIndex(move => new { move.ItemId, move.WarehouseId, move.MoveType })
                .HasDatabaseName("ix_inventory_stock_moves_item_warehouse_type");

            entity.HasIndex(move => move.LegacyId)
                .HasDatabaseName("ix_inventory_stock_moves_legacy_id");

            entity.HasIndex(move => move.CustodyRecordId)
                .HasDatabaseName("ix_inventory_stock_moves_custody_record_id");

            entity.HasIndex(move => move.PpeCardLineId)
                .HasDatabaseName("ix_inventory_stock_moves_ppe_card_line_id");
        });
    }

    private static void ConfigureInventoryWorkflow(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<InventoryCustodyCategoryEntity>(entity =>
        {
            entity.ToTable("custody_categories", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.IsArchived).HasColumnName("is_archived");
            entity.HasIndex(row => row.Name).IsUnique().HasDatabaseName("ux_inventory_custody_categories_name");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_custody_categories_legacy_id");
        });

        modelBuilder.Entity<InventoryCustodyDocumentEntity>(entity =>
        {
            entity.ToTable("custody_documents", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.Number).HasColumnName("number").HasMaxLength(80).IsRequired();
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.ClosedAt).HasColumnName("closed_at");
            entity.Property(row => row.ArchivedAt).HasColumnName("archived_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => row.Number).IsUnique().HasDatabaseName("ux_inventory_custody_documents_number");
            entity.HasIndex(row => new { row.EmployeeId, row.Status }).HasDatabaseName("ix_inventory_custody_documents_employee_status");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_custody_documents_legacy_id");
        });

        modelBuilder.Entity<InventoryCustodyRecordEntity>(entity =>
        {
            entity.ToTable("custody_records", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.DocumentId).HasColumnName("document_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.WarehouseId).HasColumnName("warehouse_id");
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.IssuedAt).HasColumnName("issued_at");
            entity.Property(row => row.ClosedAt).HasColumnName("closed_at");
            entity.Property(row => row.ArchivedAt).HasColumnName("archived_at");
            entity.HasOne(row => row.Document).WithMany(document => document.Records).HasForeignKey(row => row.DocumentId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.Item).WithMany().HasForeignKey(row => row.ItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.Warehouse).WithMany().HasForeignKey(row => row.WarehouseId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.EmployeeId, row.Status }).HasDatabaseName("ix_inventory_custody_records_employee_status");
            entity.HasIndex(row => row.DocumentId).HasDatabaseName("ix_inventory_custody_records_document_id");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_custody_records_legacy_id");
        });

        modelBuilder.Entity<InventoryCustodyRecordEventEntity>(entity =>
        {
            entity.ToTable("custody_record_events", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.RecordId).HasColumnName("record_id");
            entity.Property(row => row.EventType).HasColumnName("event_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.FromStatus).HasColumnName("from_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.ToStatus).HasColumnName("to_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.Actor).HasColumnName("actor").HasMaxLength(160).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Record).WithMany(record => record.Events).HasForeignKey(row => row.RecordId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.RecordId, row.CreatedAt }).HasDatabaseName("ix_inventory_custody_events_record_created");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_custody_events_legacy_id");
        });

        modelBuilder.Entity<InventoryPpeCardEntity>(entity =>
        {
            entity.ToTable("ppe_cards", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.Position).HasColumnName("position").HasMaxLength(160).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.IssueType).HasColumnName("issue_type").HasMaxLength(40).IsRequired();
            entity.Property(row => row.ResponsibleName).HasColumnName("responsible_name").HasMaxLength(240).IsRequired();
            entity.Property(row => row.Basis).HasColumnName("basis").HasMaxLength(600).IsRequired();
            entity.Property(row => row.Gender).HasColumnName("gender").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Height).HasColumnName("height").HasMaxLength(40).IsRequired();
            entity.Property(row => row.ClothingSize).HasColumnName("clothing_size").HasMaxLength(80).IsRequired();
            entity.Property(row => row.ShoeSize).HasColumnName("shoe_size").HasMaxLength(80).IsRequired();
            entity.Property(row => row.HeadSize).HasColumnName("head_size").HasMaxLength(80).IsRequired();
            entity.Property(row => row.RespiratorSize).HasColumnName("respirator_size").HasMaxLength(120).IsRequired();
            entity.Property(row => row.HandProtectionSize).HasColumnName("hand_protection_size").HasMaxLength(120).IsRequired();
            entity.Property(row => row.Version).HasColumnName("version").IsConcurrencyToken();
            entity.Property(row => row.LastIssueBatchKey).HasColumnName("last_issue_batch_key").HasMaxLength(120);
            entity.Property(row => row.NormSetId).HasColumnName("norm_set_id");
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.ArchivedAt).HasColumnName("archived_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.NormSet).WithMany().HasForeignKey(row => row.NormSetId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.EmployeeId, row.ArchivedAt }).HasDatabaseName("ix_inventory_ppe_cards_employee_archived");
            entity.HasIndex(row => row.EmployeeId).IsUnique().HasFilter("archived_at IS NULL").HasDatabaseName("ux_inventory_ppe_cards_employee_active");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_ppe_cards_legacy_id");
        });

        modelBuilder.Entity<InventoryPpeCardLineEntity>(entity =>
        {
            entity.ToTable("ppe_card_lines", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.CardId).HasColumnName("card_id");
            entity.Property(row => row.CardNormRowId).HasColumnName("card_norm_row_id");
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.WarehouseId).HasColumnName("warehouse_id");
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.UnitPriceMinor).HasColumnName("unit_price_minor");
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.IssuedAt).HasColumnName("issued_at");
            entity.Property(row => row.DueAt).HasColumnName("due_at");
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.PrintItemName).HasColumnName("print_item_name").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.NormPoint).HasColumnName("norm_point").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.IssuePeriodText).HasColumnName("issue_period_text").HasMaxLength(500).IsRequired();
            entity.Property(row => row.QuantityText).HasColumnName("quantity_text");
            entity.Property(row => row.IsSectionTitle).HasColumnName("is_section_title").HasDefaultValue(false);
            entity.Property(row => row.BrandModelArticle).HasColumnName("brand_model_article").HasMaxLength(600).IsRequired();
            entity.Property(row => row.IssueMethod).HasColumnName("issue_method").HasMaxLength(40).IsRequired();
            entity.Property(row => row.SizeText).HasColumnName("size_text").HasMaxLength(120).IsRequired();
            entity.Property(row => row.ReturnedAt).HasColumnName("returned_at");
            entity.Property(row => row.ReturnedQuantity).HasColumnName("returned_quantity").HasPrecision(12, 3);
            entity.Property(row => row.WriteOffActDate).HasColumnName("write_off_act_date");
            entity.Property(row => row.WriteOffActNumber).HasColumnName("write_off_act_number").HasMaxLength(120).IsRequired();
            entity.HasOne(row => row.Card).WithMany(card => card.Lines).HasForeignKey(row => row.CardId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.CardNormRow).WithMany(row => row.Issues).HasForeignKey(row => row.CardNormRowId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.Item).WithMany().HasForeignKey(row => row.ItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.Warehouse).WithMany().HasForeignKey(row => row.WarehouseId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.CardId, row.Status }).HasDatabaseName("ix_inventory_ppe_lines_card_status");
            entity.HasIndex(row => row.CardNormRowId).HasDatabaseName("ix_inventory_ppe_lines_card_norm_row");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_ppe_lines_legacy_id");
        });

        modelBuilder.Entity<InventoryPpeNormSetEntity>(entity =>
        {
            entity.Property(row => row.DepartmentName).HasColumnName("department_name").HasMaxLength(500);
            entity.Property(row => row.PositionAliasesJson).HasColumnName("position_aliases_json").HasColumnType("jsonb");
            entity.Property(row => row.ScopeConfirmed).HasColumnName("scope_confirmed");
            entity.ToTable("ppe_norm_sets", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PositionName).HasColumnName("position_name").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.VersionName).HasColumnName("version_name").HasMaxLength(120).IsRequired();
            entity.Property(row => row.EffectiveFrom).HasColumnName("effective_from");
            entity.Property(row => row.EffectiveTo).HasColumnName("effective_to");
            entity.Property(row => row.SourceName).HasColumnName("source_name").HasMaxLength(500).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.RequiresReview).HasColumnName("requires_review");
            entity.Property(row => row.Version).HasColumnName("version").IsConcurrencyToken();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.Property(row => row.ArchivedAt).HasColumnName("archived_at");
            entity.HasIndex(row => new { row.PositionName, row.Status }).HasDatabaseName("ix_inventory_ppe_norm_sets_position_status");
            entity.HasIndex(row => new { row.DepartmentName, row.PositionName, row.VersionName }).IsUnique().HasDatabaseName("ux_inventory_ppe_norm_sets_scope_version");
        });

        modelBuilder.Entity<InventoryPpeNormRowEntity>(entity =>
        {
            entity.Property(row => row.PeriodMonths).HasColumnName("period_months");
            entity.Property(row => row.UnitSymbol).HasColumnName("unit_symbol").HasMaxLength(40);
            entity.Property(row => row.RequirementKey).HasColumnName("requirement_key");
            entity.Property(row => row.AlternativeGroup).HasColumnName("alternative_group").HasMaxLength(120);
            entity.ToTable("ppe_norm_rows", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.NormSetId).HasColumnName("norm_set_id");
            entity.Property(row => row.ParentRowId).HasColumnName("parent_row_id");
            entity.Property(row => row.RowType).HasColumnName("row_type").HasMaxLength(20).IsRequired();
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.NormItemName).HasColumnName("norm_item_name").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.NormPoint).HasColumnName("norm_point").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.IssuePeriodText).HasColumnName("issue_period_text").HasMaxLength(500).IsRequired();
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.QuantityText).HasColumnName("quantity_text").HasMaxLength(120).IsRequired();
            entity.Property(row => row.LifeMonths).HasColumnName("life_months");
            entity.HasOne(row => row.NormSet).WithMany(set => set.Rows).HasForeignKey(row => row.NormSetId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.ParentRow).WithMany(row => row.Children).HasForeignKey(row => row.ParentRowId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.NormSetId, row.SortOrder }).IsUnique().HasDatabaseName("ux_inventory_ppe_norm_rows_set_order");
            entity.HasIndex(row => row.ParentRowId).HasDatabaseName("ix_inventory_ppe_norm_rows_parent");
        });

        modelBuilder.Entity<InventoryPpeNormCatalogMappingEntity>(entity =>
        {
            entity.Property(row => row.IsApproved).HasColumnName("is_approved");
            entity.Property(row => row.NormUnitsPerItem).HasColumnName("norm_units_per_item").HasPrecision(18, 6);
            entity.Property(row => row.ApprovedBy).HasColumnName("approved_by").HasMaxLength(240);
            entity.Property(row => row.ApprovalEvidence).HasColumnName("approval_evidence").HasMaxLength(2000);
            entity.ToTable("ppe_norm_catalog_mappings", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.NormRowId).HasColumnName("norm_row_id");
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.BrandModelArticle).HasColumnName("brand_model_article").HasMaxLength(600).IsRequired();
            entity.Property(row => row.DefaultUnitPriceMinor).HasColumnName("default_unit_price_minor");
            entity.Property(row => row.IsDefault).HasColumnName("is_default");
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.Property(row => row.ArchivedAt).HasColumnName("archived_at");
            entity.HasOne(row => row.NormRow).WithMany(row => row.Mappings).HasForeignKey(row => row.NormRowId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Item).WithMany().HasForeignKey(row => row.ItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.NormRowId, row.ItemId }).IsUnique().HasDatabaseName("ux_inventory_ppe_norm_mapping_row_item");
            entity.HasIndex(row => row.ItemId).HasDatabaseName("ix_inventory_ppe_norm_mapping_item");
            entity.HasIndex(row => row.ArchivedAt).HasDatabaseName("ix_inventory_ppe_norm_mapping_archived");
        });

        modelBuilder.Entity<InventoryPpeCardNormRowEntity>(entity =>
        {
            entity.ToTable("ppe_card_norm_rows", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.CardId).HasColumnName("card_id");
            entity.Property(row => row.SourceNormRowId).HasColumnName("source_norm_row_id");
            entity.Property(row => row.ParentRowId).HasColumnName("parent_row_id");
            entity.Property(row => row.MappedItemId).HasColumnName("mapped_item_id");
            entity.Property(row => row.RowType).HasColumnName("row_type").HasMaxLength(20).IsRequired();
            entity.Property(row => row.SortOrder).HasColumnName("sort_order");
            entity.Property(row => row.NormItemName).HasColumnName("norm_item_name").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.NormPoint).HasColumnName("norm_point").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.IssuePeriodText).HasColumnName("issue_period_text").HasMaxLength(500).IsRequired();
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.QuantityText).HasColumnName("quantity_text").HasMaxLength(120).IsRequired();
            entity.Property(row => row.LifeMonths).HasColumnName("life_months");
            entity.Property(row => row.BrandModelArticle).HasColumnName("brand_model_article").HasMaxLength(600).IsRequired();
            entity.Property(row => row.DefaultUnitPriceMinor).HasColumnName("default_unit_price_minor");
            entity.Property(row => row.DraftIssuedAt).HasColumnName("draft_issued_at");
            entity.Property(row => row.DraftQuantity).HasColumnName("draft_quantity").HasPrecision(12, 3);
            entity.Property(row => row.DraftUnitPriceMinor).HasColumnName("draft_unit_price_minor");
            entity.Property(row => row.DraftIssueMethod).HasColumnName("draft_issue_method").HasMaxLength(40).IsRequired();
            entity.Property(row => row.DraftSizeText).HasColumnName("draft_size_text").HasMaxLength(120).IsRequired();
            entity.Property(row => row.DraftWarehouseId).HasColumnName("draft_warehouse_id");
            entity.Property(row => row.DraftComment).HasColumnName("draft_comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.DraftBrandModelArticle).HasColumnName("draft_brand_model_article").HasMaxLength(600).IsRequired();
            entity.HasOne(row => row.Card).WithMany(card => card.NormRows).HasForeignKey(row => row.CardId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.SourceNormRow).WithMany().HasForeignKey(row => row.SourceNormRowId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(row => row.ParentRow).WithMany(row => row.Children).HasForeignKey(row => row.ParentRowId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(row => row.MappedItem).WithMany().HasForeignKey(row => row.MappedItemId).OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(row => new { row.CardId, row.SortOrder }).IsUnique().HasDatabaseName("ux_inventory_ppe_card_norm_rows_card_order");
            entity.HasIndex(row => row.ParentRowId).HasDatabaseName("ix_inventory_ppe_card_norm_rows_parent");
        });

        modelBuilder.Entity<InventoryPpeCardLineEventEntity>(entity =>
        {
            entity.ToTable("ppe_card_line_events", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.LineId).HasColumnName("line_id");
            entity.Property(row => row.EventType).HasColumnName("event_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.FromStatus).HasColumnName("from_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.ToStatus).HasColumnName("to_status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Comment).HasColumnName("comment").HasMaxLength(1200).IsRequired();
            entity.Property(row => row.Actor).HasColumnName("actor").HasMaxLength(160).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasOne(row => row.Line).WithMany(line => line.Events).HasForeignKey(row => row.LineId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.LineId, row.CreatedAt }).HasDatabaseName("ix_inventory_ppe_events_line_created");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_ppe_events_legacy_id");
        });

        modelBuilder.Entity<InventoryPpeIssueTemplateEntity>(entity =>
        {
            entity.ToTable("ppe_issue_templates", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.IsArchived).HasColumnName("is_archived");
            entity.Property(row => row.NormSetId).HasColumnName("norm_set_id");
            entity.Property(row => row.OwnerUserId).HasColumnName("owner_user_id");
            entity.Property(row => row.OwnerName).HasColumnName("owner_name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.IsShared).HasColumnName("is_shared");
            entity.Property(row => row.Version).HasColumnName("version").IsConcurrencyToken();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_ppe_issue_templates_legacy_id");
            entity.HasIndex(row => new { row.OwnerUserId, row.IsArchived, row.UpdatedAt }).HasDatabaseName("ix_ppe_issue_templates_owner_archive_updated");
            entity.HasIndex(row => new { row.IsShared, row.IsArchived, row.UpdatedAt }).HasDatabaseName("ix_ppe_issue_templates_shared_archive_updated");
        });
        modelBuilder.Entity<InventoryPpeIssueTemplateLineEntity>(entity =>
        {
            entity.ToTable("ppe_issue_template_lines", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.TemplateId).HasColumnName("template_id");
            entity.Property(row => row.NormRowId).HasColumnName("norm_row_id");
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.ItemName).HasColumnName("item_name").HasMaxLength(500).IsRequired();
            entity.Property(row => row.UnitSymbol).HasColumnName("unit_symbol").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.LifeMonths).HasColumnName("life_months");
            entity.Property(row => row.UnitPriceMinor).HasColumnName("unit_price_minor");
            entity.HasOne(row => row.Template).WithMany(row => row.Lines).HasForeignKey(row => row.TemplateId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.TemplateId, row.NormRowId, row.ItemId }).IsUnique().HasDatabaseName("ux_ppe_issue_template_lines_mapping");
        });
        ConfigureSimpleInventoryEntity<InventoryReturnReasonEntity>(modelBuilder, "return_reasons");
        ConfigureSimpleInventoryEntity<InventoryWriteOffReasonEntity>(modelBuilder, "write_off_reasons");

        modelBuilder.Entity<InventoryItemSetEntity>(entity =>
        {
            entity.ToTable("item_sets", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.IsArchived).HasColumnName("is_archived");
            entity.HasIndex(row => row.Name).IsUnique().HasDatabaseName("ux_inventory_item_sets_name");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_item_sets_legacy_id");
        });

        modelBuilder.Entity<InventoryItemSetItemEntity>(entity =>
        {
            entity.ToTable("item_set_items", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.ItemSetId).HasColumnName("item_set_id");
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.HasOne(row => row.ItemSet).WithMany(set => set.Items).HasForeignKey(row => row.ItemSetId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(row => row.Item).WithMany().HasForeignKey(row => row.ItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.ItemSetId, row.ItemId }).IsUnique().HasDatabaseName("ux_inventory_item_set_items_set_item");
        });

        modelBuilder.Entity<InventoryPositionNormEntity>(entity =>
        {
            entity.ToTable("position_norms", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.PositionName).HasColumnName("position_name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.ItemId).HasColumnName("item_id");
            entity.Property(row => row.NormItemName).HasColumnName("norm_item_name").HasMaxLength(500).HasDefaultValue("");
            entity.Property(row => row.NormPoint).HasColumnName("norm_point").HasMaxLength(240).HasDefaultValue("");
            entity.Property(row => row.IssuePeriodText).HasColumnName("issue_period_text").HasMaxLength(160).HasDefaultValue("");
            entity.Property(row => row.QuantityText).HasColumnName("quantity_text").HasMaxLength(80).HasDefaultValue("");
            entity.Property(row => row.IsSectionTitle).HasColumnName("is_section_title").HasDefaultValue(false);
            entity.Property(row => row.Quantity).HasColumnName("quantity").HasPrecision(12, 3);
            entity.Property(row => row.LifeMonths).HasColumnName("life_months");
            entity.HasOne(row => row.Item).WithMany().HasForeignKey(row => row.ItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(row => new { row.PositionName, row.ItemId }).IsUnique().HasDatabaseName("ux_inventory_position_norms_position_item");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_position_norms_legacy_id");
        });

        modelBuilder.Entity<InventoryPositionItemSetMapEntity>(entity =>
        {
            entity.ToTable("position_item_set_maps", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.PositionName).HasColumnName("position_name").HasMaxLength(160).IsRequired();
            entity.Property(row => row.ItemSetId).HasColumnName("item_set_id");
            entity.HasOne(row => row.ItemSet).WithMany().HasForeignKey(row => row.ItemSetId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.PositionName, row.ItemSetId }).IsUnique().HasDatabaseName("ux_inventory_position_item_sets_position_set");
        });

        modelBuilder.Entity<InventorySystemLogEntity>(entity =>
        {
            entity.ToTable("system_log", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.EntityType).HasColumnName("entity_type").HasMaxLength(80).IsRequired();
            entity.Property(row => row.EntityId).HasColumnName("entity_id");
            entity.Property(row => row.Action).HasColumnName("action").HasMaxLength(120).IsRequired();
            entity.Property(row => row.Details).HasColumnName("details").HasMaxLength(2000).IsRequired();
            entity.Property(row => row.Actor).HasColumnName("actor").HasMaxLength(160).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => new { row.EntityType, row.CreatedAt }).HasDatabaseName("ix_inventory_system_log_entity_created");
            entity.HasIndex(row => row.CreatedAt).HasDatabaseName("ix_inventory_system_log_created_at");
            entity.HasIndex(row => row.Action).HasDatabaseName("ix_inventory_system_log_action");
            entity.HasIndex(row => row.Actor).HasDatabaseName("ix_inventory_system_log_actor");
            entity.HasIndex(row => row.LegacyId).HasDatabaseName("ix_inventory_system_log_legacy_id");
        });

        modelBuilder.Entity<InventoryExportJobEntity>(entity =>
        {
            entity.ToTable("export_jobs", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.ReportId).HasColumnName("report_id").HasMaxLength(120).IsRequired();
            entity.Property(row => row.Format).HasColumnName("format").HasMaxLength(40).IsRequired();
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.DownloadName).HasColumnName("download_name").HasMaxLength(260).IsRequired();
            entity.Property(row => row.PayloadJson).HasColumnName("payload_json").HasColumnType("jsonb").IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(row => new { row.ReportId, row.CreatedAt }).HasDatabaseName("ix_inventory_export_jobs_report_created");
        });

        modelBuilder.Entity<InventoryLegacyImportRunEntity>(entity =>
        {
            entity.ToTable("legacy_import_runs", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.DryRun).HasColumnName("dry_run");
            entity.Property(row => row.Status).HasColumnName("status").HasMaxLength(40).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.CompletedAt).HasColumnName("completed_at");
            entity.Property(row => row.TablesScanned).HasColumnName("tables_scanned");
            entity.Property(row => row.RowsRead).HasColumnName("rows_read");
            entity.Property(row => row.RowsInserted).HasColumnName("rows_inserted");
            entity.Property(row => row.RowsUpdated).HasColumnName("rows_updated");
            entity.Property(row => row.RowsSkipped).HasColumnName("rows_skipped");
            entity.Property(row => row.Error).HasColumnName("error").HasMaxLength(4000).IsRequired();
            entity.Property(row => row.StockChecksum).HasColumnName("stock_checksum").HasColumnType("jsonb").IsRequired();
            entity.Property(row => row.TablesJson).HasColumnName("tables_json").HasColumnType("jsonb").IsRequired();
            entity.HasIndex(row => row.CreatedAt).HasDatabaseName("ix_inventory_legacy_import_runs_created");
        });

        modelBuilder.Entity<InventoryEmployeeLegacyLinkEntity>(entity =>
        {
            entity.ToTable("employee_legacy_links", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.EmployeeId).HasColumnName("employee_id");
            entity.Property(row => row.SourceKey).HasColumnName("source_key").HasMaxLength(80).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(row => row.Employee).WithMany().HasForeignKey(row => row.EmployeeId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.SourceKey, row.LegacyId }).IsUnique().HasDatabaseName("ux_inventory_employee_legacy_links_source_legacy");
            entity.HasIndex(row => row.EmployeeId).HasDatabaseName("ix_inventory_employee_legacy_links_employee");
        });

        modelBuilder.Entity<InventoryUserLegacyLinkEntity>(entity =>
        {
            entity.ToTable("user_legacy_links", "inventory");
            entity.HasKey(row => row.Id);
            entity.Property(row => row.Id).HasColumnName("id");
            entity.Property(row => row.LegacyId).HasColumnName("legacy_id");
            entity.Property(row => row.UserId).HasColumnName("user_id");
            entity.Property(row => row.SourceKey).HasColumnName("source_key").HasMaxLength(80).IsRequired();
            entity.Property(row => row.CreatedAt).HasColumnName("created_at");
            entity.Property(row => row.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(row => row.User).WithMany().HasForeignKey(row => row.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(row => new { row.SourceKey, row.LegacyId }).IsUnique().HasDatabaseName("ux_inventory_user_legacy_links_source_legacy");
            entity.HasIndex(row => row.UserId).HasDatabaseName("ix_inventory_user_legacy_links_user");
        });
    }

    private static void ConfigureSimpleInventoryEntity<TEntity>(ModelBuilder modelBuilder, string tableName)
        where TEntity : class
    {
        modelBuilder.Entity<TEntity>(entity =>
        {
            entity.ToTable(tableName, "inventory");
            entity.HasKey("Id");
            entity.Property<Guid>("Id").HasColumnName("id");
            entity.Property<int?>("LegacyId").HasColumnName("legacy_id");
            entity.Property<string>("Name").HasColumnName("name").HasMaxLength(160).IsRequired();
            entity.Property<bool>("IsArchived").HasColumnName("is_archived");
            entity.HasIndex("Name").IsUnique().HasDatabaseName($"ux_inventory_{tableName}_name");
            entity.HasIndex("LegacyId").HasDatabaseName($"ix_inventory_{tableName}_legacy_id");
        });
    }

}

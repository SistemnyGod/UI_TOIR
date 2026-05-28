using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InventoryCustodyPpeWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "custody_record_id",
                schema: "inventory",
                table: "stock_moves",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ppe_card_line_id",
                schema: "inventory",
                table: "stock_moves",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "custody_categories",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_custody_categories", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "custody_documents",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    number = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    closed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    archived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_custody_documents", x => x.id);
                    table.ForeignKey(
                        name: "FK_custody_documents_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "export_jobs",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    report_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    format = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    download_name = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                    payload_json = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_export_jobs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "item_sets",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_item_sets", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "position_norms",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    position_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    life_months = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_position_norms", x => x.id);
                    table.ForeignKey(
                        name: "FK_position_norms_items_item_id",
                        column: x => x.item_id,
                        principalSchema: "inventory",
                        principalTable: "items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ppe_cards",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    comment = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    archived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ppe_cards", x => x.id);
                    table.ForeignKey(
                        name: "FK_ppe_cards_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ppe_issue_templates",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ppe_issue_templates", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "return_reasons",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_return_reasons", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "system_log",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    entity_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    entity_id = table.Column<Guid>(type: "uuid", nullable: true),
                    action = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    details = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    actor = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_system_log", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "write_off_reasons",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_write_off_reasons", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "custody_records",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    document_id = table.Column<Guid>(type: "uuid", nullable: false),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    comment = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false),
                    issued_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    closed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    archived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_custody_records", x => x.id);
                    table.ForeignKey(
                        name: "FK_custody_records_custody_documents_document_id",
                        column: x => x.document_id,
                        principalSchema: "inventory",
                        principalTable: "custody_documents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_custody_records_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_custody_records_items_item_id",
                        column: x => x.item_id,
                        principalSchema: "inventory",
                        principalTable: "items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_custody_records_warehouses_warehouse_id",
                        column: x => x.warehouse_id,
                        principalSchema: "inventory",
                        principalTable: "warehouses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "item_set_items",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_set_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_item_set_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_item_set_items_item_sets_item_set_id",
                        column: x => x.item_set_id,
                        principalSchema: "inventory",
                        principalTable: "item_sets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_item_set_items_items_item_id",
                        column: x => x.item_id,
                        principalSchema: "inventory",
                        principalTable: "items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "position_item_set_maps",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    position_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    item_set_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_position_item_set_maps", x => x.id);
                    table.ForeignKey(
                        name: "FK_position_item_set_maps_item_sets_item_set_id",
                        column: x => x.item_set_id,
                        principalSchema: "inventory",
                        principalTable: "item_sets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ppe_card_lines",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    card_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "uuid", nullable: true),
                    quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    issued_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    due_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    comment = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ppe_card_lines", x => x.id);
                    table.ForeignKey(
                        name: "FK_ppe_card_lines_items_item_id",
                        column: x => x.item_id,
                        principalSchema: "inventory",
                        principalTable: "items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ppe_card_lines_ppe_cards_card_id",
                        column: x => x.card_id,
                        principalSchema: "inventory",
                        principalTable: "ppe_cards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ppe_card_lines_warehouses_warehouse_id",
                        column: x => x.warehouse_id,
                        principalSchema: "inventory",
                        principalTable: "warehouses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "custody_record_events",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    record_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    from_status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    to_status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    comment = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false),
                    actor = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_custody_record_events", x => x.id);
                    table.ForeignKey(
                        name: "FK_custody_record_events_custody_records_record_id",
                        column: x => x.record_id,
                        principalSchema: "inventory",
                        principalTable: "custody_records",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ppe_card_line_events",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    line_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    from_status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    to_status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    comment = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false),
                    actor = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ppe_card_line_events", x => x.id);
                    table.ForeignKey(
                        name: "FK_ppe_card_line_events_ppe_card_lines_line_id",
                        column: x => x.line_id,
                        principalSchema: "inventory",
                        principalTable: "ppe_card_lines",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_stock_moves_custody_record_id",
                schema: "inventory",
                table: "stock_moves",
                column: "custody_record_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_stock_moves_ppe_card_line_id",
                schema: "inventory",
                table: "stock_moves",
                column: "ppe_card_line_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_custody_categories_legacy_id",
                schema: "inventory",
                table: "custody_categories",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_custody_categories_name",
                schema: "inventory",
                table: "custody_categories",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_custody_documents_employee_status",
                schema: "inventory",
                table: "custody_documents",
                columns: new[] { "employee_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_custody_documents_legacy_id",
                schema: "inventory",
                table: "custody_documents",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_custody_documents_number",
                schema: "inventory",
                table: "custody_documents",
                column: "number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_custody_events_legacy_id",
                schema: "inventory",
                table: "custody_record_events",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_custody_events_record_created",
                schema: "inventory",
                table: "custody_record_events",
                columns: new[] { "record_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_custody_records_item_id",
                schema: "inventory",
                table: "custody_records",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "IX_custody_records_warehouse_id",
                schema: "inventory",
                table: "custody_records",
                column: "warehouse_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_custody_records_document_id",
                schema: "inventory",
                table: "custody_records",
                column: "document_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_custody_records_employee_status",
                schema: "inventory",
                table: "custody_records",
                columns: new[] { "employee_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_custody_records_legacy_id",
                schema: "inventory",
                table: "custody_records",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_export_jobs_report_created",
                schema: "inventory",
                table: "export_jobs",
                columns: new[] { "report_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_item_set_items_item_id",
                schema: "inventory",
                table: "item_set_items",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_item_set_items_set_item",
                schema: "inventory",
                table: "item_set_items",
                columns: new[] { "item_set_id", "item_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_item_sets_legacy_id",
                schema: "inventory",
                table: "item_sets",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_item_sets_name",
                schema: "inventory",
                table: "item_sets",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_position_item_set_maps_item_set_id",
                schema: "inventory",
                table: "position_item_set_maps",
                column: "item_set_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_position_item_sets_position_set",
                schema: "inventory",
                table: "position_item_set_maps",
                columns: new[] { "position_name", "item_set_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_position_norms_legacy_id",
                schema: "inventory",
                table: "position_norms",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "IX_position_norms_item_id",
                schema: "inventory",
                table: "position_norms",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_position_norms_position_item",
                schema: "inventory",
                table: "position_norms",
                columns: new[] { "position_name", "item_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_events_legacy_id",
                schema: "inventory",
                table: "ppe_card_line_events",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_events_line_created",
                schema: "inventory",
                table: "ppe_card_line_events",
                columns: new[] { "line_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_lines_card_status",
                schema: "inventory",
                table: "ppe_card_lines",
                columns: new[] { "card_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_lines_legacy_id",
                schema: "inventory",
                table: "ppe_card_lines",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "IX_ppe_card_lines_item_id",
                schema: "inventory",
                table: "ppe_card_lines",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "IX_ppe_card_lines_warehouse_id",
                schema: "inventory",
                table: "ppe_card_lines",
                column: "warehouse_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_cards_employee_archived",
                schema: "inventory",
                table: "ppe_cards",
                columns: new[] { "employee_id", "archived_at" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_cards_legacy_id",
                schema: "inventory",
                table: "ppe_cards",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_issue_templates_legacy_id",
                schema: "inventory",
                table: "ppe_issue_templates",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_ppe_issue_templates_name",
                schema: "inventory",
                table: "ppe_issue_templates",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_return_reasons_legacy_id",
                schema: "inventory",
                table: "return_reasons",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_return_reasons_name",
                schema: "inventory",
                table: "return_reasons",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_system_log_entity_created",
                schema: "inventory",
                table: "system_log",
                columns: new[] { "entity_type", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_system_log_legacy_id",
                schema: "inventory",
                table: "system_log",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_write_off_reasons_legacy_id",
                schema: "inventory",
                table: "write_off_reasons",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_write_off_reasons_name",
                schema: "inventory",
                table: "write_off_reasons",
                column: "name",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_moves_custody_records_custody_record_id",
                schema: "inventory",
                table: "stock_moves",
                column: "custody_record_id",
                principalSchema: "inventory",
                principalTable: "custody_records",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_moves_ppe_card_lines_ppe_card_line_id",
                schema: "inventory",
                table: "stock_moves",
                column: "ppe_card_line_id",
                principalSchema: "inventory",
                principalTable: "ppe_card_lines",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_stock_moves_custody_records_custody_record_id",
                schema: "inventory",
                table: "stock_moves");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_moves_ppe_card_lines_ppe_card_line_id",
                schema: "inventory",
                table: "stock_moves");

            migrationBuilder.DropTable(
                name: "custody_categories",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "custody_record_events",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "export_jobs",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "item_set_items",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "position_item_set_maps",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "position_norms",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "ppe_card_line_events",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "ppe_issue_templates",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "return_reasons",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "system_log",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "write_off_reasons",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "custody_records",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "item_sets",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "ppe_card_lines",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "custody_documents",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "ppe_cards",
                schema: "inventory");

            migrationBuilder.DropIndex(
                name: "ix_inventory_stock_moves_custody_record_id",
                schema: "inventory",
                table: "stock_moves");

            migrationBuilder.DropIndex(
                name: "ix_inventory_stock_moves_ppe_card_line_id",
                schema: "inventory",
                table: "stock_moves");

            migrationBuilder.DropColumn(
                name: "custody_record_id",
                schema: "inventory",
                table: "stock_moves");

            migrationBuilder.DropColumn(
                name: "ppe_card_line_id",
                schema: "inventory",
                table: "stock_moves");
        }
    }
}

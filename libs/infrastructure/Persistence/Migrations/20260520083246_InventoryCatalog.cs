using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InventoryCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "inventory");

            migrationBuilder.CreateTable(
                name: "categories",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_id = table.Column<Guid>(type: "uuid", nullable: true),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_categories", x => x.id);
                    table.ForeignKey(
                        name: "FK_categories_categories_parent_id",
                        column: x => x.parent_id,
                        principalSchema: "inventory",
                        principalTable: "categories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "units",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    symbol = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_units", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "warehouses",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    is_default = table.Column<bool>(type: "boolean", nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_warehouses", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "items",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    name = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                    sku = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: true),
                    unit_id = table.Column<Guid>(type: "uuid", nullable: true),
                    item_kind = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    norm_item_name = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                    actual_item_name = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                    brand_name = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    model_name = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    article = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    protection_class = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: false),
                    default_life_months = table.Column<int>(type: "integer", nullable: true),
                    default_unit_price_minor = table.Column<long>(type: "bigint", nullable: true),
                    min_stock_qty = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: true),
                    is_consumable = table.Column<bool>(type: "boolean", nullable: false),
                    track_life = table.Column<bool>(type: "boolean", nullable: false),
                    tracking_type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    comment = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_items_categories_category_id",
                        column: x => x.category_id,
                        principalSchema: "inventory",
                        principalTable: "categories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_items_units_unit_id",
                        column: x => x.unit_id,
                        principalSchema: "inventory",
                        principalTable: "units",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "stock_moves",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    legacy_id = table.Column<int>(type: "integer", nullable: true),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "uuid", nullable: false),
                    qty_delta = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    moved_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: true),
                    move_type = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    reference_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    reference_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_moves", x => x.id);
                    table.ForeignKey(
                        name: "FK_stock_moves_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_stock_moves_items_item_id",
                        column: x => x.item_id,
                        principalSchema: "inventory",
                        principalTable: "items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_stock_moves_warehouses_warehouse_id",
                        column: x => x.warehouse_id,
                        principalSchema: "inventory",
                        principalTable: "warehouses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_categories_legacy_id",
                schema: "inventory",
                table: "categories",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_categories_parent_name",
                schema: "inventory",
                table: "categories",
                columns: new[] { "parent_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_items_category_id",
                schema: "inventory",
                table: "items",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_items_is_active",
                schema: "inventory",
                table: "items",
                column: "is_active");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_items_legacy_id",
                schema: "inventory",
                table: "items",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_items_sku",
                schema: "inventory",
                table: "items",
                column: "sku");

            migrationBuilder.CreateIndex(
                name: "IX_items_unit_id",
                schema: "inventory",
                table: "items",
                column: "unit_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_items_name",
                schema: "inventory",
                table: "items",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_stock_moves_item_moved",
                schema: "inventory",
                table: "stock_moves",
                columns: new[] { "item_id", "moved_at" });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_stock_moves_legacy_id",
                schema: "inventory",
                table: "stock_moves",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_stock_moves_warehouse_moved",
                schema: "inventory",
                table: "stock_moves",
                columns: new[] { "warehouse_id", "moved_at" });

            migrationBuilder.CreateIndex(
                name: "IX_stock_moves_employee_id",
                schema: "inventory",
                table: "stock_moves",
                column: "employee_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_units_legacy_id",
                schema: "inventory",
                table: "units",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_units_name",
                schema: "inventory",
                table: "units",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_inventory_units_symbol",
                schema: "inventory",
                table: "units",
                column: "symbol",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_warehouses_legacy_id",
                schema: "inventory",
                table: "warehouses",
                column: "legacy_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_warehouses_name",
                schema: "inventory",
                table: "warehouses",
                column: "name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "stock_moves",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "items",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "warehouses",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "categories",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "units",
                schema: "inventory");
        }
    }
}

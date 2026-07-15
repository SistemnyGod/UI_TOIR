using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PpeNormWorkflowV2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "norm_set_id",
                schema: "inventory",
                table: "ppe_cards",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "version",
                schema: "inventory",
                table: "ppe_cards",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<Guid>(
                name: "card_norm_row_id",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "issue_method",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "returned_at",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "returned_quantity",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "size_text",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "write_off_act_date",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "write_off_act_number",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "ppe_norm_sets",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    position_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    version_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    effective_from = table.Column<DateOnly>(type: "date", nullable: true),
                    effective_to = table.Column<DateOnly>(type: "date", nullable: true),
                    source_name = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    requires_review = table.Column<bool>(type: "boolean", nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    archived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ppe_norm_sets", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "ppe_norm_rows",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    norm_set_id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_row_id = table.Column<Guid>(type: "uuid", nullable: true),
                    row_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    norm_item_name = table.Column<string>(type: "character varying(700)", maxLength: 700, nullable: false),
                    norm_point = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    issue_period_text = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    quantity_text = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    life_months = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ppe_norm_rows", x => x.id);
                    table.ForeignKey(
                        name: "FK_ppe_norm_rows_ppe_norm_rows_parent_row_id",
                        column: x => x.parent_row_id,
                        principalSchema: "inventory",
                        principalTable: "ppe_norm_rows",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ppe_norm_rows_ppe_norm_sets_norm_set_id",
                        column: x => x.norm_set_id,
                        principalSchema: "inventory",
                        principalTable: "ppe_norm_sets",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ppe_card_norm_rows",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    card_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_norm_row_id = table.Column<Guid>(type: "uuid", nullable: true),
                    parent_row_id = table.Column<Guid>(type: "uuid", nullable: true),
                    mapped_item_id = table.Column<Guid>(type: "uuid", nullable: true),
                    row_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    norm_item_name = table.Column<string>(type: "character varying(700)", maxLength: 700, nullable: false),
                    norm_point = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    issue_period_text = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: false),
                    quantity_text = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    life_months = table.Column<int>(type: "integer", nullable: true),
                    brand_model_article = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: false),
                    default_unit_price_minor = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ppe_card_norm_rows", x => x.id);
                    table.ForeignKey(
                        name: "FK_ppe_card_norm_rows_items_mapped_item_id",
                        column: x => x.mapped_item_id,
                        principalSchema: "inventory",
                        principalTable: "items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ppe_card_norm_rows_ppe_card_norm_rows_parent_row_id",
                        column: x => x.parent_row_id,
                        principalSchema: "inventory",
                        principalTable: "ppe_card_norm_rows",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ppe_card_norm_rows_ppe_cards_card_id",
                        column: x => x.card_id,
                        principalSchema: "inventory",
                        principalTable: "ppe_cards",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ppe_card_norm_rows_ppe_norm_rows_source_norm_row_id",
                        column: x => x.source_norm_row_id,
                        principalSchema: "inventory",
                        principalTable: "ppe_norm_rows",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ppe_norm_catalog_mappings",
                schema: "inventory",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    norm_row_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    brand_model_article = table.Column<string>(type: "character varying(600)", maxLength: 600, nullable: false),
                    default_unit_price_minor = table.Column<long>(type: "bigint", nullable: true),
                    is_default = table.Column<bool>(type: "boolean", nullable: false),
                    comment = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    archived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ppe_norm_catalog_mappings", x => x.id);
                    table.ForeignKey(
                        name: "FK_ppe_norm_catalog_mappings_items_item_id",
                        column: x => x.item_id,
                        principalSchema: "inventory",
                        principalTable: "items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ppe_norm_catalog_mappings_ppe_norm_rows_norm_row_id",
                        column: x => x.norm_row_id,
                        principalSchema: "inventory",
                        principalTable: "ppe_norm_rows",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ppe_cards_norm_set_id",
                schema: "inventory",
                table: "ppe_cards",
                column: "norm_set_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_lines_card_norm_row",
                schema: "inventory",
                table: "ppe_card_lines",
                column: "card_norm_row_id");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_card_norm_rows_parent",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                column: "parent_row_id");

            migrationBuilder.CreateIndex(
                name: "IX_ppe_card_norm_rows_mapped_item_id",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                column: "mapped_item_id");

            migrationBuilder.CreateIndex(
                name: "IX_ppe_card_norm_rows_source_norm_row_id",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                column: "source_norm_row_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_ppe_card_norm_rows_card_order",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                columns: new[] { "card_id", "sort_order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_norm_mapping_archived",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings",
                column: "archived_at");

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_norm_mapping_item",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings",
                column: "item_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_ppe_norm_mapping_row_item",
                schema: "inventory",
                table: "ppe_norm_catalog_mappings",
                columns: new[] { "norm_row_id", "item_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_norm_rows_parent",
                schema: "inventory",
                table: "ppe_norm_rows",
                column: "parent_row_id");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_ppe_norm_rows_set_order",
                schema: "inventory",
                table: "ppe_norm_rows",
                columns: new[] { "norm_set_id", "sort_order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_inventory_ppe_norm_sets_position_status",
                schema: "inventory",
                table: "ppe_norm_sets",
                columns: new[] { "position_name", "status" });

            migrationBuilder.CreateIndex(
                name: "ux_inventory_ppe_norm_sets_position_version",
                schema: "inventory",
                table: "ppe_norm_sets",
                columns: new[] { "position_name", "version_name" },
                unique: true);

            migrationBuilder.Sql(
                """
                ALTER TABLE inventory.ppe_norm_sets
                    ADD CONSTRAINT ck_inventory_ppe_norm_sets_status
                    CHECK (status IN ('draft', 'active', 'archived'));

                ALTER TABLE inventory.ppe_norm_rows
                    ADD CONSTRAINT ck_inventory_ppe_norm_rows_type
                    CHECK (row_type IN ('group', 'item'));

                ALTER TABLE inventory.ppe_card_norm_rows
                    ADD CONSTRAINT ck_inventory_ppe_card_norm_rows_type
                    CHECK (row_type IN ('group', 'item'));

                ALTER TABLE inventory.ppe_card_lines
                    ADD CONSTRAINT ck_inventory_ppe_card_lines_issue_method
                    CHECK (issue_method IN ('', 'personal', 'dispenser'));

                CREATE UNIQUE INDEX ux_inventory_ppe_norm_mapping_default
                    ON inventory.ppe_norm_catalog_mappings (norm_row_id)
                    WHERE is_default = TRUE AND archived_at IS NULL;

                INSERT INTO inventory.ppe_norm_sets
                    (id, position_name, version_name, effective_from, effective_to, source_name,
                     status, requires_review, version, created_at, updated_at, archived_at)
                SELECT
                    (
                        substr(md5('ppe-norm-set:' || position_name), 1, 8) || '-' ||
                        substr(md5('ppe-norm-set:' || position_name), 9, 4) || '-' ||
                        substr(md5('ppe-norm-set:' || position_name), 13, 4) || '-' ||
                        substr(md5('ppe-norm-set:' || position_name), 17, 4) || '-' ||
                        substr(md5('ppe-norm-set:' || position_name), 21, 12)
                    )::uuid,
                    position_name,
                    'legacy-import',
                    NULL,
                    NULL,
                    'inventory.position_norms',
                    'draft',
                    TRUE,
                    1,
                    NOW(),
                    NOW(),
                    NULL
                FROM (
                    SELECT DISTINCT position_name
                    FROM inventory.position_norms
                    WHERE btrim(position_name) <> ''
                ) positions;

                INSERT INTO inventory.ppe_norm_rows
                    (id, norm_set_id, parent_row_id, row_type, sort_order, norm_item_name,
                     norm_point, issue_period_text, quantity, quantity_text, life_months)
                SELECT
                    source.id,
                    source.norm_set_id,
                    NULL,
                    CASE WHEN source.is_section_title THEN 'group' ELSE 'item' END,
                    source.sort_order,
                    source.norm_item_name,
                    source.norm_point,
                    source.issue_period_text,
                    source.quantity,
                    source.quantity_text,
                    source.life_months
                FROM (
                    SELECT
                        pn.*,
                        ns.id AS norm_set_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY pn.position_name
                            ORDER BY pn.legacy_id NULLS LAST, pn.id
                        )::integer - 1 AS sort_order
                    FROM inventory.position_norms pn
                    INNER JOIN inventory.ppe_norm_sets ns
                        ON ns.position_name = pn.position_name
                       AND ns.version_name = 'legacy-import'
                ) source;

                INSERT INTO inventory.ppe_norm_catalog_mappings
                    (id, norm_row_id, item_id, brand_model_article, default_unit_price_minor,
                     is_default, comment, created_at, updated_at, archived_at)
                SELECT
                    pn.id,
                    pn.id,
                    pn.item_id,
                    '',
                    NULL,
                    TRUE,
                    'Перенесено из прежней связи position_norms.item_id; требуется проверка.',
                    NOW(),
                    NOW(),
                    NULL
                FROM inventory.position_norms pn
                WHERE pn.is_section_title = FALSE;
                """);

            migrationBuilder.AddForeignKey(
                name: "FK_ppe_card_lines_ppe_card_norm_rows_card_norm_row_id",
                schema: "inventory",
                table: "ppe_card_lines",
                column: "card_norm_row_id",
                principalSchema: "inventory",
                principalTable: "ppe_card_norm_rows",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ppe_cards_ppe_norm_sets_norm_set_id",
                schema: "inventory",
                table: "ppe_cards",
                column: "norm_set_id",
                principalSchema: "inventory",
                principalTable: "ppe_norm_sets",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DROP INDEX IF EXISTS inventory.ux_inventory_ppe_norm_mapping_default;
                ALTER TABLE inventory.ppe_card_lines
                    DROP CONSTRAINT IF EXISTS ck_inventory_ppe_card_lines_issue_method;
                ALTER TABLE inventory.ppe_card_norm_rows
                    DROP CONSTRAINT IF EXISTS ck_inventory_ppe_card_norm_rows_type;
                ALTER TABLE inventory.ppe_norm_rows
                    DROP CONSTRAINT IF EXISTS ck_inventory_ppe_norm_rows_type;
                ALTER TABLE inventory.ppe_norm_sets
                    DROP CONSTRAINT IF EXISTS ck_inventory_ppe_norm_sets_status;
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_ppe_card_lines_ppe_card_norm_rows_card_norm_row_id",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropForeignKey(
                name: "FK_ppe_cards_ppe_norm_sets_norm_set_id",
                schema: "inventory",
                table: "ppe_cards");

            migrationBuilder.DropTable(
                name: "ppe_card_norm_rows",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "ppe_norm_catalog_mappings",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "ppe_norm_rows",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "ppe_norm_sets",
                schema: "inventory");

            migrationBuilder.DropIndex(
                name: "IX_ppe_cards_norm_set_id",
                schema: "inventory",
                table: "ppe_cards");

            migrationBuilder.DropIndex(
                name: "ix_inventory_ppe_lines_card_norm_row",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "norm_set_id",
                schema: "inventory",
                table: "ppe_cards");

            migrationBuilder.DropColumn(
                name: "version",
                schema: "inventory",
                table: "ppe_cards");

            migrationBuilder.DropColumn(
                name: "card_norm_row_id",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "issue_method",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "returned_at",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "returned_quantity",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "size_text",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "write_off_act_date",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "write_off_act_number",
                schema: "inventory",
                table: "ppe_card_lines");
        }
    }
}

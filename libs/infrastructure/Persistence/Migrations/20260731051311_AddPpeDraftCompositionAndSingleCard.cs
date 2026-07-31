using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPpeDraftCompositionAndSingleCard : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "last_issue_batch_key",
                schema: "inventory",
                table: "ppe_cards",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "draft_brand_model_article",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                type: "character varying(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "draft_comment",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                type: "character varying(1200)",
                maxLength: 1200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "draft_issue_method",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "personal");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "draft_issued_at",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "draft_quantity",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                type: "numeric(12,3)",
                precision: 12,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "draft_size_text",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<long>(
                name: "draft_unit_price_minor",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "draft_warehouse_id",
                schema: "inventory",
                table: "ppe_card_norm_rows",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(@"
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY employee_id
        ORDER BY CASE WHEN status = 'active' THEN 0 WHEN status = 'draft' THEN 1 ELSE 2 END, created_at, id
    ) AS row_number
    FROM inventory.ppe_cards
    WHERE archived_at IS NULL
)
UPDATE inventory.ppe_cards AS card
SET status = 'archived', archived_at = NOW()
FROM ranked
WHERE card.id = ranked.id AND ranked.row_number > 1;
");

            migrationBuilder.CreateIndex(
                name: "ux_inventory_ppe_cards_employee_active",
                schema: "inventory",
                table: "ppe_cards",
                column: "employee_id",
                unique: true,
                filter: "archived_at IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_inventory_ppe_cards_employee_active",
                schema: "inventory",
                table: "ppe_cards");

            migrationBuilder.DropColumn(
                name: "last_issue_batch_key",
                schema: "inventory",
                table: "ppe_cards");

            migrationBuilder.DropColumn(
                name: "draft_brand_model_article",
                schema: "inventory",
                table: "ppe_card_norm_rows");

            migrationBuilder.DropColumn(
                name: "draft_comment",
                schema: "inventory",
                table: "ppe_card_norm_rows");

            migrationBuilder.DropColumn(
                name: "draft_issue_method",
                schema: "inventory",
                table: "ppe_card_norm_rows");

            migrationBuilder.DropColumn(
                name: "draft_issued_at",
                schema: "inventory",
                table: "ppe_card_norm_rows");

            migrationBuilder.DropColumn(
                name: "draft_quantity",
                schema: "inventory",
                table: "ppe_card_norm_rows");

            migrationBuilder.DropColumn(
                name: "draft_size_text",
                schema: "inventory",
                table: "ppe_card_norm_rows");

            migrationBuilder.DropColumn(
                name: "draft_unit_price_minor",
                schema: "inventory",
                table: "ppe_card_norm_rows");

            migrationBuilder.DropColumn(
                name: "draft_warehouse_id",
                schema: "inventory",
                table: "ppe_card_norm_rows");
        }
    }
}

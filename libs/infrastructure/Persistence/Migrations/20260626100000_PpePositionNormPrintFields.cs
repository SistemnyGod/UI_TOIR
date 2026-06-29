using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(Patrol360DbContext))]
    [Migration("20260626100000_PpePositionNormPrintFields")]
    /// <inheritdoc />
    public partial class PpePositionNormPrintFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "issue_period_text",
                schema: "inventory",
                table: "position_norms",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "norm_item_name",
                schema: "inventory",
                table: "position_norms",
                type: "character varying(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "norm_point",
                schema: "inventory",
                table: "position_norms",
                type: "character varying(240)",
                maxLength: 240,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "quantity_text",
                schema: "inventory",
                table: "position_norms",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                UPDATE inventory.position_norms norms
                SET norm_item_name = LEFT(COALESCE(NULLIF(items.norm_item_name, ''), norms.norm_item_name), 500),
                    quantity_text = LEFT(CASE
                        WHEN NULLIF(norms.quantity_text, '') IS NULL THEN trim(trailing '.' from trim(trailing '0' from norms.quantity::text))
                        ELSE norms.quantity_text
                    END, 80)
                FROM inventory.items items
                WHERE norms.item_id = items.id
                  AND NULLIF(norms.norm_item_name, '') IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "issue_period_text",
                schema: "inventory",
                table: "position_norms");

            migrationBuilder.DropColumn(
                name: "norm_item_name",
                schema: "inventory",
                table: "position_norms");

            migrationBuilder.DropColumn(
                name: "norm_point",
                schema: "inventory",
                table: "position_norms");

            migrationBuilder.DropColumn(
                name: "quantity_text",
                schema: "inventory",
                table: "position_norms");
        }
    }
}

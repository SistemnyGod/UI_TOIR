using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(Patrol360DbContext))]
    [Migration("20260601093000_PpeLinePrintFields")]
    /// <inheritdoc />
    public partial class PpeLinePrintFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "print_item_name",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "character varying(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "norm_point",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "character varying(240)",
                maxLength: 240,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "issue_period_text",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "character varying(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql("""
                UPDATE inventory.ppe_card_lines lines
                SET print_item_name = LEFT(COALESCE(NULLIF(lines.print_item_name, ''), items.name, ''), 600),
                    norm_point = LEFT(COALESCE(NULLIF(lines.norm_point, ''), NULLIF(lines.comment, ''), NULLIF(items.norm_item_name, ''), 'п. 1645 Приложения № 1'), 240),
                    issue_period_text = LEFT(
                        CASE
                            WHEN NULLIF(lines.issue_period_text, '') IS NOT NULL THEN lines.issue_period_text
                            WHEN items.default_life_months = 6 THEN 'раз в 6 месяцев'
                            WHEN items.default_life_months = 12 THEN 'раз в год'
                            WHEN items.default_life_months = 24 THEN 'раз в 2 года'
                            WHEN items.default_life_months = 36 THEN 'раз в 3 года'
                            WHEN items.default_life_months > 0 THEN 'на ' || items.default_life_months || ' мес.'
                            ELSE 'по сроку носки'
                        END,
                        160)
                FROM inventory.items items
                WHERE lines.item_id = items.id;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "print_item_name",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "norm_point",
                schema: "inventory",
                table: "ppe_card_lines");

            migrationBuilder.DropColumn(
                name: "issue_period_text",
                schema: "inventory",
                table: "ppe_card_lines");
        }
    }
}

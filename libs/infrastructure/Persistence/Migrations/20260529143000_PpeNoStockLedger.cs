using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(Patrol360DbContext))]
    [Migration("20260529143000_PpeNoStockLedger")]
    /// <inheritdoc />
    public partial class PpeNoStockLedger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "unit_price_minor",
                schema: "inventory",
                table: "ppe_card_lines",
                type: "bigint",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE inventory.ppe_card_lines lines
                SET unit_price_minor = items.default_unit_price_minor
                FROM inventory.items items
                WHERE lines.item_id = items.id
                  AND lines.unit_price_minor IS NULL;

                UPDATE inventory.ppe_card_lines
                SET issued_at = NULL
                WHERE status <> 'issued'
                  AND issued_at IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "unit_price_minor",
                schema: "inventory",
                table: "ppe_card_lines");
        }
    }
}

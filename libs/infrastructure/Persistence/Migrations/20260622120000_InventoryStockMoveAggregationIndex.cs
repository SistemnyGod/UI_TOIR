using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations
{
    [Migration("20260622120000_InventoryStockMoveAggregationIndex")]
    public partial class InventoryStockMoveAggregationIndex : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_inventory_stock_moves_item_warehouse_type",
                schema: "inventory",
                table: "stock_moves",
                columns: new[] { "item_id", "warehouse_id", "move_type" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_inventory_stock_moves_item_warehouse_type",
                schema: "inventory",
                table: "stock_moves");
        }
    }
}

using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260522215900_InventorySystemLogAuditFilters")]
public partial class InventorySystemLogAuditFilters : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateIndex(
            name: "ix_inventory_system_log_created_at",
            schema: "inventory",
            table: "system_log",
            column: "created_at");

        migrationBuilder.CreateIndex(
            name: "ix_inventory_system_log_action",
            schema: "inventory",
            table: "system_log",
            column: "action");

        migrationBuilder.CreateIndex(
            name: "ix_inventory_system_log_actor",
            schema: "inventory",
            table: "system_log",
            column: "actor");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_inventory_system_log_actor",
            schema: "inventory",
            table: "system_log");

        migrationBuilder.DropIndex(
            name: "ix_inventory_system_log_action",
            schema: "inventory",
            table: "system_log");

        migrationBuilder.DropIndex(
            name: "ix_inventory_system_log_created_at",
            schema: "inventory",
            table: "system_log");
    }
}

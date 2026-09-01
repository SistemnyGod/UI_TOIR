using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Patrol360.Infrastructure.Persistence;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260831120000_PerformanceSearchIndexes")]
public partial class PerformanceSearchIndexes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS pg_trgm;");

        migrationBuilder.AddColumn<string>(
            name: "search_text",
            schema: "inventory",
            table: "items",
            type: "text",
            nullable: false,
            computedColumnSql: "lower(name || ' ' || sku || ' ' || article || ' ' || item_kind || ' ' || norm_item_name || ' ' || actual_item_name || ' ' || brand_name || ' ' || model_name || ' ' || protection_class || ' ' || comment)",
            stored: true);

        migrationBuilder.AddColumn<string>(
            name: "search_text",
            table: "patrol_requests",
            type: "text",
            nullable: false,
            computedColumnSql: "lower(number || ' ' || employee_name || ' ' || route_name || ' ' || description)",
            stored: true);

        migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_inventory_items_search_text_trgm ON inventory.items USING gin (search_text gin_trgm_ops);");
        migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_patrol_requests_search_text_trgm ON patrol_requests USING gin (search_text gin_trgm_ops);");
        migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_employees_full_name_trgm ON employees USING gin (full_name gin_trgm_ops);");
        migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_routes_name_trgm ON routes USING gin (name gin_trgm_ops);");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP INDEX IF EXISTS inventory.ix_inventory_items_search_text_trgm;");
        migrationBuilder.Sql("DROP INDEX IF EXISTS ix_patrol_requests_search_text_trgm;");
        migrationBuilder.Sql("DROP INDEX IF EXISTS ix_employees_full_name_trgm;");
        migrationBuilder.Sql("DROP INDEX IF EXISTS ix_routes_name_trgm;");

        migrationBuilder.DropColumn(name: "search_text", schema: "inventory", table: "items");
        migrationBuilder.DropColumn(name: "search_text", table: "patrol_requests");
    }
}

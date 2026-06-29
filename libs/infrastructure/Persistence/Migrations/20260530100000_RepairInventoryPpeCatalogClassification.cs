using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260530100000_RepairInventoryPpeCatalogClassification")]
public partial class RepairInventoryPpeCatalogClassification : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE inventory.items item
            SET item_kind = 'ppe',
                track_life = TRUE
            FROM inventory.categories category
            WHERE item.category_id = category.id
              AND item.is_active = TRUE
              AND (
                  category.name ILIKE '%сиз%'
                  OR category.name ILIKE '%спецодеж%'
                  OR category.name ILIKE '%ppe%'
              );

            UPDATE inventory.items item
            SET track_life = FALSE
            FROM inventory.categories category
            WHERE item.category_id = category.id
              AND item.is_active = TRUE
              AND COALESCE(lower(item.item_kind), '') NOT IN ('ppe', 'siz')
              AND category.name NOT ILIKE '%сиз%'
              AND category.name NOT ILIKE '%спецодеж%'
              AND category.name NOT ILIKE '%ppe%';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE inventory.items
            SET track_life = TRUE
            WHERE is_active = TRUE;
            """);
    }
}

using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Patrol360.Infrastructure.Persistence.Migrations;

[DbContext(typeof(Patrol360DbContext))]
[Migration("20260526210000_UniqueRoutePointNfcCode")]
public partial class UniqueRoutePointNfcCode : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS ix_route_points_nfc_code;
            DROP INDEX IF EXISTS ux_route_points_nfc_code;
            CREATE UNIQUE INDEX IF NOT EXISTS ux_route_points_route_nfc_code
                ON route_points (route_id, nfc_code)
                WHERE nfc_code IS NOT NULL AND nfc_code <> '';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS ux_route_points_route_nfc_code;
            CREATE INDEX IF NOT EXISTS ix_route_points_nfc_code
                ON route_points (nfc_code);
            """);
    }
}
